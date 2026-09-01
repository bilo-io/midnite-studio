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
 * A council member's `provider` is restricted to the three roster agents that
 * already have a defined non-interactive invocation in
 * {@link agentInvocationArgs} (`agy`, `codex`, `opencode`) — every other
 * roster agent (including `claude` itself) has no headless flag today, so it
 * cannot be trusted to answer one prompt and exit rather than opening its own
 * interactive REPL.
 */
import { z } from 'zod';

// --- providers ---------------------------------------------------------------

/**
 * The only roster agents eligible as a council member or synthesizer.
 *
 * Not the whole `BUILTIN_AGENTS` roster: a council member runs unattended (see
 * the auto-send note on {@link CouncilRunSchema}), so it must be one of the
 * roster ids `agentInvocationArgs` already knows how to invoke non-interactively.
 * Widening this list is a `start-agent.ts`/`agentInvocationArgs` change first,
 * not a councils one.
 */
export const COUNCIL_MEMBER_PROVIDERS = ['agy', 'codex', 'opencode'] as const;
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
});
export type CouncilMember = z.infer<typeof CouncilMemberSchema>;

export const CouncilSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  members: z.array(CouncilMemberSchema),
  synthProvider: CouncilMemberProviderSchema,
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
]);
export type CouncilMemberStatus = z.infer<typeof CouncilMemberStatusSchema>;

export const CouncilRunStatusSchema = z.enum(['running', 'synthesizing', 'completed', 'failed']);
export type CouncilRunStatus = z.infer<typeof CouncilRunStatusSchema>;

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
});
export type CouncilRunMember = z.infer<typeof CouncilRunMemberSchema>;

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
  synthesisOutput: z.string().optional(),
  synthesisTruncated: z.boolean().optional(),
  synthesisError: z.string().optional(),
  synthesisPtyId: z.string().min(1).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type CouncilRun = z.infer<typeof CouncilRunSchema>;

// --- tunables ----------------------------------------------------------------

/**
 * Per-member and per-synthesis timeout: exit is the primary settle signal, and
 * this is the fallback that keeps a hung CLI from blocking the settle barrier
 * forever. A hardcoded constant for this phase rather than a Settings-exposed
 * value — see the phase doc's "Decisions" section for why.
 */
export const COUNCIL_RUN_TIMEOUT_MS = 120_000;

/**
 * Captured output past this many bytes is truncated (see
 * {@link CouncilRunMemberSchema.truncated}) rather than allowed to grow
 * unbounded — bounds both storage and the size of the prompt the synthesizer
 * ultimately reads.
 */
export const COUNCIL_OUTPUT_CAP_BYTES = 500 * 1024;
