/**
 * Agent councils: a standing panel of AI members that answers one prompt in
 * parallel, then a synthesizer distills the results into one write-up.
 *
 * Ported as a narrow MVP slice from `~/Dev/midnite`'s mature councils feature
 * (see `.midnite/tasks/phases/phase-34-agent-councils.md` for the full design
 * discussion). Three things upstream supports and this schema deliberately
 * does not, yet: more than one synthesis format (`brainstorm` is the only
 * literal below), anonymized/blind formats, and per-repo scoping — a council
 * here is **global**, exactly like the agent roster it draws members from.
 *
 * A council member's `provider` is restricted to the roster agents with a
 * print mode in {@link agentHeadlessArgs} that this feature has verified answers
 * one prompt and exits (`agy`, `claude`, `codex`, `opencode`).
 *
 * Phase 133 made a run a **thread**: the top-level prompt/members/synthesis
 * fields are the latest turn, and `turns` holds the earlier ones, oldest
 * first, so a run written before then parses as a one-turn thread.
 */
import { z } from 'zod';

// --- providers ---------------------------------------------------------------

/**
 * The only roster agents eligible as a council member or synthesizer.
 *
 * Not the whole `BUILTIN_AGENTS` roster: a council member runs unattended (see
 * the auto-send note on {@link CouncilRunSchema}), so it must be one of the
 * roster ids `agentHeadlessArgs` already knows how to invoke non-interactively.
 * Widening this list is a `start-agent.ts`/`agentHeadlessArgs` change first,
 * not a councils one.
 */
export const COUNCIL_MEMBER_PROVIDERS = ['agy', 'claude', 'codex', 'opencode'] as const;
export const CouncilMemberProviderSchema = z.enum(COUNCIL_MEMBER_PROVIDERS);
export type CouncilMemberProvider = z.infer<typeof CouncilMemberProviderSchema>;

// --- format --------------------------------------------------------------

/**
 * The only synthesis format this phase ships.
 *
 * Written as a one-value literal rather than a placeholder enum, so adding a
 * second format later (`debate`, with its anonymize/shuffle/de-anonymize
 * mechanic) is an honest, visible schema change instead of a value slotting
 * into a union nobody widened on purpose.
 */
export const CouncilFormatSchema = z.literal('brainstorm');
export type CouncilFormat = z.infer<typeof CouncilFormatSchema>;

// --- council + members -----------------------------------------------------

export const CouncilMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: CouncilMemberProviderSchema,
  /** Free-text instruction for how this member should answer — e.g. "argue the contrary view". */
  role: z.string().min(1),
  /** A `modelsForAgent` id for `provider`; absent means the CLI's own default (Phase 133 Theme B). */
  model: z.string().min(1).optional(),
});
export type CouncilMember = z.infer<typeof CouncilMemberSchema>;

export const CouncilSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  members: z.array(CouncilMemberSchema),
  synthProvider: CouncilMemberProviderSchema,
  /** The synthesizer's model, as {@link CouncilMemberSchema}'s `model`. */
  synthModel: z.string().min(1).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Council = z.infer<typeof CouncilSchema>;

/**
 * Four starter personas, seeded on every new council — mirrors upstream's own
 * `COUNCIL_STARTER_MEMBERS` so a fresh council is immediately useful rather
 * than an empty list the user has to populate before it means anything.
 *
 * A factory, not a constant array: each member needs its own id, minted fresh
 * per council rather than shared across every council that has never edited
 * its starters.
 */
export function createStarterMembers(): CouncilMember[] {
  return [
    { id: crypto.randomUUID(), name: 'Optimist', provider: 'agy', role: 'Argue the best case — what could go right, and why this is worth doing.' },
    { id: crypto.randomUUID(), name: 'Skeptic', provider: 'codex', role: 'Find the strongest objection — what breaks, what is being assumed away.' },
    { id: crypto.randomUUID(), name: 'Pragmatist', provider: 'opencode', role: 'Focus on what is actually achievable given real constraints — time, cost, complexity.' },
    { id: crypto.randomUUID(), name: 'Visionary', provider: 'agy', role: 'Ignore near-term constraints — what is the most ambitious version of this?' },
  ];
}

// --- runs --------------------------------------------------------------------

export const CouncilMemberStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
  'timeout',
  'skipped',
  /** The whole run was cancelled while this member was still answering (Phase 133). */
  'cancelled',
]);
export type CouncilMemberStatus = z.infer<typeof CouncilMemberStatusSchema>;

/**
 * A run's own state. `completed`, `failed`, `timeout` and `cancelled` are
 * terminal; `timeout` and `cancelled` say what stopped the synthesis (or the
 * whole run) rather than folding both into `failed`.
 */
export const CouncilRunStatusSchema = z.enum(['running', 'synthesizing', 'completed', 'failed', 'timeout', 'cancelled']);
export type CouncilRunStatus = z.infer<typeof CouncilRunStatusSchema>;

/** The run statuses that end a turn. */
export const COUNCIL_RUN_TERMINAL: readonly CouncilRunStatus[] = ['completed', 'failed', 'timeout', 'cancelled'];

export function isCouncilRunLive(status: CouncilRunStatus): boolean {
  return status === 'running' || status === 'synthesizing';
}

/** What happened to a turn's synthesis itself, apart from the run (Phase 133). */
export const CouncilSynthesisStatusSchema = z.enum(['running', 'succeeded', 'failed', 'timeout', 'cancelled']);
export type CouncilSynthesisStatus = z.infer<typeof CouncilSynthesisStatusSchema>;

/**
 * One member's result within a run.
 *
 * `name`/`provider`/`role` are a **snapshot** taken at run start, not a live
 * read of the council's current members — so editing a member's role after a
 * run has completed never rewrites that run's own history. `ptyId` is a
 * runtime-only field: present while the member is `running` (so the renderer
 * knows which live pty to subscribe to via the existing `pty:*` channels),
 * stripped once the member settles and never persisted to disk — the same
 * "no ptyId at rest" rule `TerminalSessionSchema` already follows, for the
 * same reason: a process id from a previous launch means nothing on the next
 * one.
 */
export const CouncilRunMemberSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1),
  provider: CouncilMemberProviderSchema,
  role: z.string().min(1),
  status: CouncilMemberStatusSchema,
  output: z.string().default(''),
  /** Set when the captured output hit the per-member cap and was cut off. */
  truncated: z.boolean().default(false),
  error: z.string().optional(),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
  ptyId: z.string().min(1).optional(),
  /** The model snapshot, as {@link CouncilMemberSchema}'s `model`. */
  model: z.string().min(1).optional(),
  /** The CLI's own session id, from its JSON answer — what a follow-up turn resumes (Phase 133 Theme D). */
  sessionId: z.string().min(1).optional(),
});
export type CouncilRunMember = z.infer<typeof CouncilRunMemberSchema>;

/**
 * One earlier turn of a thread (Phase 133 Theme D): what was asked, what each
 * member answered and what the synthesis said. Kept whole so the thread view
 * can draw every turn; the follow-up prompt reads only an excerpt of the
 * synthesis from it.
 */
export const CouncilTurnSchema = z.object({
  prompt: z.string().min(1),
  status: CouncilRunStatusSchema,
  members: z.array(CouncilRunMemberSchema.omit({ ptyId: true })),
  synthProvider: CouncilMemberProviderSchema,
  synthModel: z.string().min(1).optional(),
  synthesisStatus: CouncilSynthesisStatusSchema.optional(),
  synthesisOutput: z.string().optional(),
  synthesisError: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
});
export type CouncilTurn = z.infer<typeof CouncilTurnSchema>;

/**
 * A single run of a council against one prompt.
 *
 * `synthProvider` is likewise a snapshot of the council's synthesizer at run
 * start. `synthesisPtyId` follows the same runtime-only rule as each member's
 * `ptyId`.
 *
 * **The one deliberate safety exception this feature makes:** every member's
 * (and the synthesizer's) command is queued *and sent* automatically — no
 * human presses Return, unlike every other agent launch in this app (see
 * `start-agent.ts`'s own doc comment). Justified because a council member only
 * answers the run's `prompt`; it has no working tree to mutate. Written down
 * here so the exception stays visible rather than discovered.
 */
export const CouncilRunSchema = z.object({
  id: z.string().min(1),
  councilId: z.string().min(1),
  prompt: z.string().min(1),
  format: CouncilFormatSchema,
  status: CouncilRunStatusSchema,
  synthProvider: CouncilMemberProviderSchema,
  members: z.array(CouncilRunMemberSchema),
  synthModel: z.string().min(1).optional(),
  synthesisStatus: CouncilSynthesisStatusSchema.optional(),
  synthesisOutput: z.string().optional(),
  synthesisTruncated: z.boolean().optional(),
  synthesisError: z.string().optional(),
  synthesisPtyId: z.string().min(1).optional(),
  /** The synthesizer's CLI session, resumed by the next turn. */
  synthSessionId: z.string().min(1).optional(),
  /** Earlier turns of this thread, oldest first; the top-level fields are the latest turn. */
  turns: z.array(CouncilTurnSchema).default([]),
  /** When the latest turn started — `createdAt` is when the thread did. */
  turnStartedAt: z.number().int().nonnegative().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type CouncilRun = z.infer<typeof CouncilRunSchema>;

/** How many turns a thread has, the latest included. */
export function councilTurnCount(run: Pick<CouncilRun, 'turns'>): number {
  return (run.turns?.length ?? 0) + 1;
}

/** The thread's title: its first prompt. */
export function councilThreadTitle(run: Pick<CouncilRun, 'turns' | 'prompt'>): string {
  return run.turns?.[0]?.prompt ?? run.prompt;
}

// --- recommend (Phase 133 Theme E) -------------------------------------------

/** One member a small model proposed; the user edits it before anything is created. */
export const CouncilRecommendedMemberSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(600),
  provider: CouncilMemberProviderSchema,
});
export type CouncilRecommendedMember = z.infer<typeof CouncilRecommendedMemberSchema>;

export const CouncilRecommendationSchema = z.object({
  description: z.string().trim().max(300).optional(),
  members: z.array(CouncilRecommendedMemberSchema).min(2).max(6),
  synthProvider: CouncilMemberProviderSchema,
});
export type CouncilRecommendation = z.infer<typeof CouncilRecommendationSchema>;

// --- tunables ----------------------------------------------------------------

/**
 * Per-member and per-synthesis timeout: exit is the primary settle signal, and
 * this is the fallback that keeps a hung CLI from blocking the settle barrier
 * forever. A hardcoded constant for this phase rather than a Settings-exposed
 * value — see the phase doc's "Decisions" section for why.
 */
export const COUNCIL_RUN_TIMEOUT_MS = 300_000;

/**
 * How much of the previous synthesis a follow-up turn carries (Phase 133
 * Theme D): an excerpt that says where the council landed, not every
 * member's transcript — each member's own session already holds its history.
 */
export const COUNCIL_FOLLOW_UP_EXCERPT_CHARS = 1_500;

/**
 * How much of one member's answer the synthesis prompt carries. The capture
 * cap bounds storage; this bounds the prompt, so a council of six verbose
 * members cannot hand the synthesizer megabytes.
 */
export const COUNCIL_SYNTHESIS_ENTRY_CHARS = 12_000;

/**
 * Captured output past this many bytes is truncated (see
 * {@link CouncilRunMemberSchema.truncated}) rather than allowed to grow
 * unbounded — bounds both storage and the size of the prompt the synthesizer
 * ultimately reads.
 */
export const COUNCIL_OUTPUT_CAP_BYTES = 500 * 1024;
