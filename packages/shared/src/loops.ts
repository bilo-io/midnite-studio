/**
 * FAB loops — the standing agent loops the FAB panel runs (Phase 35).
 *
 * A *loop* is a named, repeatable agent invocation: a base prompt (owned by the
 * renderer's user-editable `agentSkills` registry, keyed by `agentCommandId`
 * here), the run settings the composer offers, and the presentation the FAB tab
 * needs (label, icon token, colour). A *run record* is the durable trace of one
 * press of Start — composed prompt included, so history shows exactly which
 * toggles a run carried.
 *
 * Run settings come in three shapes, and the shape is part of the contract
 * rather than a renderer detail — a control that looks like the answer it takes
 * is the difference between a wall of identical boxes and a form you can read:
 *
 * - **checkbox** ({@link LoopModifier} with `control: 'checkbox'`) — additive,
 *   many-of-N. "Review PRs" *and* "Answer feedback" is a coherent run.
 * - **switch** ({@link LoopModifier} with `control: 'switch'`) — a standing
 *   policy that is either in force or not. "Auto-merge green PRs" is not one
 *   item in a list of jobs; it is a mode the whole run is in.
 * - **radio** ({@link LoopChoice}) — exactly one of N, because the options
 *   contradict each other. The autonomy pair used to be two checkboxes with a
 *   comment admitting that ticking both was a contradiction; a radio group is
 *   what that comment was asking for.
 *
 * Presentation fields carry *tokens* (`icon`, a key into the renderer's own
 * icon map), never components — this package imports zod and nothing else.
 */
import { z } from 'zod';

/**
 * Which control a modifier is drawn as. See the module note: additive things
 * are boxes, standing policies are switches.
 */
export const LoopControlSchema = z.enum(['checkbox', 'switch']);
export type LoopControl = z.infer<typeof LoopControlSchema>;

/**
 * The composer's three sections, in render *and* prompt order.
 *
 * The order is load-bearing twice over. On screen it reads top-down as "what
 * it does → how far it goes → how it behaves". In the composed line it is the
 * emission order (see {@link composeLoopPrompt}), so a standing rule lands
 * after the steps it governs — where an agent reads it as a policy for the run
 * rather than as one more step in it.
 */
export const LoopGroupSchema = z.enum(['tasks', 'scope', 'run']);
export type LoopGroup = z.infer<typeof LoopGroupSchema>;

export const LOOP_GROUPS: readonly { id: LoopGroup; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'scope', label: 'Scope' },
  { id: 'run', label: 'Run' },
];

/**
 * One checkbox or switch in a loop's composer.
 *
 * `promptFragment` is appended verbatim to the composed prompt when it is on,
 * and it is one of two things. Usually a complete imperative sentence — a
 * sentence rather than a flag, so the agent reads it the way a human
 * instruction reads. Sometimes a bare skill invocation (`/pr-review`), for the
 * loops whose *job* is the checkbox: Patrol's base is a bare `/loop`, and its
 * boxes are what say which forge skills that loop runs.
 */
export const LoopModifierSchema = z.object({
  id: z.string().min(1),
  /** The control's label — short enough to read in a 320px panel. */
  label: z.string().min(1),
  /** Appended to the prompt when on — a full sentence, or a `/skill`. */
  promptFragment: z.string().min(1),
  /** Which section it sits in, and where its fragment lands in the line. */
  group: LoopGroupSchema.default('tasks'),
  /** Box or switch. Additive → box; standing policy → switch. */
  control: LoopControlSchema.default('checkbox'),
  /**
   * This control gives the loop something *to do*, rather than qualifying what
   * it already does — it names a skill. Only meaningful on a `requiresModifier`
   * loop, where it is what separates a startable run from a bare `/loop`:
   * "Take the recommendation" alone is a policy with no task under it.
   *
   * Optional rather than defaulted: it is meaningful on a handful of controls,
   * and declaring `false` on all the others would bury the exception in the
   * noise of stating it everywhere.
   */
  providesTask: z.boolean().optional(),
  /** Whether a fresh install starts with this one on. */
  defaultOn: z.boolean().default(false),
});
export type LoopModifier = z.infer<typeof LoopModifierSchema>;

/** One radio in a {@link LoopChoice}. */
export const LoopChoiceOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /**
   * Appended when this option is selected. Absent on the neutral option — the
   * one that means "no instruction on this axis at all", which is a real answer
   * and not the same as an empty sentence.
   */
  promptFragment: z.string().min(1).optional(),
});
export type LoopChoiceOption = z.infer<typeof LoopChoiceOptionSchema>;

/**
 * A one-of-N run setting, drawn as a radio group.
 *
 * `defaultOptionId` must name one of `options` — asserted in `loops.test.ts`
 * rather than expressed in the schema, because zod cannot state the
 * cross-field rule without a refinement that would fire on every parse.
 */
export const LoopChoiceSchema = z.object({
  id: z.string().min(1),
  /** The group's legend, e.g. "Which PRs". */
  label: z.string().min(1),
  group: LoopGroupSchema.default('scope'),
  options: z.array(LoopChoiceOptionSchema).min(2),
  defaultOptionId: z.string().min(1),
});
export type LoopChoice = z.infer<typeof LoopChoiceSchema>;

/**
 * Which Claude the loop runs on.
 *
 * Not a prompt fragment: a model is chosen with a CLI flag before the agent
 * starts, so telling the agent in prose which model it is would be a wish
 * rather than a setting. `'default'` passes no flag at all and lets the CLI's
 * own configuration decide — the honest default for a user who has already
 * picked one in `claude`'s settings.
 */
export const LoopModelSchema = z.enum([
  'default',
  'haiku-4-5',
  'sonnet-5',
  'opus-4-8',
  'opus-5',
  'fable-5',
  'fable-5-1',
]);
export type LoopModel = z.infer<typeof LoopModelSchema>;

/**
 * Cheapest first, so the row reads as a cost ladder rather than a release
 * order — a loop is the one place in this app where the model choice is a
 * standing bill rather than a single call, and the pill you reach for first
 * should be the one you can afford to leave running.
 *
 * Two older models are here on purpose. `opus-4-8` is the previous Opus, kept
 * because a long unattended run is exactly the case where a known-good model
 * beats the newest one. `fable-5` sits below `fable-5-1` for the same reason.
 * Ids are our own tokens, not the CLI strings — `cliModel` is the only place
 * an `--model` word is written, so a rename upstream is a one-line change and
 * a persisted store never holds a vendor string it cannot interpret.
 */
export const LOOP_MODELS: readonly { id: LoopModel; label: string; cliModel: string | null }[] = [
  { id: 'default', label: 'Default', cliModel: null },
  { id: 'haiku-4-5', label: 'Haiku 4.5', cliModel: 'claude-haiku-4-5' },
  { id: 'sonnet-5', label: 'Sonnet 5', cliModel: 'claude-sonnet-5' },
  { id: 'opus-4-8', label: 'Opus 4.8', cliModel: 'claude-opus-4-8' },
  { id: 'opus-5', label: 'Opus 5', cliModel: 'claude-opus-5' },
  { id: 'fable-5', label: 'Fable 5', cliModel: 'claude-fable-5' },
  { id: 'fable-5-1', label: 'Fable 5.1', cliModel: 'claude-fable-5-1' },
];

/**
 * The `--model` words for a loop's invocation, or none.
 *
 * Claude only, deliberately: `--model` is `claude`'s flag, and handing it to
 * `codex exec` or `agy -p` would fail the invocation outright rather than
 * degrade. Every default loop is `agentId: 'claude'` today, so this is a guard
 * for the per-tab agent picker `LoopDefinition.agentId` exists to allow.
 */
export function loopModelArgs(agentId: string, model: LoopModel): string[] {
  if (agentId !== 'claude') return [];
  const cli = LOOP_MODELS.find((entry) => entry.id === model)?.cliModel ?? null;
  return cli === null ? [] : ['--model', cli];
}

/**
 * The models a given provider actually offers — the second half of the
 * composer's provider/model pair.
 *
 * The same claude-only rule {@link loopModelArgs} enforces, said in the shape
 * a picker needs: every other agent gets the one neutral entry rather than a
 * list of Claudes it would refuse to launch. Kept beside `loopModelArgs` so
 * the two cannot drift — a UI that offered Opus for `codex` and a launcher
 * that dropped the flag would disagree about what the run cost.
 */
export function loopModelsFor(agentId: string): readonly (typeof LOOP_MODELS)[number][] {
  return agentId === 'claude' ? LOOP_MODELS : LOOP_MODELS.filter((entry) => entry.cliModel === null);
}

/**
 * How often a scheduled loop should take another pass.
 *
 * Prompt-level like the window itself, and for the same reason: `/loop` paces
 * itself and schedules its own next wake-up, so a cadence it can *read* is a
 * cadence it can honour. A renderer-side timer would arm nothing that survives
 * a quit. `'continuous'` says nothing at all — the honest default, and not the
 * same as asking for the fastest cadence on the list.
 */
export const LoopFrequencySchema = z.enum([
  'continuous',
  '15m',
  '30m',
  'hourly',
  '2h',
  '4h',
  'daily',
]);
export type LoopFrequency = z.infer<typeof LoopFrequencySchema>;

export const LOOP_FREQUENCIES: readonly {
  id: LoopFrequency;
  label: string;
  /** Appended when chosen. `null` on the neutral option, which adds nothing. */
  promptFragment: string | null;
}[] = [
  { id: 'continuous', label: 'Continuous', promptFragment: null },
  {
    id: '15m',
    label: '15m',
    promptFragment: 'Pace yourself to roughly one pass every 15 minutes.',
  },
  {
    id: '30m',
    label: '30m',
    promptFragment: 'Pace yourself to roughly one pass every 30 minutes.',
  },
  { id: 'hourly', label: 'Hourly', promptFragment: 'Pace yourself to roughly one pass an hour.' },
  { id: '2h', label: '2h', promptFragment: 'Pace yourself to roughly one pass every two hours.' },
  { id: '4h', label: '4h', promptFragment: 'Pace yourself to roughly one pass every four hours.' },
  { id: 'daily', label: 'Daily', promptFragment: 'Take at most one pass a day.' },
];

/**
 * Which days the loop may work at all — the seven, individually.
 *
 * This was three preset tokens (`'all' | 'weekdays' | 'weekends'`), whose own
 * comment argued that a per-day answer would be "five more controls in a 320px
 * panel to express the case nobody has asked for". The case was asked for, and
 * the premise no longer holds: a multi-select is ONE control the width of the
 * two beside it, not seven checkboxes. The presets survive as
 * {@link LEGACY_LOOP_DAY_SETS} — every schedule persisted before this change
 * still holds one of those strings, and {@link resolveLoopDays} is what reads
 * it as the day set it always meant.
 *
 * Monday first: the loops this app runs are working-week shaped, and a week
 * that starts on Sunday puts the two days a loop is most often told to skip on
 * opposite ends of the control.
 */
export const LoopWeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type LoopWeekday = z.infer<typeof LoopWeekdaySchema>;

/**
 * `label` is what the prompt says ("Monday"), `short` what a 320px control and
 * a running chip have room for ("Mon") — one table, so the two can never name
 * the same day differently.
 */
export const LOOP_WEEKDAYS: readonly { id: LoopWeekday; label: string; short: string }[] = [
  { id: 'mon', label: 'Monday', short: 'Mon' },
  { id: 'tue', label: 'Tuesday', short: 'Tue' },
  { id: 'wed', label: 'Wednesday', short: 'Wed' },
  { id: 'thu', label: 'Thursday', short: 'Thu' },
  { id: 'fri', label: 'Friday', short: 'Fri' },
  { id: 'sat', label: 'Saturday', short: 'Sat' },
  { id: 'sun', label: 'Sunday', short: 'Sun' },
];

/** Every day, in declared order — the neutral answer, which says nothing. */
export const ALL_LOOP_WEEKDAYS: readonly LoopWeekday[] = LOOP_WEEKDAYS.map((day) => day.id);

const WEEKDAY_SET: readonly LoopWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKEND_SET: readonly LoopWeekday[] = ['sat', 'sun'];

/**
 * The three tokens `days` used to be, as the day sets they always meant.
 *
 * Exported because it is a migration, not an implementation detail: a stored
 * `'weekdays'` has to keep composing the same line it composed before the
 * multi-select existed, and that equivalence is worth a test.
 */
export const LEGACY_LOOP_DAY_SETS: Record<string, readonly LoopWeekday[]> = {
  all: ALL_LOOP_WEEKDAYS,
  weekdays: WEEKDAY_SET,
  weekends: WEEKEND_SET,
};

/**
 * Accept either shape on the wire: the array this field is now, or one of the
 * three legacy preset strings, widened to the set it named.
 *
 * A string naming no preset becomes `undefined` — neutral — rather than a
 * parse failure: `days` is one axis of an optional schedule, and refusing the
 * whole record over an unknown token would cost a user their window and their
 * cadence too.
 */
function widenLegacyDays(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return Object.hasOwn(LEGACY_LOOP_DAY_SETS, value) ? [...LEGACY_LOOP_DAY_SETS[value]!] : undefined;
}

export const LoopDaysSchema = z.preprocess(
  widenLegacyDays,
  z.array(LoopWeekdaySchema).optional(),
);

/** `HH:MM`, 24-hour — what an `<input type="time">` produces. */
const TimeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM, 24-hour');

/**
 * The window a loop is allowed to work in.
 *
 * Prompt-level, not a timer: Start still starts now, and the composed line
 * carries the window as a standing rule. The `/loop` skill self-paces (it
 * schedules its own next wake-up), so a window it can read is a window it can
 * honour — whereas a renderer-side timer would arm nothing that survives a
 * quit and would leave a tab in an "armed" state no other surface understands.
 */
export const LoopScheduleSchema = z.object({
  enabled: z.boolean().default(false),
  from: TimeOfDay,
  to: TimeOfDay,
  /**
   * How often the loop should come back round inside its window.
   *
   * Optional rather than defaulted, and read as `'continuous'` when absent:
   * every schedule persisted before this field existed is a valid schedule
   * that simply said nothing about cadence, and a zod `.default()` would make
   * the *type* claim an answer those records never gave. Same reasoning as
   * `LoopRunRecord.model`.
   */
  frequency: LoopFrequencySchema.optional(),
  /**
   * Which days it may work at all. Absent — and every day selected —
   * means the same thing: no day restriction is sent. See
   * {@link resolveLoopDays}, which is also where a legacy preset string is
   * read as the set it named.
   */
  days: LoopDaysSchema,
});
export type LoopSchedule = z.infer<typeof LoopScheduleSchema>;

/** A working day, as the window a fresh loop offers before it is edited. */
export const DEFAULT_LOOP_SCHEDULE: LoopSchedule = {
  enabled: false,
  from: '09:00',
  to: '17:00',
  frequency: 'continuous',
  days: [...ALL_LOOP_WEEKDAYS],
};

/**
 * The days a schedule actually names, whatever shape it was stored in.
 *
 * Three inputs reach this: the array the field is now, one of the three legacy
 * preset strings (a `settings.json` written before the multi-select existed is
 * spread into the store as-is — nothing re-parses it through zod on the way
 * in, so the TYPE says array while the value on disk may still be a string),
 * and `undefined`. The first two are read as themselves; `undefined` is every
 * day, which is the neutral answer.
 *
 * Filtering `ALL_LOOP_WEEKDAYS` rather than the input is what canonicalises
 * the result: duplicates collapse, unknown tokens drop, and Monday is always
 * first however the user clicked them in — so the composed line and the chip
 * read the same for two selections that mean the same thing.
 */
export function resolveLoopDays(days: LoopSchedule['days']): LoopWeekday[] {
  const raw: unknown = days;
  if (raw === undefined || raw === null) return [...ALL_LOOP_WEEKDAYS];
  if (typeof raw === 'string') {
    /*
      `Object.hasOwn`, not a bare lookup — the same guard `widenLegacyDays`
      uses, and for the same reason `resolveAgentIcon` gives in the renderer:
      an object literal inherits `toString`, `constructor` and `valueOf`, so a
      stored `days: 'constructor'` would find a function, skip the `??`, and
      throw on the spread. A corrupted store is supposed to cost this function
      its neutral answer, not the whole composer's render.
    */
    return Object.hasOwn(LEGACY_LOOP_DAY_SETS, raw)
      ? [...LEGACY_LOOP_DAY_SETS[raw]!]
      : [...ALL_LOOP_WEEKDAYS];
  }
  if (!Array.isArray(raw)) return [...ALL_LOOP_WEEKDAYS];
  return ALL_LOOP_WEEKDAYS.filter((day) => (raw as unknown[]).includes(day));
}

/** Same members, order-insensitively — both sides are already canonical. */
function sameDays(a: readonly LoopWeekday[], b: readonly LoopWeekday[]): boolean {
  return a.length === b.length && a.every((day) => b.includes(day));
}

/**
 * "Monday, Wednesday and Friday" — an Oxford-comma-free list, because it is
 * read by an agent as part of a sentence.
 */
function nameDays(days: readonly LoopWeekday[], key: 'label' | 'short'): string {
  const names = days.map((day) => LOOP_WEEKDAYS.find((entry) => entry.id === day)?.[key] ?? day);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The day axis as prose, or `null` when it is neutral.
 *
 * Neutral is BOTH "every day" and "no day at all": an empty selection is a
 * user mid-edit, exactly like `from === to` on the window, and a loop told to
 * work on no days would be a loop told not to run — which Start pressing at
 * all contradicts. The composer warns instead (see `ScheduleRows`).
 *
 * The two preset sets keep the verbatim sentences the three-token version
 * sent, so a stored `'weekdays'` composes the line it always composed.
 */
function loopDaysFragment(days: readonly LoopWeekday[]): string | null {
  if (days.length === 0 || days.length === LOOP_WEEKDAYS.length) return null;
  if (sameDays(days, WEEKDAY_SET)) {
    return 'Work on weekdays only — idle through Saturday and Sunday.';
  }
  if (sameDays(days, WEEKEND_SET)) {
    return 'Work at weekends only — idle Monday through Friday.';
  }
  return `Work on ${nameDays(days, 'label')} only — idle on every other day.`;
}

/** The day axis as the two or three words a chip has room for, or `null`. */
function loopDaysSummary(days: readonly LoopWeekday[]): string | null {
  if (days.length === 0 || days.length === LOOP_WEEKDAYS.length) return null;
  if (sameDays(days, WEEKDAY_SET)) return 'Weekdays';
  if (sameDays(days, WEEKEND_SET)) return 'Weekends';
  return days.map((day) => LOOP_WEEKDAYS.find((entry) => entry.id === day)?.short ?? day).join(', ');
}

/**
 * The schedule as prose, or `null` when there is nothing to say.
 *
 * Three independent axes, emitted in the order a reader needs them — which
 * days, then the window inside a day, then the cadence inside the window —
 * and each contributes only when it is non-neutral. An armed schedule left on
 * every default therefore still says nothing, which is the right answer: the
 * switch alone is not an instruction.
 *
 * `from === to` is not a 24-hour window and not a zero-length one — it is a
 * user mid-edit, so the *window* says nothing rather than guessing. The days
 * and the cadence are unaffected by that: they are answers to different
 * questions and stay on the line. A window that wraps midnight is named as
 * such: "between 22:00 and 06:00" alone reads like a mistake, and an agent
 * that read it as one would drop the rule.
 */
export function loopScheduleFragment(schedule: LoopSchedule | null | undefined): string | null {
  if (!schedule?.enabled) return null;

  const parts: string[] = [];

  const days = loopDaysFragment(resolveLoopDays(schedule.days));
  if (days !== null) parts.push(days);

  if (schedule.from !== schedule.to) {
    const overnight = schedule.from > schedule.to ? ' (overnight)' : '';
    parts.push(
      `Work only between ${schedule.from} and ${schedule.to} local time${overnight} — outside that window, idle and wait rather than starting new work.`,
    );
  }

  const frequency = LOOP_FREQUENCIES.find(
    (entry) => entry.id === (schedule.frequency ?? 'continuous'),
  );
  if (frequency?.promptFragment) parts.push(frequency.promptFragment);

  return parts.length === 0 ? null : parts.join(' ');
}

/**
 * The schedule as the two-or-three words a running strip has room for, or
 * `null` when the schedule is saying nothing.
 *
 * Same neutrality rule as {@link loopScheduleFragment} — a chip that read
 * "09:00–09:00 · Every day · Continuous" would be three ways of saying
 * nothing — so the two surfaces can never disagree about whether a run is
 * scheduled at all.
 */
export function loopScheduleSummary(schedule: LoopSchedule | null | undefined): string | null {
  if (loopScheduleFragment(schedule) === null || !schedule) return null;
  const parts: string[] = [];
  if (schedule.from !== schedule.to) parts.push(`${schedule.from}–${schedule.to}`);
  const days = loopDaysSummary(resolveLoopDays(schedule.days));
  if (days !== null) parts.push(days);
  if (schedule.frequency && schedule.frequency !== 'continuous') {
    parts.push(
      LOOP_FREQUENCIES.find((entry) => entry.id === schedule.frequency)?.label ?? schedule.frequency,
    );
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * A loop the FAB panel offers as a tab.
 *
 * `agentCommandId` names the entry in the renderer's `agentSkills` registry
 * (Settings ▸ Agent) that supplies the *base prompt* — the FAB's four prompts
 * used to be a third hard-coded copy of that registry, and this link is what
 * retires it. `fallbackPrompt` covers a registry that has no such key (an old
 * persisted store), so a loop can never compose an empty command.
 *
 * `agentId` is fixed to `'claude'` for every default loop: it is the only
 * roster agent with `activity` markers, so it is the only one whose Start/Stop
 * glow and waiting-detection are honest. The field exists so a per-tab agent
 * picker later is a data change, not a schema change.
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
  /**
   * The base names no skill on its own, so a run with every box unchecked
   * would be a loop with no task — Start stays disabled until one is ticked.
   *
   * True only for Patrol, whose whole design is that the checkboxes *are* the
   * skills. Every other loop's base is a complete command and its modifiers
   * only qualify it.
   */
  requiresModifier: z.boolean().default(false),
  modifiers: z.array(LoopModifierSchema),
  choices: z.array(LoopChoiceSchema).default([]),
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
 *
 * `model` is recorded separately *because* it is not in that line: it is a CLI
 * flag, so a ledger that stored only the prompt could never say which model
 * a past run cost. Optional — records written before the picker existed have
 * no answer, and inventing `'default'` for them would be a guess.
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
  model: LoopModelSchema.optional(),
  exitCode: z.number().int().optional(),
  status: LoopRunStatusSchema,
});
export type LoopRunRecord = z.infer<typeof LoopRunRecordSchema>;

/**
 * The standing switches *every* loop offers, in the `run` group.
 *
 * Spread into each loop's `modifiers`, and their group puts them at the tail of
 * the composed line whatever order they were declared in.
 */
export const COMMON_RUN_MODIFIERS: readonly LoopModifier[] = [
  {
    id: 'summarise-each-pass',
    label: 'Summarise each pass',
    promptFragment: 'End every iteration with a one-line summary of what changed.',
    group: 'run',
    control: 'switch',
    defaultOn: false,
  },
  {
    id: 'worktree-only',
    label: 'Work in a worktree',
    promptFragment:
      'Do every piece of work in its own git worktree — never edit the primary checkout.',
    group: 'run',
    control: 'switch',
    defaultOn: true,
  },
];

/**
 * What an unattended loop does when it reaches a fork — the one setting every
 * tab shares, and the reason radios exist here at all.
 *
 * This was two checkboxes whose own comment conceded that ticking both was a
 * contradiction the composer had "no business silently resolving". A radio
 * group resolves it by construction: the three answers are the three answers,
 * and "Ask me" is a real option rather than the absence of the other two.
 */
export const AUTONOMY_CHOICE: LoopChoice = {
  id: 'autonomy',
  label: 'At a fork',
  group: 'run',
  defaultOptionId: 'ask',
  options: [
    { id: 'ask', label: 'Ask me' },
    {
      id: 'recommended',
      label: 'Recommended',
      promptFragment:
        'Never stop to ask: keep advancing and always take the recommended option.',
    },
    {
      id: 'fastest',
      label: 'Fastest',
      promptFragment:
        'Never stop to ask: keep advancing and always take the most performant option.',
    },
  ],
};

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
 *
 * Known seam: a *base* prompt is indirected through `agentCommandId`, so Settings
 * ▸ Agent can repoint it, but a modifier's `promptFragment` is not — the skill
 * names above are literal. `/pr-review` and `/pr-feedback` are personal skills and
 * travel with the user, but `/midnite-triage` ships in *this* repo's
 * `.claude/skills/`, so `Triage only` is a no-op in a checkout that does not carry
 * it. A per-modifier registry is the fix; it is deliberately not this change.
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
    requiresModifier: false,
    modifiers: [
      {
        id: 'refine-existing',
        label: 'Refine existing phases',
        promptFragment:
          'Also deepen existing phase docs with /midnite-refine, not only propose new ones.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'reconcile-index',
        label: 'Reconcile the index',
        promptFragment:
          'Reconcile .midnite/tasks/_INDEX.md against what has actually landed before proposing anything.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'write-doc',
        label: 'Write the phase doc',
        promptFragment:
          'Write the agreed phase doc to .midnite/tasks/phases/ rather than stopping at a proposal.',
        group: 'run',
        control: 'switch',
        defaultOn: true,
      },
      {
        id: 'one-per-run',
        label: 'One phase per pass',
        promptFragment: 'Propose at most one phase per iteration.',
        group: 'run',
        control: 'switch',
        defaultOn: false,
      },
      ...COMMON_RUN_MODIFIERS,
    ],
    choices: [
      {
        id: 'phase-size',
        label: 'Phase size',
        group: 'scope',
        defaultOptionId: 'any',
        options: [
          { id: 'any', label: 'Any' },
          {
            id: 'pr-sized',
            label: 'PR-sized',
            promptFragment: 'Prefer small, PR-sized phases over sweeping multi-week ones.',
          },
          {
            id: 'multi-day',
            label: 'Multi-day',
            promptFragment: 'Prefer substantial multi-day phases over small ones.',
          },
        ],
      },
      AUTONOMY_CHOICE,
    ],
  },
  {
    id: 'automate',
    label: 'Create',
    icon: 'bot',
    color: 'text-green-500',
    agentId: 'claude',
    agentCommandId: 'loopExecBacklog',
    fallbackPrompt: '/loop /midnite-exec',
    requiresModifier: false,
    modifiers: [
      {
        id: 'ship-tests',
        label: 'Tests with every change',
        promptFragment: 'Ship tests with every change, at the layer that actually covers it.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: true,
      },
      {
        id: 'screenshots',
        label: 'Screenshot visual changes',
        promptFragment:
          'Capture before/after Playwright screenshots for any visual change and embed them in the PR.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'auto-merge',
        label: 'Auto-merge green PRs',
        promptFragment: 'Auto-merge PRs that are approved and have green checks.',
        group: 'run',
        control: 'switch',
        defaultOn: false,
      },
      {
        id: 'stop-on-red',
        label: 'Stop if the gate fails',
        promptFragment:
          'Stop the loop if moon run :typecheck :lint :test cannot be brought green in the same pass.',
        group: 'run',
        control: 'switch',
        defaultOn: false,
      },
      ...COMMON_RUN_MODIFIERS,
    ],
    choices: [
      {
        id: 'batch-size',
        label: 'Per pass',
        group: 'scope',
        defaultOptionId: 'one-theme',
        options: [
          {
            id: 'one-theme',
            label: 'One theme',
            promptFragment: 'Pick at most one theme per iteration.',
          },
          {
            id: 'several-themes',
            label: 'Up to four',
            promptFragment: 'Take up to four related themes in one iteration.',
          },
        ],
      },
      AUTONOMY_CHOICE,
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
    requiresModifier: true,
    modifiers: [
      {
        id: 'pr-review',
        label: 'Review PRs',
        promptFragment: '/pr-review',
        group: 'tasks',
        control: 'checkbox',
        providesTask: true,
        defaultOn: true,
      },
      {
        id: 'pr-feedback',
        label: 'Answer feedback',
        promptFragment: '/pr-feedback',
        group: 'tasks',
        control: 'checkbox',
        providesTask: true,
        defaultOn: false,
      },
      {
        id: 'security-review',
        label: 'Security review',
        promptFragment: '/security-review',
        group: 'tasks',
        control: 'checkbox',
        providesTask: true,
        defaultOn: false,
      },
      {
        id: 'triage-only',
        label: 'Triage only',
        // Names the boxes it overrides on purpose. `Review PRs` is `defaultOn`,
        // so a triage-only run *will* still carry `/pr-review` on the line, and
        // an instruction that only said "do not review" would read as a
        // contradiction rather than as the later word winning.
        promptFragment:
          'Triage only: ignore any review or feedback skill named above — run /midnite-triage instead and report only its summary table. Leave no reviews, merge nothing and push no fixes.',
        group: 'run',
        control: 'switch',
        providesTask: true,
        defaultOn: false,
      },
      {
        id: 'auto-approve',
        label: 'Auto-approve clean PRs',
        promptFragment: 'Auto-approve PRs that pass review with no blocking findings.',
        group: 'run',
        control: 'switch',
        defaultOn: false,
      },
      ...COMMON_RUN_MODIFIERS,
    ],
    choices: [
      {
        id: 'pr-scope',
        label: 'Which PRs',
        group: 'scope',
        defaultOptionId: 'all',
        options: [
          { id: 'all', label: 'All open' },
          {
            id: 'ready',
            label: 'Ready only',
            promptFragment: 'Look only at PRs that are ready for review — skip drafts.',
          },
          {
            id: 'mine',
            label: 'Mine',
            promptFragment: 'Look only at PRs I opened.',
          },
        ],
      },
      AUTONOMY_CHOICE,
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
    requiresModifier: false,
    modifiers: [
      {
        id: 'dependabot',
        label: 'Dependabot PRs',
        promptFragment:
          'Also take the open Dependabot PRs: run the gate on each, and fix or report whatever it catches.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'renovate',
        label: 'Renovate PRs',
        promptFragment:
          'Also take the open Renovate PRs: run the gate on each, and fix or report whatever it catches.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'failing-tests',
        label: 'Failing tests on main',
        promptFragment:
          'Also chase tests failing on main: fix them, or quarantine and report the ones you cannot.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'prune-branches',
        label: 'Prune landed branches',
        promptFragment:
          'Also run /midnite-git-cleanup to remove branches and worktrees that have fully landed.',
        group: 'tasks',
        control: 'checkbox',
        defaultOn: false,
      },
      {
        id: 'triage-only',
        label: 'Triage only',
        promptFragment:
          'Triage only: run /midnite-triage and report its summary table — merge nothing and push no fixes.',
        group: 'run',
        control: 'switch',
        defaultOn: false,
      },
      ...COMMON_RUN_MODIFIERS,
    ],
    choices: [
      {
        id: 'severity',
        label: 'Take',
        group: 'scope',
        defaultOptionId: 'anything',
        options: [
          { id: 'anything', label: 'Anything' },
          {
            id: 'bugs',
            label: 'Bugs only',
            promptFragment: 'Take only issues labelled as bugs.',
          },
          {
            id: 'highest-impact',
            label: 'Top issue',
            promptFragment: 'Take only the single highest-impact issue each iteration.',
          },
        ],
      },
      AUTONOMY_CHOICE,
    ],
  },
] as const;

/**
 * The option a choice is on, given whatever the store remembers.
 *
 * Resolved on read rather than written into the store, the same way modifier
 * state is: a selection naming an option that a later version renamed or
 * dropped falls back to the declared default instead of leaving the group with
 * nothing selected.
 */
export function resolveLoopChoice(
  choice: LoopChoice,
  selectedOptionId: string | undefined,
): LoopChoiceOption {
  const selected = choice.options.find((option) => option.id === selectedOptionId);
  return selected ?? choice.options.find((o) => o.id === choice.defaultOptionId) ?? choice.options[0]!;
}

/** Everything the composer has been set to, for one press of Start. */
export interface LoopSelection {
  /** Which checkboxes and switches are on. */
  modifierIds?: readonly string[];
  /** choiceId → optionId. Missing (or unknown) ids resolve to the default. */
  choiceIds?: Readonly<Record<string, string | undefined>>;
  /** The working window, when one is armed. */
  schedule?: LoopSchedule | null;
  /** Free text, appended last. */
  extras?: string;
}

/**
 * The one place a loop's command line is assembled.
 *
 * Pure and deterministic: base prompt, then every *on* control's fragment in
 * {@link LOOP_GROUPS} order (never the click order) — so tasks, then scope,
 * then the standing rules — then the schedule, then any free-text extras.
 * Single-space separated, whitespace-trimmed. Both the composer's Start and
 * the run record's `composedPrompt` go through here, so what ran and what
 * history says ran cannot drift.
 *
 * The model is deliberately NOT here: it is a `--model` flag on the invocation
 * (see {@link loopModelArgs}), not something an agent can be asked for in prose.
 */
export function composeLoopPrompt(
  basePrompt: string,
  loop: Pick<LoopDefinition, 'modifiers' | 'choices'>,
  selection: LoopSelection = {},
): string {
  const on = new Set(selection.modifierIds ?? []);
  const fragments: string[] = [];

  for (const group of LOOP_GROUPS) {
    for (const modifier of loop.modifiers) {
      if (modifier.group === group.id && on.has(modifier.id)) fragments.push(modifier.promptFragment);
    }
    for (const choice of loop.choices) {
      if (choice.group !== group.id) continue;
      const fragment = resolveLoopChoice(choice, selection.choiceIds?.[choice.id]).promptFragment;
      if (fragment !== undefined) fragments.push(fragment);
    }
  }

  const schedule = loopScheduleFragment(selection.schedule);
  if (schedule !== null) fragments.push(schedule);

  return [basePrompt.trim(), ...fragments, selection.extras?.trim() ?? '']
    .filter((part) => part.length > 0)
    .join(' ');
}
