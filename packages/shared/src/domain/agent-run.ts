import { z } from 'zod';

import type { LoopRunRecord } from '../loops';
import { AGENT_COMMAND_IDS, type AgentCommandId } from './agent-command';
import type { ClosedSession } from './session-history';
import { TestFailureSchema, TestRunReasonSchema } from './tests';

/**
 * `AgentRun` — one vocabulary over the four run records that already
 * disagree: `LoopRunRecord` (`loops.ts`), `CouncilRun` (`council.ts`),
 * `main/workflow-runs-store.ts`'s workflow runs, and `ClosedSession`
 * (`session-history.ts`). Phase 94 finding 3: each has `startedAt`/`endedAt`
 * and none records a verdict — this is the projection that fixes that,
 * without moving any of the four on-disk formats (Decision 2).
 *
 * **This is a projection, not a fifth store.** `fromLoopRun`/`fromClosedSession`
 * below build one from the source record plus whatever context that source
 * doesn't itself carry (a repo id, a label). Theme D reads the other two
 * sources (councils, workflows) through their own adapters when it lands;
 * nothing here migrates `loop-runs.json`, the councils store or
 * `workflow-runs` — they keep their files and their 200-record caps.
 *
 * Also named `AgentRunRecord` (see the alias below) because
 * [Phase 97](../../../../.midnite/tasks/phases/phase-97-workflow-graph-primitives.md)
 * Theme K's own prose refers to it that way; both names resolve to the same
 * type so neither side has to rename.
 */
export const AgentRunKindSchema = z.enum(['loop', 'session', 'council', 'workflow']);
export type AgentRunKind = z.infer<typeof AgentRunKindSchema>;

/**
 * How one run ended — or that it has not. A superset of `LoopRunStatusSchema`
 * (`loops.ts`) plus `abandoned`, for the case `main/loop-runs.ts:54-65`
 * already handles by hand: a record still `running` when the app boots,
 * because the process it named died under it rather than being stopped.
 */
export const AgentRunStatusSchema = z.enum(['running', 'stopped', 'exited', 'abandoned']);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

/** The closed `AgentCommandId` list, wrapped for `AgentRunSchema.skillId`. */
export const AgentCommandIdSchema = z.enum(AGENT_COMMAND_IDS);

/**
 * How a verified run's suite came back. `unavailable` is how
 * `{ ok: false, reason }` (`TestRunResultSchema`, `tests.ts`) arrives without
 * pretending a missing or untrusted suite is a failure — the phase's Theme B
 * asserts a timeout records `unavailable`, never `fail`.
 */
export const AgentRunVerdictOutcomeSchema = z.enum(['pass', 'fail', 'unavailable']);
export type AgentRunVerdictOutcome = z.infer<typeof AgentRunVerdictOutcomeSchema>;

/**
 * The phase's actual point: a run's checked outcome, reusing
 * `TestFailureSchema`/`TestRunReasonSchema` (`tests.ts`) rather than
 * declaring parallel shapes for the same idea.
 */
export const AgentRunVerdictSchema = z.object({
  checkedAt: z.number().int().nonnegative(),
  /** The `TestSuite.id` that was run. */
  suiteId: z.string().min(1),
  outcome: AgentRunVerdictOutcomeSchema,
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  failures: z.array(TestFailureSchema),
  /** Set when `outcome === 'unavailable'` — why nothing usable came back. */
  reason: TestRunReasonSchema.optional(),
});
export type AgentRunVerdict = z.infer<typeof AgentRunVerdictSchema>;

export const AgentRunSchema = z.object({
  id: z.string().min(1),
  kind: AgentRunKindSchema,
  repoId: z.string().min(1),
  cwd: z.string().min(1),
  /** The terminal session that hosted the run, when it had one. */
  sessionId: z.string().min(1).optional(),
  /** Roster agent id (`terminal.ts`'s `BUILTIN_AGENTS`), when known. */
  agentId: z.string().min(1).optional(),
  skillId: AgentCommandIdSchema.optional(),
  label: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
  status: AgentRunStatusSchema,
  exitCode: z.number().int().optional(),
  verdict: AgentRunVerdictSchema.optional(),
  /**
   * The producer's own id — `loopId`, `councilId` or `workflowId` — so
   * projecting into this one shape never loses the record's home key.
   */
  sourceId: z.string().min(1).optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

/**
 * Alias for [Phase 97](../../../../.midnite/tasks/phases/phase-97-workflow-graph-primitives.md)
 * Theme K, which names this type `AgentRunRecord` in its own checklist.
 * `AgentRun` is the name this phase's own checklist uses and the one every
 * other export in this file follows (`AgentRunSchema`, `AgentRunKind`, …);
 * both resolve to the same shape.
 */
export type AgentRunRecord = AgentRun;

// --- selectors -----------------------------------------------------------
//
// Pure, module-level functions — no store, no Electron — following
// `notesForRepo`'s precedent (`app/src/store/notes-store.ts`): a selector is
// a function that takes the list, not a method the list is bolted onto.

export function runsForRepo(runs: readonly AgentRun[], repoId: string): AgentRun[] {
  return runs.filter((run) => run.repoId === repoId);
}

export function runsForSkill(runs: readonly AgentRun[], skillId: AgentCommandId): AgentRun[] {
  return runs.filter((run) => run.skillId === skillId);
}

/**
 * A run carries at most one verdict today (`AgentRun.verdict`); this
 * indirection is the seam if that ever becomes a history, and it reads
 * better at a call site than `run.verdict` does.
 */
export function latestVerdict(run: AgentRun): AgentRunVerdict | undefined {
  return run.verdict;
}

export interface SkillOutcomeTally {
  pass: number;
  fail: number;
  unavailable: number;
}

/**
 * Per-skill pass/fail/unavailable counts across a set of runs. A run with no
 * `skillId` is excluded entirely (it names nothing to tally against); a run
 * with a `skillId` but no `verdict` touches neither counter — it was never
 * checked, which is a different fact from having been checked and found
 * `unavailable`.
 */
export function skillOutcomeTally(runs: readonly AgentRun[]): Map<AgentCommandId, SkillOutcomeTally> {
  const tally = new Map<AgentCommandId, SkillOutcomeTally>();
  for (const run of runs) {
    if (!run.skillId) continue;
    const entry = tally.get(run.skillId) ?? { pass: 0, fail: 0, unavailable: 0 };
    if (run.verdict) {
      if (run.verdict.outcome === 'pass') entry.pass += 1;
      else if (run.verdict.outcome === 'fail') entry.fail += 1;
      else entry.unavailable += 1;
    }
    tally.set(run.skillId, entry);
  }
  return tally;
}

// --- adapters --------------------------------------------------------------
//
// Projections from a source record into an `AgentRun`. Each adapter takes
// "extra" context for the fields the source record doesn't itself carry —
// e.g. a loop run has no `repoId` of its own, only its host session does.

export interface FromLoopRunContext {
  repoId: string;
  cwd: string;
  label: string;
  agentId?: string;
  skillId?: AgentCommandId;
  verdict?: AgentRunVerdict;
}

/**
 * `LoopRunRecord` (`loops.ts`) → `AgentRun`, `kind: 'loop'`. The loop console
 * keeps its own persisted shape (`loop-runs.json`); this is a read-time
 * projection, not a migration. `record.loopId` becomes `sourceId` so the
 * projection can still be traced back to the loop that produced it.
 */
export function fromLoopRun(record: LoopRunRecord, extra: FromLoopRunContext): AgentRun {
  return {
    id: record.id,
    kind: 'loop',
    repoId: extra.repoId,
    cwd: extra.cwd,
    sessionId: record.sessionId,
    agentId: extra.agentId,
    skillId: extra.skillId,
    label: extra.label,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    status: record.status,
    exitCode: record.exitCode,
    verdict: extra.verdict,
    sourceId: record.loopId,
  };
}

/**
 * `ClosedSession.reason` → `AgentRunStatus`. `closed` (the user pressed the
 * session's own `X`) reads as `stopped` — the same "asked to end" meaning
 * `LoopRunStatus`'s `stopped` carries. `exited` maps straight across. A
 * `superseded` session (the FAB collected one a newer loop run replaced) has
 * no direct `LoopRunStatus` counterpart; `abandoned` is the closest existing
 * status — a record left behind rather than one that ran to a decided end.
 */
const CLOSED_SESSION_REASON_TO_STATUS: Record<ClosedSession['reason'], AgentRunStatus> = {
  closed: 'stopped',
  exited: 'exited',
  superseded: 'abandoned',
};

export interface FromClosedSessionContext {
  label?: string;
  skillId?: AgentCommandId;
  verdict?: AgentRunVerdict;
}

/**
 * `ClosedSession` (`session-history.ts`) → `AgentRun`, `kind: 'session'`.
 * Unlike the other three sources, `ClosedSession` already carries its own
 * `repoId`/`cwd` — Phase 94's finding 3 calls it out as the only one of the
 * four that does. `sourceId` is left unset: a closed session has no separate
 * producer id beyond its own, so there is no home key to preserve.
 */
export function fromClosedSession(
  session: ClosedSession,
  extra: FromClosedSessionContext = {},
): AgentRun {
  return {
    id: session.id,
    kind: 'session',
    repoId: session.repoId,
    cwd: session.cwd,
    sessionId: session.id,
    agentId: session.agentId,
    skillId: extra.skillId,
    label: extra.label ?? session.name ?? session.title,
    startedAt: session.createdAt,
    endedAt: session.closedAt,
    status: CLOSED_SESSION_REASON_TO_STATUS[session.reason],
    exitCode: session.exitCode ?? undefined,
    verdict: extra.verdict,
  };
}
