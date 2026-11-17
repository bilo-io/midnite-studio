import {
  LOOP_AUTO_ROTATE,
  LOOP_FREQUENCIES,
  LOOP_GROUPS,
  LOOP_MODELS,
  LOOP_WEEKDAYS,
  loopModelsFor,
  loopScheduleSummary,
  resolveLoopChoice,
  resolveLoopDays,
  type AgentDefinition,
  type KnownSkill,
  type LoopChoice,
  type LoopDefinition,
  type LoopFrequency,
  type LoopGroup,
  type LoopModifier,
  type LoopModel,
  type LoopSchedule,
  type LoopWeekday,
  isCustomLoop,
  type CustomLoop,
} from '@midnite/studio-shared';
import { Collapse, Slider, sliderValue } from '@bilo-io/ui';
import { useId, useState, type ReactNode } from 'react';

import {
  LuBrain,
  LuCalendarDays,
  LuCalendarClock,
  LuChevronRight,
  LuClock,
  LuListChecks,
  LuPlay,
  LuRepeat,
  LuSettings2,
  LuTarget,
} from 'react-icons/lu';

import { RadioRow, SwitchTrack, type IconComponent } from '@midnite/studio-frame';

import { useLoopsHost, type LoopsSelectOption as IconSelectOption } from './host';
import { ExtrasComposer, IconSelect, MultiIconSelect } from './loops-chrome';
import { useLoopsState } from './use-loops-host-state';
import { CustomLoopEditor, CustomLoopToolbar } from './custom-loop-editor';
import { LoopOptionRow } from './loop-option-row';
import { loopLabel } from './use-all-loops';

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
 * The loop's declared settings in labelled accordion sections, the model and
 * schedule in two more, and a free-text field under them with its own Send,
 * then one wide rainbow button that does the same. The composer never turns
 * into a running state: every press dispatches a fresh session to the
 * terminal panel's "Loops" group, so the form stays ready for the next one.
 *
 * Every on/off option is a switch row (`LoopOptionRow`) — with a tooltip
 * saying what it does, a chevron showing the exact words it adds, and a skill
 * field while it is on if its fragment names a skill — and mutually exclusive
 * answers are radios. Jobs are listed before standing policies inside each
 * section, which is all `LoopModifier.control` still decides.
 *
 * The surface wears its tab's own slice of the app's rainbow — `styles.css`'s
 * `--fab-spec-1…5`, sampled from the same arc the panel's ring is masked to,
 * so the wash behind the form and the ramp around the extras field say which
 * of the six tabs you are in without a second colour vocabulary.
 */
export function LoopComposer({
  loop,
  checked,
  choiceIds,
  agents,
  agentId,
  model,
  schedule,
  extras,
  skills,
  skillSuggestions,
  reviewUsers,
  contributorOptions,
  autoRotatePercent,
  disabled,
  disabledReason,
  onToggle,
  onSkill,
  onReviewUsers,
  onAutoRotate,
  onChoice,
  onAgent,
  onModel,
  onSchedule,
  onExtras,
  onStart,
}: {
  loop: LoopDefinition;
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
  /** modifierId → the text in that option's skill field. */
  skills: Record<string, string>;
  /** The skill field's suggestions — bundled, repo and user skills. */
  skillSuggestions: readonly KnownSkill[];
  /**
   * Contributor usernames the Users filter restricts review to. Only drawn
   * when the loop `reviewsPrs`.
   */
  reviewUsers: readonly string[];
  contributorOptions: readonly IconSelectOption[];
  /** Rotate subagents at this percentage of their context ({@link LOOP_AUTO_ROTATE}). */
  autoRotatePercent: number;
  /** No repo selected — there is nowhere to run. */
  disabled: boolean;
  disabledReason: string | undefined;
  onToggle: (modifierId: string, on: boolean) => void;
  onSkill: (modifierId: string, skill: string) => void;
  onReviewUsers: (users: string[]) => void;
  onAutoRotate: (percent: number) => void;
  onChoice: (choiceId: string, optionId: string) => void;
  onAgent: (agentId: string) => void;
  onModel: (model: LoopModel) => void;
  onSchedule: (schedule: LoopSchedule) => void;
  onExtras: (text: string) => void;
  /** Dispatch one session of this loop — the extras field's Send and the wide button below it. */
  onStart: () => void;
}) {
  /*
    Which accordions are open, per composer instance.

    Every section starts open, and closing one is a this-sitting convenience
    rather than a preference: the composer is permanently mounted per tab, so
    the state survives every tab switch a session will make, and persisting it
    would put six tabs × five sections of chrome bookkeeping into
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
  const rowProps: SettingsRowProps = {
    loopId: loop.id,
    checked,
    choiceIds,
    skills,
    skillSuggestions,
    reviewUsers,
    contributorOptions,
    onModifierToggle: onToggle,
    onSkill,
    onReviewUsers,
    onChoice,
  };

  return (
    <div
      className="loop-composer-surface shrink-0 border-b border-border"
      data-testid={`loop-composer-${loop.id}`}
    >
      <div className="flex flex-col">
        {isCustomLoop(loop) ? <CustomLoopHeader loop={loop} /> : null}
        {/*
            Every accordion below renders its full content — no cap, no
            scrollbar of its own. The cap that keeps a tall loop's settings
            from pushing Start (and the terminal below this whole component)
            off screen now lives one level up, on the wrapper in
            `loop-tab.tsx` that holds this composer AND `LoopHistory`
            together: one scrollbar for that combined region instead of one
            here and a second inside history's own expanded list.
          */}
        <div className="flex flex-col">
          {isCustomLoop(loop) ? (
            <CustomLoopSections
              loop={loop}
              closed={closed}
              toggleSection={toggleSection}
              rows={rowProps}
            />
          ) : (
            LOOP_GROUPS.map((group) => (
              <SettingsGroup
                key={group.id}
                id={group.id}
                group={group.id}
                label={group.label}
                modifiers={loop.modifiers.filter((m) => m.group === group.id)}
                choices={loop.choices.filter((c) => c.group === group.id)}
                usersFilter={group.id === 'scope' && loop.reviewsPrs === true}
                open={!closed[group.id]}
                onToggle={() => toggleSection(group.id)}
                {...rowProps}
              />
            ))
          )}
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
          <AutoRotateSlider percent={autoRotatePercent} onPercent={onAutoRotate} />
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
            The extras composer's own Send and the wide rainbow button under
            it both dispatch: Send for a keyboard user finishing a sentence,
            the button as the panel's one unmistakable primary action.
          */}
        <div className="flex flex-col gap-2 border-t border-border/50 px-2 py-2">
          {/*
              A textarea, so a paragraph of standing instructions is written
              and re-read rather than scrolled through a one-line box — Return
              is therefore a newline, and Cmd/Ctrl+Return sends (= Start).
              Send and Mic sit inside the box, bottom-left, like every prompt.
            */}
          <ExtrasComposer
            value={extras}
            onChange={onExtras}
            onSend={onStart}
            canSend={!disabled}
            enterToSend={false}
            rows={2}
            placeholder="Extra instructions…"
            ariaLabel={`Extra instructions for ${loopLabel(loop)}`}
            sendAriaLabel={`Start ${loopLabel(loop)} with these instructions`}
            sendTooltip={disabled ? disabledReason : 'Start (Cmd/Ctrl+Enter)'}
            testIdPrefix="loop-extras"
          />
          <button
            type="button"
            onClick={onStart}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            data-testid="loop-start"
            className="brand-gradient-button flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-semibold disabled:cursor-not-allowed"
          >
            <LuPlay aria-hidden className="h-3.5 w-3.5" />
            Start {loopLabel(loop)}
          </button>
        </div>
      </div>
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
  icon,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  /** Overrides the id's own glyph — a custom loop's sections have ids no table knows. */
  icon?: IconComponent;
  /** Set only on the three sections the loop registry itself declares. */
  group?: LoopGroup;
  /** What the section says while shut — the reason closing one is safe. */
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  const Icon = icon ?? SECTION_ICONS[id] ?? LuSettings2;
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
 * something in it. Jobs first, then standing policies, then the radio groups,
 * so "what it does" precedes "how it behaves" inside a section the same way it
 * does between them. Every on/off option is a full-width `LoopOptionRow`: the
 * old two-column checkbox grid had no room for a tooltip, a prompt preview or
 * a skill field.
 *
 * Two controls here are not registry options: the Run section's "Loop" switch
 * (off runs the command once, without `/loop`) and, on a loop that reviews
 * PRs, the Scope section's Users filter.
 */
type SettingsRowProps = {
  loopId: string;
  checked: Record<string, boolean>;
  choiceIds: Record<string, string>;
  skills: Record<string, string>;
  skillSuggestions: readonly KnownSkill[];
  reviewUsers: readonly string[];
  contributorOptions: readonly IconSelectOption[];
  /** Reports a control being switched — named apart from the section's own. */
  onModifierToggle: (modifierId: string, on: boolean) => void;
  onSkill: (modifierId: string, skill: string) => void;
  onReviewUsers: (users: string[]) => void;
  onChoice: (choiceId: string, optionId: string) => void;
};

function SettingsGroup({
  id,
  group,
  label,
  icon,
  modifiers,
  choices,
  usersFilter,
  emptyHint,
  open,
  onToggle,
  loopId,
  checked,
  choiceIds,
  skills,
  skillSuggestions,
  reviewUsers,
  contributorOptions,
  onModifierToggle,
  onSkill,
  onReviewUsers,
  onChoice,
}: SettingsRowProps & {
  id: string;
  /** Set on the three registry sections; a custom loop's own sections have none. */
  group?: LoopGroup;
  label: string;
  icon?: IconComponent;
  modifiers: readonly LoopModifier[];
  choices: readonly LoopChoice[];
  /** Draw the Users filter (a loop that `reviewsPrs`) at the end of this section. */
  usersFilter: boolean;
  /**
   * What an empty section says. Absent, an empty section is not drawn at all,
   * which is right for a built-in's fixed groups; a custom loop's author made
   * the section, so it says it is waiting for options instead of vanishing.
   */
  emptyHint?: string;
  open: boolean;
  /** Opens or shuts the section. */
  onToggle: () => void;
}) {
  // Jobs before standing policies; a stable sort keeps declaration order within each.
  const ordered = [
    ...modifiers.filter((m) => m.control !== 'switch'),
    ...modifiers.filter((m) => m.control === 'switch'),
  ];
  const empty = modifiers.length === 0 && choices.length === 0 && !usersFilter;
  if (empty && emptyHint === undefined) return null;

  /*
    What the heading says while the section is shut: how many of its controls
    are actually on. A collapsed section that reported nothing would be the
    one way this layout could lose information the flat list always showed.
  */
  const onCount = modifiers.filter((m) => checked[m.id]).length;

  return (
    <ComposerSection
      id={id}
      {...(group ? { group } : {})}
      {...(icon ? { icon } : {})}
      title={label}
      meta={onCount > 0 ? `${onCount} on` : undefined}
      open={open}
      onToggle={onToggle}
    >
      {empty ? <p className="text-[11px] text-muted-foreground">{emptyHint}</p> : null}
      {ordered.map((modifier) => (
        <LoopOptionRow
          key={modifier.id}
          modifier={modifier}
          on={checked[modifier.id] ?? false}
          skill={skills[modifier.id] ?? ''}
          skillSuggestions={skillSuggestions}
          onToggle={onModifierToggle}
          onSkill={onSkill}
        />
      ))}
      {choices.map((choice) => (
        <ChoiceRow
          key={choice.id}
          loopId={loopId}
          choice={choice}
          selectedId={choiceIds[choice.id]}
          onChoice={onChoice}
        />
      ))}
      {usersFilter ? (
        <div className="flex min-w-0 flex-col gap-1" data-testid="review-users-field">
          <span className="text-[11px] text-muted-foreground">Users</span>
          <MultiIconSelect
            ariaLabel="Review PRs for these users only"
            menuInPortal
            options={[...contributorOptions]}
            values={[...reviewUsers]}
            placeholder="All contributors"
            onChange={(ids) => onReviewUsers(ids)}
          />
        </div>
      ) : null}
    </ComposerSection>
  );
}

/**
 * A custom loop's sections: the author's own, in their order, then the shared
 * Run section every loop has (the common switches, Autonomy, and the Users
 * filter on a loop that reviews PRs) — which the author cannot edit, exactly
 * as a built-in's Model and Schedule are not. In Edit mode the author's own
 * sections give way to the editor; Run stays, so the form keeps its footing.
 */
function CustomLoopSections({
  loop,
  closed,
  toggleSection,
  rows,
}: {
  loop: CustomLoop;
  closed: Record<string, true>;
  toggleSection: (id: string) => void;
  rows: SettingsRowProps;
}) {
  const editing = useLoopsState((s) => s.customLoopEditing === loop.id);
  return (
    <>
      {editing ? (
        <CustomLoopEditor loop={loop} />
      ) : (
        loop.sections.map((section) => {
          const id = `custom-${section.id}`;
          return (
            <SettingsGroup
              key={section.id}
              id={id}
              label={section.label || 'Untitled section'}
              icon={LuListChecks}
              modifiers={loop.modifiers.filter((m) => m.section === section.id)}
              choices={loop.choices.filter((c) => c.section === section.id)}
              usersFilter={false}
              emptyHint="No options yet — Edit to add some."
              open={!closed[id]}
              onToggle={() => toggleSection(id)}
              {...rows}
            />
          );
        })
      )}
      <SettingsGroup
        id="run"
        group="run"
        label="Run"
        modifiers={loop.modifiers.filter((m) => m.section === undefined)}
        choices={loop.choices.filter((c) => c.section === undefined)}
        usersFilter={loop.reviewsPrs === true}
        open={!closed['run']}
        onToggle={() => toggleSection('run')}
        {...rows}
      />
    </>
  );
}

/** The Edit toggle row — only a custom loop has one. */
function CustomLoopHeader({ loop }: { loop: CustomLoop }) {
  const editing = useLoopsState((s) => s.customLoopEditing === loop.id);
  return <CustomLoopToolbar loop={loop} editing={editing} />;
}

/**
 * The loop's own spectrum as colour stops: `--fab-spec-1…5` cascade from the
 * nearest `[data-fab-tab]` (inline on a custom loop, `styles.css` rows for
 * built-ins), so the fallbacks only matter outside the Loops panel. The
 * library Slider joins them into a ramp and rings focus in the middle stop.
 * The fallbacks mirror the default spectrum's `--fab-spec-*` fallbacks in
 * `styles.css`; retune both together.
 */
const LOOP_SPECTRUM = [
  'rgb(var(--fab-spec-1, 244 63 94))',
  'rgb(var(--fab-spec-2, 245 158 11))',
  'rgb(var(--fab-spec-3, 16 185 129))',
  'rgb(var(--fab-spec-4, 59 130 246))',
  'rgb(var(--fab-spec-5, 139 92 246))',
];

/**
 * When a subagent hands over to a fresh one — a percentage of its context
 * window, sent as "Auto-rotate subagents at N% context." on every run.
 */
function AutoRotateSlider({
  percent,
  onPercent,
}: {
  percent: number;
  onPercent: (percent: number) => void;
}) {
  const id = useId();
  // What the knob shows: an off-step stored value snaps, so the readout matches it.
  const shown = sliderValue(
    percent,
    LOOP_AUTO_ROTATE.min,
    LOOP_AUTO_ROTATE.max,
    LOOP_AUTO_ROTATE.step,
  );
  return (
    <div className="flex min-w-0 flex-col gap-1 pt-1" data-testid="auto-rotate-field">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <label htmlFor={id}>Auto-rotate subagents</label>
        <span className="font-mono text-[10px] text-foreground">{shown}%</span>
      </div>
      <Slider
        id={id}
        min={LOOP_AUTO_ROTATE.min}
        max={LOOP_AUTO_ROTATE.max}
        step={LOOP_AUTO_ROTATE.step}
        value={percent}
        onValueChange={onPercent}
        gradient={LOOP_SPECTRUM}
        aria-valuetext={`${shown}% context`}
        data-testid="auto-rotate-slider"
      />
    </div>
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
  const { resolveAgentIcon } = useLoopsHost();
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
        <label
          className="relative flex cursor-pointer items-center"
          title="Only work inside this window"
        >
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
          aria-label={`Run ${loopLabel(loop)} from`}
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
          aria-label={`Run ${loopLabel(loop)} until`}
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
