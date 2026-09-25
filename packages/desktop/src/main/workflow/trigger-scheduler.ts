import {
  isWorkflowEnabled,
  nextCronFireTimes,
  type ForgePull,
  type ForgeSubscriptionKind,
  type GitOpResult,
  type Workflow,
  type WorkflowNode,
  type WorkflowRun,
  type WorkflowTriggerForgePrEvent,
} from '@midnite/studio-shared';

import { repoForge } from '../ipc/forge-handlers';
import type { Logger } from '../log';
import { defaultLogger } from '../log';
import { listPulls } from '../forge/github/gh-cli';
import type { ForgePoller } from '../forge/forge-poller';
import { isWorkflowRunning, runWorkflow } from '../workflow-service';

/**
 * The trigger node's own arming mechanism (Phase 97 Theme H) — a `schedule`
 * trigger's cron timer, and a `forge-pr` trigger's subscription onto the
 * existing `ForgePoller`. Neither ever fires while `isWorkflowRunning` says
 * this workflow already has a live run — that skip is logged (and kept as
 * the last-known reason, {@link TriggerScheduler.lastTriggerSkip}) rather than
 * queued, exactly like a cron implementation that never replays a missed tick.
 *
 * Structured like `fetch-scheduler.ts`/`forge-poller.ts`: everything that
 * reaches outside this module is injected ({@link TriggerSchedulerDeps}), so
 * `trigger-scheduler.test.ts` can drive the clock, the forge and the run
 * outcome deterministically. `main/index.ts` wires {@link createTriggerScheduler}
 * once at boot, over the SAME `ForgePoller` instance every window's own
 * `forgeChanged` subscription already runs on — there is no second poller.
 */

/** Never a real `BrowserWindow.id` (those are small positive integers) — reserved for this module's own subscription. */
export const TRIGGER_SCHEDULER_SUBSCRIBER_ID = -1;

/** The trigger node's own output for a `forge-pr` fire — `headRef` is `ForgePull.headBranch`, renamed to match the phase doc's own field name. */
export type WorkflowForgePrTriggerOutput = {
  number: number;
  title: string;
  headRef: string;
  url: string;
  author: string;
};

export type TriggerSkip = { at: number; reason: 'already-running' };

export type TriggerSchedulerDeps = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Does this workflow already have a live run? The skip-while-running gate. */
  isWorkflowRunning: (workflowId: string) => Promise<boolean>;
  runWorkflow: (workflowId: string, triggerPayload?: unknown) => Promise<GitOpResult<WorkflowRun>>;
  /** `ForgePoller.subscribe(repoId, 'pulls', TRIGGER_SCHEDULER_SUBSCRIBER_ID)`. */
  subscribeForgePulls: (repoId: string) => void;
  /** `ForgePoller.unsubscribe(repoId, 'pulls', TRIGGER_SCHEDULER_SUBSCRIBER_ID)`. */
  unsubscribeForgePulls: (repoId: string) => void;
  /** `ForgePoller.onChanged` — the SAME subscribe/hash/backoff machinery every window's own `forgeChanged` listener runs on. */
  onForgeChanged: (listener: (repoId: string, kind: ForgeSubscriptionKind) => void) => () => void;
  /** One-shot: the repo's currently-open pull requests, or `null` on any resolution/listing failure (not a failure worth surfacing — the next change notification tries again). */
  fetchOpenPulls: (repoId: string) => Promise<ForgePull[] | null>;
  log: Logger;
};

function findTriggerNode(workflow: Workflow): (WorkflowNode & { kind: 'trigger' }) | undefined {
  return workflow.nodes.find((n): n is WorkflowNode & { kind: 'trigger' } => n.kind === 'trigger');
}

/** A `*`-glob over a branch name — `release/*` matches `release/1.2`, `release` does not. Unset matches everything. */
export function matchesBranchFilter(headRef: string, filter: string | undefined): boolean {
  if (filter === undefined) return true;
  const pattern = `^${filter.split('*').map(escapeRegExp).join('.*')}$`;
  return new RegExp(pattern).test(headRef);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The fields that make a PR row "different" for `updated` purposes — everything a forge event realistically changes bar its number/branch/author. */
type PrSnapshot = {
  title: string;
  headBranch: string;
  state: string;
  reviewDecision: string | null;
  checks: string | null;
  mergedAt: string | null;
  closedAt: string | null;
};

function snapshotOf(pull: ForgePull): PrSnapshot {
  return {
    title: pull.title,
    headBranch: pull.headBranch,
    state: pull.state,
    reviewDecision: pull.reviewDecision,
    checks: pull.checks,
    mergedAt: pull.mergedAt,
    closedAt: pull.closedAt,
  };
}

function snapshotsEqual(a: PrSnapshot, b: PrSnapshot): boolean {
  return (
    a.title === b.title &&
    a.headBranch === b.headBranch &&
    a.state === b.state &&
    a.reviewDecision === b.reviewDecision &&
    a.checks === b.checks &&
    a.mergedAt === b.mergedAt &&
    a.closedAt === b.closedAt
  );
}

function forgePrTriggerOutput(pull: ForgePull): WorkflowForgePrTriggerOutput {
  return { number: pull.number, title: pull.title, headRef: pull.headBranch, url: pull.url, author: pull.author };
}

type ScheduleState = { cron: string; timer: unknown };

/** One workflow's `forge-pr` trigger, as reconciled — everything needed to decide whether a changed PR should fire it. */
type ForgePrWatch = {
  workflowId: string;
  events: readonly WorkflowTriggerForgePrEvent[];
  branchFilter: string | undefined;
};

export class TriggerScheduler {
  private readonly schedules = new Map<string, ScheduleState>(); // workflowId -> state
  private readonly forgeWatches = new Map<string, ForgePrWatch[]>(); // repoId -> watching workflows
  private readonly prSnapshots = new Map<string, Map<number, PrSnapshot>>(); // repoId -> PR number -> last-seen snapshot
  private readonly lastSkips = new Map<string, TriggerSkip>(); // workflowId -> most recent skip
  private readonly unsubscribeForgeChanged: () => void;

  constructor(private readonly deps: TriggerSchedulerDeps) {
    this.unsubscribeForgeChanged = this.deps.onForgeChanged((repoId, kind) => {
      if (kind !== 'pulls') return;
      void this.handleForgeChanged(repoId);
    });
  }

  /** Why a workflow's trigger last declined to fire, e.g. for a future run-panel/bell surface — `null` if it never has. */
  lastTriggerSkip(workflowId: string): TriggerSkip | null {
    return this.lastSkips.get(workflowId) ?? null;
  }

  /** Bring every timer and forge subscription in line with the current, enabled workflow set — mirrors `FetchScheduler.reconcile`. */
  reconcile(workflows: readonly Workflow[]): void {
    this.reconcileSchedules(workflows);
    this.reconcileForgeWatches(workflows);
  }

  /** Stops every timer and forge subscription — the whole scheduler is going away (never called in production; test/teardown only). */
  dispose(): void {
    for (const workflowId of [...this.schedules.keys()]) this.stopSchedule(workflowId);
    for (const repoId of [...this.forgeWatches.keys()]) this.deps.unsubscribeForgePulls(repoId);
    this.forgeWatches.clear();
    this.prSnapshots.clear();
    this.unsubscribeForgeChanged();
  }

  // --- schedule ----------------------------------------------------------------

  private reconcileSchedules(workflows: readonly Workflow[]): void {
    const wanted = new Map<string, string>(); // workflowId -> cron
    for (const workflow of workflows) {
      if (!isWorkflowEnabled(workflow)) continue;
      const trigger = findTriggerNode(workflow);
      if (trigger?.config.on === 'schedule') wanted.set(workflow.id, trigger.config.cron);
    }

    for (const workflowId of [...this.schedules.keys()]) {
      if (!wanted.has(workflowId)) this.stopSchedule(workflowId);
    }
    for (const [workflowId, cron] of wanted) {
      if (this.schedules.get(workflowId)?.cron === cron) continue; // unchanged — leave its current timer alone
      this.startSchedule(workflowId, cron);
    }
  }

  private startSchedule(workflowId: string, cron: string): void {
    this.stopSchedule(workflowId);
    const state: ScheduleState = { cron, timer: null };
    this.schedules.set(workflowId, state);
    this.arm(workflowId, state);
  }

  private stopSchedule(workflowId: string): void {
    const state = this.schedules.get(workflowId);
    if (state?.timer !== undefined && state?.timer !== null) this.deps.clearTimeout(state.timer);
    this.schedules.delete(workflowId);
  }

  /** One timer to the NEXT due tick — never a poll, and a missed tick (the app was closed) is never replayed: the next fire is always computed from `now`. */
  private arm(workflowId: string, state: ScheduleState): void {
    const [nextAt] = nextCronFireTimes(state.cron, this.deps.now(), 1);
    if (nextAt === undefined) {
      this.deps.log.warn(`[trigger] workflow ${workflowId} — cron "${state.cron}" never fires; not armed.`);
      return;
    }
    const delay = Math.max(0, nextAt - this.deps.now());
    state.timer = this.deps.setTimeout(() => void this.fireSchedule(workflowId), delay);
  }

  private async fireSchedule(workflowId: string): Promise<void> {
    const state = this.schedules.get(workflowId);
    if (!state) return;
    // Re-armed to the next tick BEFORE attempting this one, so a skip (or a
    // slow run) never stalls every future tick behind it.
    this.arm(workflowId, state);
    await this.attemptFire(workflowId);
  }

  // --- forge-pr ------------------------------------------------------------------

  private reconcileForgeWatches(workflows: readonly Workflow[]): void {
    const wanted = new Map<string, ForgePrWatch[]>(); // repoId -> watches
    for (const workflow of workflows) {
      if (!isWorkflowEnabled(workflow)) continue;
      const trigger = findTriggerNode(workflow);
      if (trigger?.config.on !== 'forge-pr') continue;
      const watch: ForgePrWatch = {
        workflowId: workflow.id,
        events: trigger.config.events,
        branchFilter: trigger.config.branchFilter,
      };
      const list = wanted.get(trigger.config.repoId) ?? [];
      list.push(watch);
      wanted.set(trigger.config.repoId, list);
    }

    for (const repoId of [...this.forgeWatches.keys()]) {
      if (!wanted.has(repoId)) {
        this.deps.unsubscribeForgePulls(repoId);
        this.forgeWatches.delete(repoId);
        this.prSnapshots.delete(repoId);
      }
    }
    for (const [repoId, watches] of wanted) {
      if (!this.forgeWatches.has(repoId)) {
        this.deps.subscribeForgePulls(repoId);
        void this.seedSnapshot(repoId);
      }
      this.forgeWatches.set(repoId, watches);
    }
  }

  /** A silent first read right after subscribing — so the FIRST real change notification has something to diff against, and every PR already open when the app started never "fires" as newly opened. */
  private async seedSnapshot(repoId: string): Promise<void> {
    const pulls = await this.deps.fetchOpenPulls(repoId);
    if (!pulls) return;
    this.prSnapshots.set(repoId, new Map(pulls.map((pull) => [pull.number, snapshotOf(pull)])));
  }

  private async handleForgeChanged(repoId: string): Promise<void> {
    const watches = this.forgeWatches.get(repoId);
    if (!watches || watches.length === 0) return; // not (or no longer) anything this scheduler cares about

    const pulls = await this.deps.fetchOpenPulls(repoId);
    if (!pulls) return;
    const previous = this.prSnapshots.get(repoId) ?? new Map<number, PrSnapshot>();
    this.prSnapshots.set(repoId, new Map(pulls.map((pull) => [pull.number, snapshotOf(pull)])));

    for (const pull of pulls) {
      const prior = previous.get(pull.number);
      const event: WorkflowTriggerForgePrEvent | null = !prior
        ? 'opened'
        : snapshotsEqual(prior, snapshotOf(pull))
          ? null
          : 'updated';
      if (event === null) continue;

      for (const watch of watches) {
        if (!watch.events.includes(event)) continue;
        if (!matchesBranchFilter(pull.headBranch, watch.branchFilter)) continue;
        await this.attemptFire(watch.workflowId, forgePrTriggerOutput(pull));
      }
    }
  }

  // --- shared fire path --------------------------------------------------------

  private async attemptFire(workflowId: string, triggerPayload?: unknown): Promise<void> {
    if (await this.deps.isWorkflowRunning(workflowId)) {
      this.lastSkips.set(workflowId, { at: this.deps.now(), reason: 'already-running' });
      this.deps.log.info(`[trigger] workflow ${workflowId} skipped — a run is already in progress.`);
      return;
    }
    await this.deps.runWorkflow(workflowId, triggerPayload);
  }

  /** Test/diagnostics only. */
  scheduleCountForTests(): number {
    return this.schedules.size;
  }

  /** Test/diagnostics only. */
  forgeWatchRepoCountForTests(): number {
    return this.forgeWatches.size;
  }
}

/**
 * The real wiring — the SAME `ForgePoller` instance `main/index.ts` already
 * built for window subscriptions, `workflow-service.ts`'s own run functions,
 * and `gh-cli.ts`'s `listPulls` (the identical GitHub-only data source
 * `forge-poller.ts`'s own `pollOnce('pulls')` already reads from — not Theme
 * D's multi-forge `resolveAdapter`, which would be fixing that pre-existing
 * scope limitation, not this theme's job).
 */
export function createTriggerScheduler(forgePoller: ForgePoller, log: Logger = defaultLogger): TriggerScheduler {
  return new TriggerScheduler({
    now: () => Date.now(),
    setTimeout: (fn, ms) => {
      const timer = setTimeout(fn, ms);
      (timer as { unref?: () => void }).unref?.();
      return timer;
    },
    clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
    isWorkflowRunning,
    runWorkflow,
    subscribeForgePulls: (repoId) => forgePoller.subscribe(repoId, 'pulls', TRIGGER_SCHEDULER_SUBSCRIBER_ID),
    unsubscribeForgePulls: (repoId) => forgePoller.unsubscribe(repoId, 'pulls', TRIGGER_SCHEDULER_SUBSCRIBER_ID),
    onForgeChanged: (listener) => forgePoller.onChanged(listener),
    fetchOpenPulls: async (repoId) => {
      const forge = await repoForge(repoId);
      if (!forge) return null;
      const result = await listPulls(forge, { limit: 100, state: 'open' });
      if (result.error !== null) return null;
      return result.pulls;
    },
    log,
  });
}

/**
 * The one real instance, built once at boot (`main/index.ts`) — module-level
 * functions mirror `fetch-scheduler.ts`'s own free-function shape, so
 * `workflow-service.ts`'s `onWorkflowsChanged` hook can reconcile it without
 * threading an instance through.
 */
let singleton: TriggerScheduler | null = null;

export function initTriggerScheduler(forgePoller: ForgePoller, log?: Logger): TriggerScheduler {
  singleton = createTriggerScheduler(forgePoller, log);
  return singleton;
}

export function reconcileTriggerScheduler(workflows: readonly Workflow[]): void {
  singleton?.reconcile(workflows);
}

export function lastTriggerSkip(workflowId: string): TriggerSkip | null {
  return singleton?.lastTriggerSkip(workflowId) ?? null;
}
