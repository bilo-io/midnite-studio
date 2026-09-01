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
 * `promptFragment` is a complete imperative sentence appended verbatim to the
 * composed prompt when the box is checked — a sentence rather than a flag, so
 * the agent reads it the way a human instruction reads.
 */
export const LoopModifierSchema = z.object({
  id: z.string().min(1),
  /** The checkbox label. */
  label: z.string().min(1),
  /** Appended to the prompt when checked. A full sentence, ending in `.`. */
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
 * The four loops the FAB ships with. Ids match the historical `FabTab` union
 * so persisted `activeFabTab` values keep meaning what they meant.
 */
export const DEFAULT_LOOPS: readonly LoopDefinition[] = [
  {
    id: 'innovate',
    label: 'Innovate',
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
    ],
  },
  {
    id: 'automate',
    label: 'Automate',
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
    ],
  },
  {
    id: 'watchdog',
    label: 'Watchdog',
    icon: 'watchdog',
    color: 'text-yellow-500',
    agentId: 'claude',
    agentCommandId: 'loopAddressIssue',
    fallbackPrompt: '/loop /midnite-address-issue',
    modifiers: [
      {
        id: 'dependabot',
        label: 'Watch dependabot PRs',
        promptFragment: 'Also watch for dependabot PRs and handle them.',
        defaultOn: false,
      },
      {
        id: 'triage-only',
        label: 'Triage only',
        promptFragment: 'Only triage and comment on issues; do not push fixes.',
        defaultOn: false,
      },
    ],
  },
  {
    id: 'medic',
    label: 'Medic',
    icon: 'medic',
    color: 'text-red-500',
    agentId: 'claude',
    agentCommandId: 'loopPrReview',
    fallbackPrompt: '/loop /pr-review',
    modifiers: [
      {
        id: 'auto-approve',
        label: 'Auto-approve passing PRs',
        promptFragment: 'Auto-approve PRs that pass review with no blocking findings.',
        defaultOn: false,
      },
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
