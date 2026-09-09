import {
  emptyCompanionSnapshot,
  type AgentDefinition,
  type CompanionSnapshot,
  type RepoDescriptor,
  type SessionActivity,
} from '@midnite/studio-shared';

import { greet, orient, say, type ConciergeDeps } from './concierge';
import {
  createHandoffTracker,
  readBack,
  repeatLast,
  startNudgeSentence,
  submitInput,
  HANDOFF_START_GRACE_MS,
  type HandoffDeps,
} from './handoff';
import { silentSpeaker, type Speaker } from './ports';
import { skillHandoff } from '../agent/use-skill-handoff';
import { startAgent } from '../terminal/start-agent';
import { useTerminalStore } from '../terminal/terminal-store';
import { bridge } from '../../services/bridge';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';

/**
 * The live wiring — Phase 79 Themes D and E.
 *
 * Everything the panel, the FAB and the voice half call is a **plain
 * function** here, over `getState()` and `bridge()`. No hooks, no context, no
 * provider. Two reasons, and neither is style.
 *
 * A companion turn outlives the render that started it: the flow awaits a
 * snapshot, then a digest, then a spoken sentence, and any component that
 * could have called a hook has re-rendered several times by the time the
 * digest lands. `start-agent.ts` is written as a plain function over
 * `getState()` for the identical reason and says so.
 *
 * And the entry points are a **contract with two sibling themes**. Theme C's
 * input bar calls `submitCompanionInput` from its `onSubmit`; Theme F's
 * `speaker.ts` registers itself through `setCompanionSpeaker`. Neither can
 * import a hook, and neither should have to know what a `ConciergeDeps` is.
 */

// --- the speaker port ------------------------------------------------------

let speaker: Speaker = silentSpeaker;

/**
 * Register the real speaker (Theme F), or `null` to go back to silence.
 *
 * Until this is called the companion runs its whole flow with
 * {@link silentSpeaker}: every turn is posted, none is marked `spoken`, and
 * the thread reads exactly as it will once there is a voice. That is not a
 * stub — voice off is the default configuration of this feature, and it has to
 * be the ordinary path rather than a branch.
 */
export function setCompanionSpeaker(next: Speaker | null): void {
  speaker = next ?? silentSpeaker;
}

export function companionSpeaker(): Speaker {
  return speaker;
}

// --- the interrupt token ---------------------------------------------------

/**
 * The run in flight, and how to stop it.
 *
 * One controller at a time: starting a new script aborts the old one, because
 * two overlapping scripts speaking into one thread is the failure mode this
 * exists to prevent. Every `await` in `concierge.ts` and `handoff.ts` checks
 * `signal.aborted`, so an abort takes effect at the next boundary rather than
 * needing a cancellable promise everywhere.
 */
let controller: AbortController | null = null;

function begin(): AbortSignal {
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

/**
 * Cancel whatever the companion is saying — Escape, a mic press, a second
 * click on the speaking FAB, or a spoken "stop".
 *
 * Both halves are needed: `speaker.cancel()` stops the audio that is already
 * playing, and the abort stops the *script* from queueing the next four
 * sentences behind it.
 */
export function cancelCompanionSpeech(): void {
  speaker.cancel();
  controller?.abort();
  useCompanionStore.getState().send('interrupt');
}

// --- deps, assembled from the live stores ----------------------------------

function conciergeDeps(signal: AbortSignal, repo: RepoSnapshot): ConciergeDeps {
  const api = bridge();
  return {
    store: useCompanionStore.getState(),
    speaker,
    // A missing bridge (jsdom, the e2e harness) answers the "no repo open"
    // snapshot rather than throwing — the same posture every other
    // bridge-reading helper in the renderer takes.
    snapshot: async (repoPath) =>
      (await api?.companion.snapshot({ repoPath })) ?? emptyCompanionSnapshot(),
    digest: async (req) =>
      (await api?.companion.digest(req)) ?? { landed: [], inProgress: [], since: Date.now() },
    settings: () => {
      const ui = useUiStore.getState();
      return {
        honorifics: ui.companionHonorifics,
        handsFree: ui.companionHandsFree,
        voiceInReady: voiceInReady(),
      };
    },
    repo: () => repo,
    signal,
  };
}

function handoffDeps(signal: AbortSignal, repo: RepoSnapshot): HandoffDeps {
  const api = bridge();
  const base = conciergeDeps(signal, repo);

  return {
    ...base,
    startSkill: (opts) => {
      const ui = useUiStore.getState();
      return skillHandoff(
        {
          skillId: opts.skillId,
          ...(repo.id === null ? {} : { repoId: repo.id }),
          ...(repo.path === null ? {} : { cwd: repo.path }),
          ...(opts.body === undefined ? {} : { body: opts.body }),
          autoSend: opts.autoSend,
        },
        {
          skills: ui.agentSkills as Record<string, string | undefined>,
          primaryAgentId: ui.primaryAgent,
          agents: rosterCache,
        },
      );
    },
    startVerbatim: (text) => {
      if (repo.id === null || repo.path === null) return null;
      const ui = useUiStore.getState();
      const agent =
        rosterCache.find((entry) => entry.id === ui.primaryAgent) ?? rosterCache[0];
      if (!agent) return null;
      return startAgent({
        repoId: repo.id,
        cwd: repo.path,
        title: 'Companion',
        prompt: text,
        agentId: agent.id,
        command: agent.command,
        autoSend: false,
      });
    },
    ask: async (req) => {
      const ui = useUiStore.getState();
      const result = await api?.companion.ask({
        kind: req.kind,
        text: req.text,
        repoPath: repo.path,
        agentId: ui.primaryAgent,
        snapshot: lastSnapshot,
      });
      return result ?? { ok: false, kind: 'error', message: 'The companion is not connected.' };
    },
    scrollback: async (sessionId) => {
      const ptyId = useTerminalStore.getState().ptyIds[sessionId];
      if (!ptyId || !api) return null;
      const answer = await api.pty.snapshot({ ptyId });
      return new TextDecoder().decode(answer.bytes);
    },
    markers: (sessionId) => {
      const terminal = useTerminalStore.getState();
      const agentId =
        terminal.liveAgentId[sessionId] ??
        terminal.sessions.find((session) => session.id === sessionId)?.agentId ??
        null;
      const activity = rosterCache.find((entry) => entry.id === agentId)?.activity;
      if (!activity) return undefined;
      return {
        ...(activity.awaitingInput === undefined ? {} : { awaitingInput: activity.awaitingInput }),
        frameEnd: activity.frameEnd,
      };
    },
    repos: async () => (await api?.repos.list()) ?? [],
    selectRepo: (repoId) => useUiStore.getState().selectRepo(repoId),
    autoSendAllowed: () => useUiStore.getState().companionHandsFree && voiceInReady(),
    activeHandoff: () => useCompanionStore.getState().activeHandoff,
    setActiveHandoff: (handoff) => useCompanionStore.getState().setActiveHandoff(handoff),
  };
}

/**
 * Whether anything is actually listening.
 *
 * Theme F owns the answer and has not landed yet, so this reads `false` until
 * it does — which is the *correct* answer today and the safe one either way:
 * it is the third condition on `autoSend: true`, so until a provider exists,
 * nothing this companion starts can run without a human Return.
 *
 * Left as one named function rather than an inline `false` so Theme F's wiring
 * is a one-line change with an obvious home.
 */
function voiceInReady(): boolean {
  return false;
}

// --- the repo the flow is about --------------------------------------------

type RepoSnapshot = { path: string | null; name: string | null; id: string | null };

/**
 * The roster and the last snapshot, cached at the top of each flow.
 *
 * Both are read once per run and then used from several places inside it (the
 * hand-off needs the roster to resolve an agent, the read-back needs it for
 * the activity markers, `ask` needs the snapshot as grounding). Fetching them
 * per call would put an IPC round-trip inside a loop over spoken sentences.
 */
let rosterCache: readonly AgentDefinition[] = [];
let lastSnapshot: CompanionSnapshot | null = null;

async function currentRepo(): Promise<RepoSnapshot> {
  const api = bridge();
  const selected = useUiStore.getState().selectedRepoId;
  const repos: readonly RepoDescriptor[] = (await api?.repos.list()) ?? [];
  const repo = repos.find((entry) => entry.id === selected) ?? repos[0] ?? null;
  if (!repo) return { path: null, name: null, id: null };
  const main = repo.worktrees.find((worktree) => worktree.isMain);
  return { path: main?.path ?? repo.path, name: repo.name, id: repo.id };
}

/** Refresh the roster cache. Cheap, and the answer changes only on an `agents.json` edit. */
async function refreshRoster(): Promise<void> {
  const answer = await bridge()?.agent.list();
  if (answer) rosterCache = answer.agents;
}

// --- the entry points siblings call ---------------------------------------

/**
 * Run one flow, and land the machine somewhere sane whatever it throws.
 *
 * **Every entry point below is called as `void f()`** — the panel's `onSubmit`,
 * the ports registry, an effect — so a rejection is an unhandled promise
 * rejection with nothing to catch it. The consequence is not a logged error, it
 * is a **wedged state machine**: `greet` moves the machine to `greeting`, and a
 * throw two awaits later leaves it there forever, with the header reading
 * "Saying hello…" and nothing able to move it but the master switch.
 *
 * That is not hypothetical. A bridge without the `companion` namespace — an
 * older preload, or the e2e harness before its mock grew one — makes
 * `api.companion.snapshot` a TypeError on the first await of the greeting, and
 * that is exactly how it failed.
 *
 * `settle` rather than `interrupt`: nothing was interrupted, the flow simply
 * could not finish. And the sentence is posted rather than swallowed, because a
 * companion that stops mid-greeting and says nothing is indistinguishable from
 * one that has crashed — which, at that point, it has.
 */
async function guarded(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    useCompanionStore.getState().addTurn({
      role: 'companion',
      text: `Something went wrong on my end: ${error instanceof Error ? error.message : String(error)}`,
      spoken: false,
    });
    speaker.cancel();
    useCompanionStore.getState().send('settle');
  }
}

/**
 * Greet, orient and offer — Theme C's panel calls this on open.
 *
 * Guarded on `companionEnabled` because the panel can be opened from a
 * command palette entry or a restored layout, and a disabled companion that
 * greets you anyway is the shape of bug that makes a default-off feature feel
 * like it is not.
 */
export async function greetCompanion(): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  await refreshRoster();
  const repo = await currentRepo();
  const deps = conciergeDeps(signal, repo);
  lastSnapshot = null;
  await guarded(() => greet(withSnapshotCapture(deps)));
}

/**
 * Re-orient without greeting — the active repository changed while the panel
 * was open.
 */
export async function reorientCompanion(): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  const repo = await currentRepo();
  await guarded(() => orient(withSnapshotCapture(conciergeDeps(signal, repo))));
}

/**
 * One line of input — Theme C's input bar calls this from `onSubmit`, and
 * Theme F's recogniser will call it with a transcript.
 *
 * Deliberately `Promise<void>` and not a result: the answer is the transcript,
 * which the panel is already rendering, and there is nothing for a caller to
 * branch on.
 */
export async function submitCompanionInput(text: string): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  if (rosterCache.length === 0) await refreshRoster();
  const repo = await currentRepo();
  const deps = withSnapshotCapture(handoffDeps(signal, repo)) as HandoffDeps;
  const before = useCompanionStore.getState().activeHandoff?.sessionId ?? null;

  await guarded(async () => {
    await submitInput(text, deps);

    // A `switchRepo` that landed changes what the companion is looking at, so
    // it re-orients — the same thing that happens when the sidebar selection
    // changes, which is the whole point of `reorientCompanion` existing.
    const after = await currentRepo();
    if (after.id !== repo.id && !signal.aborted) {
      await orient(withSnapshotCapture(conciergeDeps(signal, after)));
      return;
    }

    const handoff = useCompanionStore.getState().activeHandoff;
    if (handoff && handoff.sessionId !== before) armNudge(handoff.sessionId, handoff.command);
  });
}

/**
 * Re-speak the companion's last line — Theme C's assistant-popover "Repeat"
 * row, and the `repeat` intent's own path.
 *
 * Not routed through `submitCompanionInput('repeat')`: that would post the
 * word "repeat" into the thread as a user turn, and pressing a Repeat button
 * is not something the user said.
 */
export async function repeatCompanionLast(): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  const repo = await currentRepo();
  await guarded(() => repeatLast(handoffDeps(signal, repo)));
}

/**
 * Capture the snapshot on its way past, so `ask` has grounding.
 *
 * A wrapper rather than a field on the deps because the snapshot is fetched
 * *inside* the flow, and the router may be called several turns later — by
 * which time the flow that fetched it has returned.
 */
function withSnapshotCapture<T extends ConciergeDeps>(deps: T): T {
  return {
    ...deps,
    snapshot: async (repoPath: string | null) => {
      const answer = await deps.snapshot(repoPath);
      lastSnapshot = answer;
      return answer;
    },
  };
}

// --- watching the hand-off -------------------------------------------------

/**
 * The one subscription this feature needs mounted — `app.tsx` calls it once,
 * the same shape `useAgentActivity()` takes.
 *
 * It watches the **terminal store**, not `pty:activity` and `pty:exit`
 * directly, and that is a deliberate deviation from the phase doc's wording.
 * Those two channels name a `ptyId`; the hand-off names a `sessionId`; and the
 * mapping between them lives in `terminal-store.ts`'s `ptyIds`, maintained by
 * the two always-mounted subscriptions (`use-agent-activity.ts`,
 * `use-session-exits.ts`) that exist precisely because per-view listeners
 * missed events while the terminal panel was collapsed. Subscribing to the
 * same channels a third time would mean re-implementing that ptyId→sessionId
 * invert and re-learning the same bug; subscribing to the store it feeds is
 * the same facts, already keyed the way this feature needs them.
 */
export function watchCompanionHandoff(): () => void {
  const tracker = new Map<string, ReturnType<typeof createHandoffTracker>>();
  let lastActivity: SessionActivity | undefined;
  let lastExit: number | undefined;

  return useTerminalStore.subscribe((state, previous) => {
    const handoff = useCompanionStore.getState().activeHandoff;
    if (!handoff) {
      tracker.clear();
      return;
    }

    const id = handoff.sessionId;
    const activity = state.activity[id];
    const exitCode = state.exitCodes[id];
    const activityChanged = activity !== previous.activity[id] || activity !== lastActivity;
    const exited = exitCode !== undefined && exitCode !== lastExit;
    if (!activityChanged && !exited) return;

    lastActivity = activity;
    lastExit = exitCode;

    const watch = tracker.get(id) ?? createHandoffTracker();
    tracker.set(id, watch);

    const verdict = exited
      ? watch.observe({ kind: 'exit', exitCode: exitCode as number })
      : watch.observe({ kind: 'activity', activity });

    if (verdict !== 'ready' && verdict !== 'ended') return;

    tracker.delete(id);
    clearNudge();
    const signal = begin();
    void currentRepo().then((repo) =>
      guarded(() =>
        readBack(
          withSnapshotCapture(handoffDeps(signal, repo)) as HandoffDeps,
          id,
          exited ? { exitCode: exitCode as number } : {},
        ),
      ),
    );
  });
}

// --- the "did you press Return?" nudge -------------------------------------

let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

function armNudge(sessionId: string, command: string): void {
  clearNudge();
  nudgeTimer = setTimeout(() => {
    nudgeTimer = undefined;
    const store = useCompanionStore.getState();
    const handoff = store.activeHandoff;
    // Still the same hand-off, and still nothing has been generated: the
    // Return is owed.
    if (!handoff || handoff.sessionId !== sessionId) return;
    if (useTerminalStore.getState().activity[sessionId] === 'thinking') return;
    const signal = begin();
    void currentRepo().then((repo) =>
      guarded(() => say(conciergeDeps(signal, repo), startNudgeSentence(command))),
    );
  }, HANDOFF_START_GRACE_MS);
}

function clearNudge(): void {
  if (nudgeTimer !== undefined) clearTimeout(nudgeTimer);
  nudgeTimer = undefined;
}

/** Test-only: the module's timers and caches are otherwise private. */
export function resetCompanionRuntimeForTests(): void {
  clearNudge();
  controller?.abort();
  controller = null;
  speaker = silentSpeaker;
  rosterCache = [];
  lastSnapshot = null;
}
