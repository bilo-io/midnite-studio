import {
  LOOP_FREQUENCIES,
  LOOP_GROUPS,
  LOOP_MODELS,
  LOOP_WEEKDAYS,
  loopModelsFor,
  loopScheduleSummary,
  resolveLoopChoice,
  resolveLoopDays,
  type AgentDefinition,
  type LoopChoice,
  type LoopDefinition,
  type LoopFrequency,
  type LoopGroup,
  type LoopModel,
  type LoopModifier,
  type LoopSchedule,
  type LoopWeekday,
} from '@midnite/studio-shared';
import { Collapse } from '@bilo-io/ui';
import { useId, useState, type ReactNode } from 'react';
import {
  LuBrain,
  LuCalendarDays,
  LuCalendarClock,
  LuChevronRight,
  LuCircleStop,
  LuClock,
  LuListChecks,
  LuPlay,
  LuRepeat,
  LuSettings2,
  LuTarget,
} from 'react-icons/lu';

import { RadioRow, SwitchRow, SwitchTrack } from '../../components/form/toggle-rows';
import { resolveAgentIcon } from '../../components/icons';
import type { IconComponent } from '../../components/icon-button';
import { IconSelect, MultiIconSelect, type IconSelectOption } from '../../components/select/icon-select';

/**
 * A glyph per section heading — the composer's five headings were five
 * identical rows of small uppercase text, and a form you scan for "where do I
 * set the model" is exactly where an icon earns its place.
 *
 * Keyed by section id (the three registry groups plus `model`/`schedule`),
 * with a fallback rather than a lookup that can be undefined: a loop from a
 * newer store declaring a group this build has never heard of should cost a
 * glyph, not a crashed panel — the same rule `loopIcon` follows.
 */
const SECTION_ICONS: Record<string, IconComponent> = {
  tasks: LuListChecks,
  scope: LuTarget,
  run: LuSettings2,
  model: LuBrain,
  schedule: LuCalendarClock,
};

/** The seven days as the multi-select's rows — short labels, week order. */
const DAY_OPTIONS: IconSelectOption[] = LOOP_WEEKDAYS.map((day) => ({
  id: day.id,
  label: day.short,
}));

/** Cadence rows. The neutral one's own hint is why it is not a blank. */
const FREQUENCY_OPTIONS: IconSelectOption[] = LOOP_FREQUENCIES.map(
  ({ id, label, promptFragment }) => ({
    id,
    label,
    hint: promptFragment ?? 'No cadence is sent — the loop paces itself.',
  }),
);

/**
 * The controls above a loop's terminal: what the next run will be told, and
 * the one button that starts or stops it.
 *
 * Two shapes, not two components. Idle, it is the composer — the loop's
 * declared settings in labelled accordion sections, the model and schedule in
 * two more, and a free-text field under them. Running, it collapses to a slim
 * strip: the settings that are actually in force as read-only chips, so the
 * live run's instructions stay legible without giving up the terminal's
 * height, and the glowing Stop.
 *
 * Every control is drawn as the shape of the answer it takes, which is the
 * whole reason `LoopModifier.control` and `LoopChoice` exist: additive jobs
 * are checkboxes, standing policies are switches, and mutually exclusive
 * answers are radios. A flat column of identical boxes made "Auto-merge green
 * PRs" look like one more item on a to-do list.
 *
 * The surface wears its tab's own slice of the app's rainbow — `styles.css`'s
 * `--fab-spec-1…5`, sampled from the same arc the panel's ring is masked to,
 * so the wash behind the form and the ramp around the extras field say which
 * of the four tabs you are in without a second colour vocabulary.
 */
export function LoopComposer({
  loop,
  running,
  waiting,
  thinking,
  checked,
  choiceIds,
  agents,
  agentId,
  model,
  schedule,
  extras,
  disabled,
  disabledReason,
  onToggle,
  onChoice,
  onAgent,
  onModel,
  onSchedule,
  onExtras,
  onStart,
  onStop,
}: {
  loop: LoopDefinition;
  running: boolean;
  waiting: boolean;
  /** The agent is working — what makes the glow breathe rather than sit still. */
  thinking: boolean;
  checked: Record<string, boolean>;
  /** choiceId → optionId. Unset ids resolve to the choice's own default. */
  choiceIds: Record<string, string>;
  /** The agent roster, as the provider select's rows — icon and accent included. */
  agents: readonly AgentDefinition[];
  /** Which provider runs this loop: a roster id, resolved by the caller. */
  agentId: string;
  model: LoopModel;
  schedule: LoopSchedule;
  extras: string;
  /** No repo selected — there is nowhere to run. */
  disabled: boolean;
  disabledReason: string | undefined;
  onToggle: (modifierId: string, on: boolean) => void;
  onChoice: (choiceId: string, optionId: string) => void;
  onAgent: (agentId: string) => void;
  onModel: (model: LoopModel) => void;
  onSchedule: (schedule: LoopSchedule) => void;
  onExtras: (text: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  /*
    Which accordions are open, per composer instance.

    Every section starts open, and closing one is a this-sitting convenience
    rather than a preference: the composer is permanently mounted per tab, so
    the state survives every tab switch a session will make, and persisting it
    would put four tabs × five sections of chrome bookkeeping into
    `settings.json` to remember something nobody would notice was forgotten.
    Open-by-default also means nothing a loop declares is ever one click away
    from being invisible when you first look at the tab.
  */
  const [closed, setClosed] = useState<Record<string, true>>({});
  const toggleSection = (id: string): void =>
    setClosed((current) => {
      if (current[id]) {
        const { [id]: _dropped, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: true };
    });

  const agent = agents.find((entry) => entry.id === agentId);
  const modelLabel = LOOP_MODELS.find((entry) => entry.id === model)?.label ?? 'Default';
  /*
    The heading says provider first, then model — and drops the model when it
    is the neutral one, which is not a model but the absence of a `--model`
    flag. "Claude · Default" would be a heading claiming an answer nobody gave.
  */
  const providerMeta =
    model === 'default' || loopModelsFor(agentId).length === 1
      ? (agent?.label ?? agentId)
      : `${agent?.label ?? agentId} · ${modelLabel}`;
  const scheduleSummary = loopScheduleSummary(schedule);

  return (
    <div
      className={`loop-composer-surface shrink-0 border-b border-border ${running ? 'px-2 py-2' : ''}`}
      data-testid={`loop-composer-${loop.id}`}
    >
      {running ? (
        <RunningStrip
          loop={loop}
          checked={checked}
          choiceIds={choiceIds}
          agents={agents}
          agentId={agentId}
          model={model}
          schedule={schedule}
          waiting={waiting}
          thinking={thinking}
          onStop={onStop}
        />
      ) : (
        <div className="flex flex-col">
          {/*
            Capped and scrollable rather than allowed to grow: the panel is
            320px wide by default and the terminal below it is the point of the
            tab, so a loop that declares more settings than the others must not
            push its own output off the bottom. The accordions are what make
            the cap comfortable rather than merely enforced — a tall loop is
            now two clicks from fitting, instead of a scrollbar you live with.

            **12rem, where this was 18rem.** The cap is what buys the four
            fixed rows under it — Model, Schedule, the extras field and Start —
            their place on screen, and the schedule's three-row grid plus a
            seven-chip day picker made the old figure too generous: the
            composer grew past the panel's own frame, which clips
            (`overflow-hidden`), and Start went under the fold and stopped
            taking clicks. Patrol, the tallest loop, still shows its whole
            Tasks section inside the new cap.
          */}
          <div className="flex max-h-48 flex-col overflow-y-auto">
            {LOOP_GROUPS.map((group) => (
              <SettingsGroup
                key={group.id}
                loop={loop}
                group={group.id}
                label={group.label}
                open={!closed[group.id]}
                onToggle={() => toggleSection(group.id)}
                checked={checked}
                choiceIds={choiceIds}
                onModifierToggle={onToggle}
                onChoice={onChoice}
              />
            ))}
          </div>

          {/*
            Model and Schedule sit outside the scroll region, not inside it.
            They are the two settings every loop has — the registry sections
            above are what varies per tab — so a tall loop scrolling its own
            declarations must never push "which model" and "when" out of reach.
            Their headings are always on screen; only the bodies collapse.
          */}
          <ComposerSection
            id="model"
            title="Model"
            meta={providerMeta}
            open={!closed['model']}
            onToggle={() => toggleSection('model')}
          >
            <ProviderModelRow
              agents={agents}
              agentId={agentId}
              model={model}
              onAgent={onAgent}
              onModel={onModel}
            />
          </ComposerSection>

          <ComposerSection
            id="schedule"
            title="Schedule"
            meta={schedule.enabled ? (scheduleSummary ?? 'On') : 'Off'}
            open={!closed['schedule']}
            onToggle={() => toggleSection('schedule')}
          >
            <ScheduleRows loop={loop} schedule={schedule} onSchedule={onSchedule} />
          </ComposerSection>

          {/*
            One column, not a row: the Start button sits UNDER the field at
            full width rather than beside it. Beside it, the button was the
            width of the word "Start" against a field that had already been
            narrowed to make room — and the panel's one commit action was the
            smallest target on the surface. Full width also gives its gradient
            border something to be: a 60px pill wearing a rainbow reads as a
            decoration, a full-width one reads as the button.
          */}
          <div className="flex flex-col gap-2 border-t border-border/50 px-2 py-2">
            <textarea
              value={extras}
              spellCheck={false}
              rows={2}
              placeholder="Extra instructions…"
              aria-label={`Extra instructions for ${loop.label}`}
              onChange={(event) => onExtras(event.target.value)}
              /*
                A textarea, so a paragraph of standing instructions is written
                and re-read rather than scrolled through a one-line box — and
                Return therefore has to mean "newline". Start keeps the
                accelerator it would otherwise have taken.
              */
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !disabled) {
                  event.preventDefault();
                  onStart();
                }
              }}
              className="loop-spectrum-field min-h-[3.25rem] w-full min-w-0 resize-y rounded px-2 py-1 text-[11px] leading-relaxed outline-none"
            />
            <StartStopButton
              running={false}
              waiting={false}
              thinking={false}
              fullWidth
              disabled={disabled}
              disabledReason={disabledReason}
              onClick={onStart}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One collapsible section of the composer, in the sidebar's own grammar.
 *
 * Same three parts as `TreeSection` — a rotating chevron, a small uppercase
 * title, and a `<Collapse>` body that animates a `0fr → 1fr` grid track and
 * marks itself `inert` while shut — with the delimiter carried as a `border-t`
 * on every section but the first, so the stack reads as one list of headings
 * rather than five boxes. It is deliberately *not* `TreeSection` itself: that
 * component is measured on `TREE_INDENT`'s depth ladder and hides itself at
 * `count === 0`, and neither behaviour has a meaning in a 320px form.
 */
function ComposerSection({
  id,
  title,
  group,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  /** Set only on the three sections the loop registry itself declares. */
  group?: LoopGroup;
  /** What the section says while shut — the reason closing one is safe. */
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  const Icon = SECTION_ICONS[id] ?? LuSettings2;
  return (
    <section
      data-loop-section={id}
      {...(group ? { 'data-loop-group': group } : {})}
      className="border-t border-border/50 first:border-t-0"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex h-7 w-full items-center gap-1.5 px-2 text-left transition-colors hover:text-foreground"
      >
        <LuChevronRight
          aria-hidden
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
            open ? 'rotate-90' : ''
          }`}
        />
        <Icon aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
        <h4 className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {meta === undefined ? null : (
          <span className="ml-auto min-w-0 truncate pl-2 text-[10px] text-muted-foreground/70">
            {meta}
          </span>
        )}
      </button>
      <Collapse open={open} id={bodyId} aria-label={title}>
        <div className="flex flex-col gap-1.5 px-2 pb-2">{children}</div>
      </Collapse>
    </section>
  );
}

/**
 * One registry section — Tasks, Scope or Run — drawn only if the loop declares
 * something in it. Checkboxes first, then switches, then the radio groups, so
 * "what it does" precedes "how it behaves" inside a section the same way it
 * does between them.
 *
 * The boxes sit in a two-column grid rather than a column. They are the one
 * control here whose label is short and whose neighbours are its peers — five
 * of them stacked read as a to-do list you work down, where the truth is that
 * any subset is a valid run — and two columns halve the height the tallest
 * loop costs before anything is collapsed. Switches keep their own full-width
 * rows: the label is on the left and the track on the right, and a
 * half-width row leaves neither enough space to land.
 */
function SettingsGroup({
  loop,
  group,
  label,
  open,
  onToggle,
  checked,
  choiceIds,
  onModifierToggle,
  onChoice,
}: {
  loop: LoopDefinition;
  group: LoopGroup;
  label: string;
  open: boolean;
  /** Opens or shuts the section. */
  onToggle: () => void;
  checked: Record<string, boolean>;
  choiceIds: Record<string, string>;
  /** Reports a control being switched — named apart from the section's own. */
  onModifierToggle: (modifierId: string, on: boolean) => void;
  onChoice: (choiceId: string, optionId: string) => void;
}) {
  const modifiers = loop.modifiers.filter((m) => m.group === group);
  const boxes = modifiers.filter((m) => m.control === 'checkbox');
  const switches = modifiers.filter((m) => m.control === 'switch');
  const choices = loop.choices.filter((c) => c.group === group);
  if (modifiers.length === 0 && choices.length === 0) return null;

  /*
    What the heading says while the section is shut: how many of its controls
    are actually on. A collapsed section that reported nothing would be the
    one way this layout could lose information the flat list always showed.
  */
  const onCount = modifiers.filter((m) => checked[m.id]).length;

  return (
    <ComposerSection
      id={group}
      group={group}
      title={label}
      meta={onCount > 0 ? `${onCount} on` : undefined}
      open={open}
      onToggle={onToggle}
    >
      {boxes.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {boxes.map((modifier) => (
            <CheckboxRow
              key={modifier.id}
              modifier={modifier}
              on={checked[modifier.id] ?? false}
              onToggle={onModifierToggle}
            />
          ))}
        </div>
      ) : null}
      {switches.map((modifier) => (
        <SwitchRow
          key={modifier.id}
          id={modifier.id}
          label={modifier.label}
          title={modifier.promptFragment}
          on={checked[modifier.id] ?? false}
          onToggle={onModifierToggle}
        />
      ))}
      {choices.map((choice) => (
        <ChoiceRow
          key={choice.id}
          loopId={loop.id}
          choice={choice}
          selectedId={choiceIds[choice.id]}
          onChoice={onChoice}
        />
      ))}
    </ComposerSection>
  );
}

/** An additive job: many of these can be true at once. */
function CheckboxRow({
  modifier,
  on,
  onToggle,
}: {
  modifier: LoopModifier;
  on: boolean;
  onToggle: (modifierId: string, on: boolean) => void;
}) {
  return (
    <label
      title={modifier.promptFragment}
      className="flex min-w-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onToggle(modifier.id, event.target.checked)}
        className="h-3 w-3 shrink-0 accent-primary"
      />
      <span className="truncate">{modifier.label}</span>
    </label>
  );
}

/** One of N, because the options contradict each other. */
function ChoiceRow({
  loopId,
  choice,
  selectedId,
  onChoice,
}: {
  loopId: string;
  choice: LoopChoice;
  selectedId: string | undefined;
  onChoice: (choiceId: string, optionId: string) => void;
}) {
  const selected = resolveLoopChoice(choice, selectedId);
  return (
    <RadioRow
      name={`${loopId}-${choice.id}`}
      label={choice.label}
      options={choice.options.map((option) => ({
        id: option.id,
        label: option.label,
        title: option.promptFragment,
      }))}
      value={selected.id}
      onSelect={(id) => onChoice(choice.id, id)}
    />
  );
}

/**
 * Which provider, and then which of its models — two selects on one row.
 *
 * This was one radio group over `LOOP_MODELS`, which could only ever answer
 * half the question: `LoopDefinition.agentId` has always existed so that "a
 * per-tab agent picker later is a data change, not a schema change", and the
 * composer never offered it. Now it does, and the model list is a function of
 * the answer — `loopModelsFor` collapses to the single neutral entry for every
 * agent whose CLI has no `--model`, so the pair can never offer Opus to
 * `codex` and then silently drop the flag.
 *
 * Two caveats worth knowing before switching a loop off Claude, both inherited
 * rather than introduced here: `claude` is the only roster agent with
 * `activity` markers, so a loop on another provider still runs but its
 * Start/Stop glow and waiting-detection are guesses; and the loop's base
 * prompt is a `/loop …` skill invocation, which is Claude Code's own dialect.
 * The disabled model select says the first part; the roster is what a user who
 * wants the second is reaching for anyway.
 */
function ProviderModelRow({
  agents,
  agentId,
  model,
  onAgent,
  onModel,
}: {
  agents: readonly AgentDefinition[];
  agentId: string;
  model: LoopModel;
  onAgent: (agentId: string) => void;
  onModel: (model: LoopModel) => void;
}) {
  const models = loopModelsFor(agentId);
  const modelOptions: IconSelectOption[] = models.map((entry) => ({
    id: entry.id,
    label: entry.label,
    hint: entry.cliModel ?? "No --model flag — the CLI's own configuration decides.",
  }));
  /*
    A provider with one model has nothing to pick, and showing a stored
    `opus-5` under `codex` would claim a flag that is never passed. The value
    shown falls back to the neutral entry rather than the store's answer, which
    is kept — switch back to Claude and the model you chose is still there.
  */
  const shown = models.some((entry) => entry.id === model) ? model : 'default';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <IconSelect
          ariaLabel="Provider"
          menuInPortal
          options={agents.map((agent) => ({
            id: agent.id,
            label: agent.label,
            icon: resolveAgentIcon(agent),
            iconColor: agent.accent,
          }))}
          value={agentId}
          onChange={onAgent}
        />
      </div>
      <div className="min-w-0 flex-1">
        <IconSelect
          ariaLabel="Model"
          menuInPortal
          options={modelOptions}
          value={shown}
          isDisabled={modelOptions.length === 1}
          onChange={(id) => onModel(id as LoopModel)}
        />
      </div>
    </div>
  );
}

/**
 * The window the loop is told to work in, which days it may work at all, and
 * how often it comes back round.
 *
 * All three axes are prompt-level, and the hint says so: Start still starts
 * now, and the composed line carries days, window and cadence as standing
 * rules that `/loop` — which paces itself and schedules its own next wake-up —
 * can honour. Promising a timer here would be promising something that does
 * not survive a quit.
 *
 * **One label column, three rows.** The three axes used to be a wrapping flex
 * row of switch-plus-two-time-fields with two pill groups under it, and at
 * 320px the window row wrapped mid-control — the `→` between the times landing
 * on its own line. A two-column grid (`auto` label, `1fr` control) is what
 * makes the three answers line up as three answers, and the icon in each label
 * is what makes them findable without reading all three.
 *
 * Frequency and days stay live while the master switch is off, unlike the two
 * time fields. They are answers you set once and leave alone, and greying them
 * out would mean re-answering them every time a loop is re-armed; the window,
 * by contrast, is the thing the switch is *about*.
 */
function ScheduleRows({
  loop,
  schedule,
  onSchedule,
}: {
  loop: LoopDefinition;
  schedule: LoopSchedule;
  onSchedule: (schedule: LoopSchedule) => void;
}) {
  const empty = schedule.enabled && schedule.from === schedule.to;
  const days = resolveLoopDays(schedule.days);

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
      <ScheduleLabel icon={LuClock} text="Window" title="Only work inside this window" />
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <label className="relative flex cursor-pointer items-center" title="Only work inside this window">
          <span className="sr-only">Window</span>
          <input
            type="checkbox"
            role="switch"
            checked={schedule.enabled}
            onChange={(event) => onSchedule({ ...schedule, enabled: event.target.checked })}
            /*
              `z-10`, unlike every other switch in this form: those sit in a
              full-width row where the label text is the click target, and this
              one's label lives in the grid cell to its left, so the input's box
              is exactly the painted track's. The track is a positioned sibling
              declared after it and would otherwise take the click — Playwright
              reports it as "intercepts pointer events", and a user clicking the
              switch would find it dead.
            */
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <SwitchTrack />
        </label>
        <input
          type="time"
          value={schedule.from}
          disabled={!schedule.enabled}
          aria-label={`Run ${loop.label} from`}
          onChange={(event) => onSchedule({ ...schedule, from: event.target.value })}
          className="loop-spectrum-field min-w-0 flex-1 rounded px-1 py-[2px] text-[10px] outline-none disabled:opacity-50"
        />
        <span aria-hidden className="shrink-0">
          →
        </span>
        <input
          type="time"
          value={schedule.to}
          disabled={!schedule.enabled}
          aria-label={`Run ${loop.label} until`}
          onChange={(event) => onSchedule({ ...schedule, to: event.target.value })}
          className="loop-spectrum-field min-w-0 flex-1 rounded px-1 py-[2px] text-[10px] outline-none disabled:opacity-50"
        />
      </div>

      {empty ? (
        <p className="col-span-2 text-[10px] text-amber-500">
          Same start and end — no window is sent until they differ.
        </p>
      ) : null}

      <ScheduleLabel icon={LuRepeat} text="Every" title="How often the loop takes another pass" />
      <IconSelect
        ariaLabel="Every"
        menuInPortal
        options={FREQUENCY_OPTIONS}
        value={schedule.frequency ?? 'continuous'}
        onChange={(id) => onSchedule({ ...schedule, frequency: id as LoopFrequency })}
      />

      <ScheduleLabel icon={LuCalendarDays} text="Days" title="Which days it may work at all" />
      <MultiIconSelect
        ariaLabel="Days"
        menuInPortal
        options={DAY_OPTIONS}
        values={days}
        placeholder="Every day"
        onChange={(ids) => onSchedule({ ...schedule, days: ids as LoopWeekday[] })}
      />

      {days.length === 0 ? (
        /*
          The mirror of the zero-width-window warning above, and for the same
          reason: an empty selection is a user mid-edit, and `loopDaysFragment`
          reads it as neutral rather than composing "work on no days", which
          would contradict the Start that is about to be pressed.
        */
        <p className="col-span-2 text-[10px] text-amber-500">
          No days picked — no day restriction is sent until at least one is.
        </p>
      ) : null}
    </div>
  );
}

/** The left column of a schedule row: one glyph, one word. */
function ScheduleLabel({
  icon: Icon,
  text,
  title,
}: {
  icon: IconComponent;
  text: string;
  title: string;
}) {
  return (
    <span
      title={title}
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      aria-hidden
    >
      <Icon className="h-3 w-3 shrink-0" />
      {text}
    </span>
  );
}

/**
 * What a live run is actually carrying, as chips.
 *
 * Every setting that reached the command line is here, not just the checkboxes:
 * a run on Opus inside a 22:00–06:00 window is a different run from the default
 * one, and the strip that claims to say what is in force has to say so.
 */
function RunningStrip({
  loop,
  checked,
  choiceIds,
  agents,
  agentId,
  model,
  schedule,
  waiting,
  thinking,
  onStop,
}: {
  loop: LoopDefinition;
  checked: Record<string, boolean>;
  choiceIds: Record<string, string>;
  agents: readonly AgentDefinition[];
  agentId: string;
  model: LoopModel;
  schedule: LoopSchedule;
  waiting: boolean;
  thinking: boolean;
  onStop: () => void;
}) {
  const chips: { key: string; label: string; title?: string }[] = [];

  for (const group of LOOP_GROUPS) {
    for (const modifier of loop.modifiers) {
      if (modifier.group === group.id && checked[modifier.id]) {
        chips.push({ key: modifier.id, label: modifier.label, title: modifier.promptFragment });
      }
    }
    for (const choice of loop.choices) {
      if (choice.group !== group.id) continue;
      const option = resolveLoopChoice(choice, choiceIds[choice.id]);
      // The neutral option adds nothing to the line, so it is not "in force".
      if (option.promptFragment === undefined) continue;
      chips.push({ key: choice.id, label: option.label, title: option.promptFragment });
    }
  }

  /*
    The provider, but only when it is not the one the loop declares — the same
    rule the model chip follows one line down. Every run carries an agent, so a
    chip for the default one would be on every strip and would stop "Running
    with defaults" from ever being the honest thing to say.
  */
  if (agentId !== loop.agentId) {
    const agent = agents.find((entry) => entry.id === agentId);
    chips.push({ key: 'agent', label: agent?.label ?? agentId });
  }
  /*
    …and the model, but only one the chosen provider can actually be given.
    `cliModel !== null` alone was the whole test, which made a strip claim
    "Codex · Opus 5" for a run whose command line carried no `--model` at all —
    the section heading two rows up already drops it, and the two must agree
    about what the run costs. Same rule, one source: `loopModelsFor`.
  */
  const modelLabel = loopModelsFor(agentId).find((entry) => entry.id === model);
  if (modelLabel && modelLabel.cliModel !== null) {
    chips.push({ key: 'model', label: modelLabel.label });
  }
  /*
    One chip for the whole schedule, and the same neutrality rule the composed
    line uses — `loopScheduleSummary` returns null exactly when
    `loopScheduleFragment` does, so the strip cannot claim a run is scheduled
    on a line that says nothing about scheduling.
  */
  const window = loopScheduleSummary(schedule);
  if (window !== null) {
    chips.push({ key: 'schedule', label: window });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {chips.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">Running with defaults</span>
        ) : (
          chips.map((chip) => (
            <span
              key={chip.key}
              title={chip.title}
              className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {chip.label}
            </span>
          ))
        )}
      </div>
      <StartStopButton
        running
        waiting={waiting}
        thinking={thinking}
        disabled={false}
        onClick={onStop}
      />
    </div>
  );
}

/**
 * One button in two states, rather than two buttons — the phase it reads is
 * derived from the session (`useLoopStatus`), so a loop that exits on its own
 * flips this back to Start with nothing else bookkeeping it.
 */
function StartStopButton({
  running,
  waiting,
  thinking,
  fullWidth = false,
  disabled,
  disabledReason,
  onClick,
}: {
  running: boolean;
  waiting: boolean;
  thinking: boolean;
  /** Start, under the extras field. Stop keeps its place at the end of the strip. */
  fullWidth?: boolean;
  disabled: boolean;
  disabledReason?: string | undefined;
  onClick: () => void;
}) {
  /*
    Three states, not two. A waiting loop drops the rotation for one steady
    amber ring — the colour you can spot across four tabs. A thinking one
    breathes. A live-but-idle one keeps the rainbow ring without the pulse, so
    motion means "working" rather than merely "on".
  */
  const glow = !running
    ? ''
    : waiting
      ? 'loop-run-glow is-waiting'
      : thinking
        ? 'loop-run-glow is-thinking'
        : 'loop-run-glow';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      data-testid={running ? 'loop-stop' : 'loop-start'}
      data-running={running ? 'true' : undefined}
      /*
        Idle, the button wears `.loop-start-gradient`: the tab's own
        sub-spectrum as a conic border at rest, and on hover the full-strength
        ramp orbiting behind a pulsing glow. That class owns the border
        longhand (the two-layer `background-clip` trick needs a transparent
        one), so `border-border` is not co-applied — it would paint an opaque
        line straight over the gradient, which is the same trap
        `.gradient-border--always` documents further up `styles.css`.
      */
      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        fullWidth ? 'w-full justify-center' : 'shrink-0'
      } ${glow} ${
        running
          ? 'text-foreground'
          : 'loop-start-gradient text-foreground'
      }`}
    >
      {running ? (
        <LuCircleStop aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <LuPlay aria-hidden className="h-3.5 w-3.5" />
      )}
      {running ? 'Stop' : 'Start'}
    </button>
  );
}
