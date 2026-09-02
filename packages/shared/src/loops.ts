/**
 * FAB loops — the standing agent loops the FAB panel runs (Phase 35).
 *
 * A *loop* is a named, repeatable agent invocation: a base prompt (owned by the
 * renderer's user-editable `agentSkills` registry, keyed by `agentCommandId`
 * here), a set of optional prompt *modifiers* the composer offers as
 * checkboxes, and the presentation the FAB tab needs (label, icon token,
 * colour). A *run record* is the durable trace of one press of Start —
 * composed prompt included, so history shows exactly which toggles a run
 * carried.
 *
 * Presentation fields carry *tokens* (`icon`, a key into the renderer's own
 * icon map), never components — this package imports zod and nothing else.
 */
import { z } from 'zod';

/**
 * One checkbox in a loop's composer.
 *
 * `promptFragment` is appended verbatim to the composed prompt when the box is
 * checked, and it is one of two things. Usually a complete imperative sentence
 * — a sentence rather than a flag, so the agent reads it the way a human
 * instruction reads. Sometimes a bare skill invocation (`/pr-review`), for the
 * loops whose *job* is the checkbox: Patrol's base is a bare `/loop`, and its
 * boxes are what say which forge skills that loop runs.
 */
export const LoopModifierSchema = z.object({
  id: z.string().min(1),
  /** The checkbox label. */
  label: z.string().min(1),
  /** Appended to the prompt when checked — a full sentence, or a `/skill`. */
  promptFragment: z.string().min(1),
  /** Whether a fresh install starts with this box checked. */
  defaultOn: z.boolean().default(false),
});
export type LoopModifier = z.infer<typeof LoopModifierSchema>;

/**
 * A loop the FAB panel offers as a tab.
 *
 * `agentCommandId` names the entry in the renderer's `agentSkills` registry
 * (Settings ▸ Agent) that supplies the *base prompt* — the FAB's four prompts
 * used to be a third hard-coded copy of that registry, and this link is what
 * retires it. `fallbackPrompt` covers a registry that has no such key (an old
 * persisted store), so a loop can never compose an empty command.
 *
 * `agentId` is fixed to `'claude'` for every default loop this phase: it is
 * the only roster agent with `activity` markers, so it is the only one whose
 * Start/Stop glow and waiting-detection are honest. The field exists so a
 * per-tab agent picker later is a data change, not a schema change.
 */
export const LoopDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Key into the renderer's own icon map — never a component. */
  icon: z.string().min(1),
  /** Tailwind text-colour class for the tab glyph and the status dot. */
  color: z.string().min(1),
  /** Roster agent that runs the loop. */
  agentId: z.string().min(1),
  /** Key into the renderer's user-editable `agentSkills` registry. */
  agentCommandId: z.string().min(1),
  /** Base prompt when the registry has no entry for `agentCommandId`. */
  fallbackPrompt: z.string().min(1),
  modifiers: z.array(LoopModifierSchema),
});
export type LoopDefinition = z.infer<typeof LoopDefinitionSchema>;

/**
 * How one run ended — or that it has not.
 *
 * - `running` — the pty is (believed) live. A record still `running` when the
 *   store loads at boot is finalised to `stopped`: the process died with the
 *   last quit, and pretending otherwise is the dishonesty Phase 30 removed.
 * - `stopped` — the user pressed Stop (interrupt, then sleep).
 * - `exited` — the loop's process ended on its own; `exitCode` says how.
 */
export const LoopRunStatusSchema = z.enum(['running', 'stopped', 'exited']);
export type LoopRunStatus = z.infer<typeof LoopRunStatusSchema>;

/**
 * The durable trace of one Start — what `loop-runs.json` holds (capped, like
 * council runs). `composedPrompt` is the exact line typed into the shell, so
 * history never has to re-derive what a past run was told.
 */
export const LoopRunRecordSchema = z.object({
  id: z.string().min(1),
  loopId: z.string().min(1),
  /** The terminal session that hosted the run — how main spots its pty exit. */
  sessionId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
  composedPrompt: z.string().min(1),
  checkedModifierIds: z.array(z.string().min(1)),
  exitCode: z.number().int().optional(),
  status: LoopRunStatusSchema,
});
export type LoopRunRecord = z.infer<typeof LoopRunRecordSchema>;

/**
 * The two "don't stop to ask" toggles *every* loop offers.
 *
 * Spread last into each loop's `modifiers`, because `composeLoopPrompt` emits
 * fragments in declared order and a standing rule belongs at the tail of the
 * line — after the steps it governs, where an agent reads it as a policy for
 * the whole run rather than as one more step.
 *
 * Two boxes rather than one tri-state: checking both is a contradiction, but a
 * *legible* one that the composer has no business silently resolving on the
 * user's behalf. Whichever the agent honours, the run record says which boxes
 * were checked.
 */
export const AUTO_PICK_MODIFIERS: readonly LoopModifier[] = [
  {
    id: 'auto-pick-recommended',
    label: 'Auto pick recommended',
    promptFragment:
      'Never stop to ask: keep advancing and always take the recommended option.',
    defaultOn: false,
  },
  {
    id: 'auto-pick-performance',
    label: 'Auto pick performance',
    promptFragment:
      'Never stop to ask: keep advancing and always take the most performant option.',
    defaultOn: false,
  },
];

/**
 * The four loops the FAB ships with. Ids match the historical `FabTab` union
 * so persisted `activeFabTab` values keep meaning what they meant.
 *
 * Two of them read their whole job off the forge, and split it the way the two
 * words do. **Patrol** walks the pull requests — its base is a bare `/loop` and
 * its boxes append the PR skills themselves, so "review" and "feedback" are one
 * pass or two by checkbox rather than by tab. **Medic** treats what is already
 * sick: the dependency bots' PRs and the issue backlog, on `/midnite-address-issue`.
 * Either can be told to look and not touch, and `Triage only` on both means the
 * same thing — run `/midnite-triage` and report its table, change nothing.
 */
export const DEFAULT_LOOPS: readonly LoopDefinition[] = [
  {
    id: 'innovate',
    label: 'Ideate',
    icon: 'brain',
    color: 'text-blue-500',
    agentId: 'claude',
    agentCommandId: 'loopBrainstorm',
    fallbackPrompt: '/loop /midnite-brainstorm',
    modifiers: [
      {
        id: 'small-phases',
        label: 'Prefer small phases',
        promptFragment: 'Prefer small, PR-sized phases over sweeping multi-week ones.',
        defaultOn: false,
      },
      ...AUTO_PICK_MODIFIERS,
    ],
  },
  {
    id: 'automate',
    label: 'Engineer',
    icon: 'bot',
    color: 'text-green-500',
    agentId: 'claude',
    agentCommandId: 'loopExecBacklog',
    fallbackPrompt: '/loop /midnite-exec',
    modifiers: [
      {
        id: 'auto-merge',
        label: 'Auto-merge approved PRs',
        promptFragment: 'Auto-merge PRs that are approved and have green checks.',
        defaultOn: false,
      },
      {
        id: 'small-batches',
        label: 'One theme per iteration',
        promptFragment: 'Pick at most one theme per iteration.',
        defaultOn: false,
      },
      ...AUTO_PICK_MODIFIERS,
    ],
  },
  {
    id: 'watchdog',
    label: 'Patrol',
    icon: 'watchdog',
    color: 'text-yellow-500',
    agentId: 'claude',
    agentCommandId: 'loopPatrol',
    fallbackPrompt: '/loop',
    modifiers: [
      {
        id: 'pr-review',
        label: 'PR review',
        promptFragment: '/pr-review',
        defaultOn: true,
      },
      {
        id: 'pr-feedback',
        label: 'PR feedback',
        promptFragment: '/pr-feedback',
        defaultOn: false,
      },
      {
        id: 'triage-only',
        label: 'Triage only',
        promptFragment:
          'Triage only: run /midnite-triage and report its summary table — leave no reviews, merge nothing and push no fixes.',
        defaultOn: false,
      },
      {
        id: 'auto-approve',
        label: 'Auto-approve passing PRs',
        promptFragment: 'Auto-approve PRs that pass review with no blocking findings.',
        defaultOn: false,
      },
      ...AUTO_PICK_MODIFIERS,
    ],
  },
  {
    id: 'medic',
    label: 'Medic',
    icon: 'medic',
    color: 'text-red-500',
    agentId: 'claude',
    agentCommandId: 'loopAddressIssue',
    fallbackPrompt: '/loop /midnite-address-issue',
    modifiers: [
      {
        id: 'dependabot',
        label: 'Dependabot PRs',
        promptFragment:
          'Also take the open Dependabot PRs: run the gate on each and land the ones that pass.',
        defaultOn: false,
      },
      {
        id: 'renovate',
        label: 'Renovate PRs',
        promptFragment:
          'Also take the open Renovate PRs: run the gate on each and land the ones that pass.',
        defaultOn: false,
      },
      {
        id: 'triage-only',
        label: 'Triage only',
        promptFragment:
          'Triage only: run /midnite-triage and report its summary table — merge nothing and push no fixes.',
        defaultOn: false,
      },
      ...AUTO_PICK_MODIFIERS,
    ],
  },
] as const;

/**
 * The one place a loop's command line is assembled.
 *
 * Pure and deterministic: base prompt, then each *checked* modifier's fragment
 * in the loop's own declared order (never the click order), then any free-text
 * extras — single-space separated, whitespace-trimmed. Both the composer's
 * Start and the run record's `composedPrompt` go through here, so what ran and
 * what history says ran cannot drift.
 */
export function composeLoopPrompt(
  basePrompt: string,
  loop: Pick<LoopDefinition, 'modifiers'>,
  checkedModifierIds: readonly string[],
  extraText?: string,
): string {
  const checked = new Set(checkedModifierIds);
  const fragments = loop.modifiers.filter((m) => checked.has(m.id)).map((m) => m.promptFragment);
  return [basePrompt.trim(), ...fragments, extraText?.trim() ?? '']
    .filter((part) => part.length > 0)
    .join(' ');
}
