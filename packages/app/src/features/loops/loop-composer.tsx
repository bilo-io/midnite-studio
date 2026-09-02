import {
  LOOP_DAY_SETS,
  LOOP_FREQUENCIES,
  LOOP_GROUPS,
  LOOP_MODELS,
  loopScheduleSummary,
  resolveLoopChoice,
  type LoopChoice,
  type LoopDays,
  type LoopDefinition,
  type LoopFrequency,
  type LoopGroup,
  type LoopModel,
  type LoopModifier,
  type LoopSchedule,
} from '@midnite/studio-shared';
import { Collapse } from '@bilo-io/ui';
import { useId, useState, type ReactNode } from 'react';
import { LuChevronRight, LuCircleStop, LuPlay } from 'react-icons/lu';

import { RadioRow, SwitchRow, SwitchTrack } from '../../components/form/toggle-rows';

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
  model,
  schedule,
  extras,
  disabled,
  disabledReason,
  onToggle,
  onChoice,
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
  model: LoopModel;
  schedule: LoopSchedule;
  extras: string;
  /** No repo selected — there is nowhere to run. */
  disabled: boolean;
  disabledReason: string | undefined;
  onToggle: (modifierId: string, on: boolean) => void;
  onChoice: (choiceId: string, optionId: string) => void;
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

  const modelLabel = LOOP_MODELS.find((entry) => entry.id === model)?.label ?? 'Default';
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
          */}
          <div className="flex max-h-72 flex-col overflow-y-auto">
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
            meta={modelLabel}
            open={!closed['model']}
            onToggle={() => toggleSection('model')}
          >
            <RadioRow
              name={`${loop.id}-model`}
              label="Model"
              hideLabel
              options={LOOP_MODELS.map(({ id, label }) => ({ id, label }))}
              value={model}
              onSelect={(id) => onModel(id as LoopModel)}
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

          <div className="flex items-end gap-2 border-t border-border/50 px-2 py-2">
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
              className="loop-spectrum-field min-h-[3.25rem] min-w-0 flex-1 resize-y rounded px-2 py-1 text-[11px] leading-relaxed outline-none"
            />
            <StartStopButton
              running={false}
              waiting={false}
              thinking={false}
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
 * The window the loop is told to work in, and how often it comes back round.
 *
 * All three axes are prompt-level, and the hint says so: Start still starts
 * now, and the composed line carries days, window and cadence as standing
 * rules that `/loop` — which paces itself and schedules its own next wake-up —
 * can honour. Promising a timer here would be promising something that does
 * not survive a quit.
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
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <label
          className="relative flex cursor-pointer items-center gap-2"
          title="Only work inside this window"
        >
          <span>Window</span>
          <input
            type="checkbox"
            role="switch"
            checked={schedule.enabled}
            onChange={(event) => onSchedule({ ...schedule, enabled: event.target.checked })}
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <SwitchTrack />
        </label>
        <input
          type="time"
          value={schedule.from}
          disabled={!schedule.enabled}
          aria-label={`Run ${loop.label} from`}
          onChange={(event) => onSchedule({ ...schedule, from: event.target.value })}
          className="loop-spectrum-field rounded px-1 py-[1px] text-[10px] outline-none disabled:opacity-50"
        />
        <span aria-hidden>→</span>
        <input
          type="time"
          value={schedule.to}
          disabled={!schedule.enabled}
          aria-label={`Run ${loop.label} until`}
          onChange={(event) => onSchedule({ ...schedule, to: event.target.value })}
          className="loop-spectrum-field rounded px-1 py-[1px] text-[10px] outline-none disabled:opacity-50"
        />
      </div>
      {empty ? (
        <p className="text-[10px] text-amber-500">
          Same start and end — no window is sent until they differ.
        </p>
      ) : null}
      <RadioRow
        name={`${loop.id}-frequency`}
        label="Every"
        options={LOOP_FREQUENCIES.map(({ id, label, promptFragment }) => ({
          id,
          label,
          title: promptFragment ?? 'No cadence is sent — the loop paces itself.',
        }))}
        value={schedule.frequency ?? 'continuous'}
        onSelect={(id) => onSchedule({ ...schedule, frequency: id as LoopFrequency })}
      />
      <RadioRow
        name={`${loop.id}-days`}
        label="On"
        options={LOOP_DAY_SETS.map(({ id, label, promptFragment }) => ({
          id,
          label,
          title: promptFragment ?? 'No day restriction is sent.',
        }))}
        value={schedule.days ?? 'all'}
        onSelect={(id) => onSchedule({ ...schedule, days: id as LoopDays })}
      />
    </>
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
  model,
  schedule,
  waiting,
  thinking,
  onStop,
}: {
  loop: LoopDefinition;
  checked: Record<string, boolean>;
  choiceIds: Record<string, string>;
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

  const modelLabel = LOOP_MODELS.find((entry) => entry.id === model);
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
  disabled,
  disabledReason,
  onClick,
}: {
  running: boolean;
  waiting: boolean;
  thinking: boolean;
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
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${glow} ${
        running
          ? 'text-foreground'
          : 'border border-border text-foreground hover:bg-accent'
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
