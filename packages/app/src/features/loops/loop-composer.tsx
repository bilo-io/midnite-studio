import {
  LOOP_GROUPS,
  LOOP_MODELS,
  loopScheduleFragment,
  resolveLoopChoice,
  type LoopChoice,
  type LoopDefinition,
  type LoopGroup,
  type LoopModel,
  type LoopModifier,
  type LoopSchedule,
} from '@midnite/studio-shared';
import { LuCircleStop, LuPlay } from 'react-icons/lu';

/**
 * The controls above a loop's terminal: what the next run will be told, and
 * the one button that starts or stops it.
 *
 * Two shapes, not two components. Idle, it is the composer — the loop's
 * declared settings in three labelled sections, the model and schedule under
 * them, and a free-text field. Running, it collapses to a slim strip: the
 * settings that are actually in force as read-only chips, so the live run's
 * instructions stay legible without giving up the terminal's height, and the
 * glowing Stop.
 *
 * Every control is drawn as the shape of the answer it takes, which is the
 * whole reason `LoopModifier.control` and `LoopChoice` exist: additive jobs
 * are checkboxes, standing policies are switches, and mutually exclusive
 * answers are radios. A flat column of identical boxes made "Auto-merge green
 * PRs" look like one more item on a to-do list.
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
  return (
    <div className="shrink-0 border-b border-border px-2 py-2" data-testid={`loop-composer-${loop.id}`}>
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
        <div className="flex flex-col gap-2">
          {/*
            Capped and scrollable rather than allowed to grow: the panel is
            320px wide by default and the terminal below it is the point of the
            tab, so a loop that declares more settings than the others must not
            push its own output off the bottom. The cap clears the tallest loop
            the registry ships (Medic, nine controls) — it is a ceiling for a
            future one, not a scrollbar the shipped tabs live with.
          */}
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {LOOP_GROUPS.map((group) => (
              <SettingsGroup
                key={group.id}
                loop={loop}
                group={group.id}
                label={group.label}
                checked={checked}
                choiceIds={choiceIds}
                onToggle={onToggle}
                onChoice={onChoice}
              />
            ))}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
            <RadioRow
              name={`${loop.id}-model`}
              label="Model"
              options={LOOP_MODELS.map(({ id, label }) => ({ id, label }))}
              value={model}
              onSelect={(id) => onModel(id as LoopModel)}
            />
            <ScheduleRow loop={loop} schedule={schedule} onSchedule={onSchedule} />
          </div>

          <div className="flex items-end gap-2">
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
              className="min-h-[3.25rem] min-w-0 flex-1 resize-y rounded border border-input bg-background px-2 py-1 text-[11px] leading-relaxed outline-none focus-visible:border-primary"
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
 * One labelled section — Tasks, Scope or Run — drawn only if the loop declares
 * something in it. Checkboxes first, then switches, then the radio groups, so
 * "what it does" precedes "how it behaves" inside a section the same way it
 * does between them.
 */
function SettingsGroup({
  loop,
  group,
  label,
  checked,
  choiceIds,
  onToggle,
  onChoice,
}: {
  loop: LoopDefinition;
  group: LoopGroup;
  label: string;
  checked: Record<string, boolean>;
  choiceIds: Record<string, string>;
  onToggle: (modifierId: string, on: boolean) => void;
  onChoice: (choiceId: string, optionId: string) => void;
}) {
  const modifiers = loop.modifiers.filter((m) => m.group === group);
  const boxes = modifiers.filter((m) => m.control === 'checkbox');
  const switches = modifiers.filter((m) => m.control === 'switch');
  const choices = loop.choices.filter((c) => c.group === group);
  if (modifiers.length === 0 && choices.length === 0) return null;

  return (
    <section className="flex flex-col gap-1" data-loop-group={group}>
      <h4 className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </h4>
      {boxes.map((modifier) => (
        <CheckboxRow
          key={modifier.id}
          modifier={modifier}
          on={checked[modifier.id] ?? false}
          onToggle={onToggle}
        />
      ))}
      {switches.map((modifier) => (
        <SwitchRow
          key={modifier.id}
          modifier={modifier}
          on={checked[modifier.id] ?? false}
          onToggle={onToggle}
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
    </section>
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
      className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground"
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

/**
 * A standing policy: in force for the whole run, or not.
 *
 * A real `<input type="checkbox">` under the paint, with `role="switch"` on
 * it — that is the one shape that keeps the label association, the keyboard
 * behaviour and the form semantics while reading as a toggle. The visible
 * track is a sibling styled off `peer-checked`, so no state lives in the DOM
 * twice.
 *
 * Transparent and stretched over the row rather than `sr-only`: the hidden
 * input is still what a click and a Playwright hit-target check land on, and a
 * 1px clipped box in the corner is not something either can hit.
 */
function SwitchRow({
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
      className="relative flex cursor-pointer items-center justify-between gap-2 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <span className="min-w-0 truncate">{modifier.label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(event) => onToggle(modifier.id, event.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="relative h-3.5 w-6 shrink-0 rounded-full bg-muted transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-2.5 after:w-2.5 after:rounded-full after:bg-background after:transition-transform after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-[10px] peer-focus-visible:ring-1 peer-focus-visible:ring-ring"
      />
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
 * A radio group as a wrapping row of pills.
 *
 * The `<input type="radio">` is real and merely transparent — stretched over
 * its pill, so the pill *is* the input's hit target: arrow-key roving, the
 * label association and the accessible name all come free. Segmented rather
 * than stacked because these groups are two or three short words each, and a
 * 320px panel has width to spare where it has no height to.
 */
function RadioRow({
  name,
  label,
  options,
  value,
  onSelect,
}: {
  name: string;
  label: string;
  options: { id: string; label: string; title?: string | undefined }[];
  value: string;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
    >
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {options.map((option) => {
          const on = option.id === value;
          return (
            <label
              key={option.id}
              title={option.title}
              className={`relative cursor-pointer rounded-full border px-1.5 py-[1px] text-[10px] transition-colors ${
                on
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={on}
                onChange={() => onSelect(option.id)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The window the loop is told to work in.
 *
 * Prompt-level, and the hint says so: Start still starts now, and the composed
 * line carries the window as a standing rule that `/loop` — which paces itself
 * — can honour. Promising a timer here would be promising something that does
 * not survive a quit.
 */
function ScheduleRow({
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <label
          className="relative flex cursor-pointer items-center gap-2"
          title="Only work inside this window"
        >
          <span>Schedule</span>
          <input
            type="checkbox"
            role="switch"
            checked={schedule.enabled}
            onChange={(event) => onSchedule({ ...schedule, enabled: event.target.checked })}
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden
            className="relative h-3.5 w-6 shrink-0 rounded-full bg-muted transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-2.5 after:w-2.5 after:rounded-full after:bg-background after:transition-transform after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-[10px] peer-focus-visible:ring-1 peer-focus-visible:ring-ring"
          />
        </label>
        <input
          type="time"
          value={schedule.from}
          disabled={!schedule.enabled}
          aria-label={`Run ${loop.label} from`}
          onChange={(event) => onSchedule({ ...schedule, from: event.target.value })}
          className="rounded border border-input bg-background px-1 py-[1px] text-[10px] outline-none focus-visible:border-primary disabled:opacity-50"
        />
        <span aria-hidden>→</span>
        <input
          type="time"
          value={schedule.to}
          disabled={!schedule.enabled}
          aria-label={`Run ${loop.label} until`}
          onChange={(event) => onSchedule({ ...schedule, to: event.target.value })}
          className="rounded border border-input bg-background px-1 py-[1px] text-[10px] outline-none focus-visible:border-primary disabled:opacity-50"
        />
      </div>
      {empty ? (
        <p className="text-[10px] text-amber-500">
          Same start and end — no window is sent until they differ.
        </p>
      ) : null}
    </div>
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
  const window = loopScheduleFragment(schedule);
  if (window !== null) {
    chips.push({ key: 'schedule', label: `${schedule.from}–${schedule.to}`, title: window });
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
