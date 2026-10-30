import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_LOOP_SCHEDULE,
  LOOP_AUTO_ROTATE,
  customLoopForRun,
  customLoopNeedsOption,
  isCustomLoop,
  resolveLoopChoice,
  type LoopDefinition,
  type LoopModel,
  type LoopRunOptions,
  type LoopRunRecord,
} from '@midnite/studio-shared';

import { ResizeHandle, useResizable } from '@midnite/studio-frame';

import { useLoopsHost } from './host';
import { LoopComposer } from './loop-composer';
import { loopFormRange, resolveLoopFormHeight } from './loop-form-size';
import { LoopHistory } from './loop-history';
import { contributorOptions } from './loop-option-row';
import { useLoopStatus } from './loop-status';
import { useLoopSession } from './use-loop-session';
import { loopLabel } from './use-all-loops';
import { useLoopsState, useLoopsTerminal } from './use-loops-host-state';

// A zustand v5 selector must return a stable reference, or it re-renders forever.
const NO_SKILLS: Record<string, string> = {};
const NO_RUN_OPTIONS: LoopRunOptions = {};
const NO_USERS: string[] = [];

/**
 * One FAB tab: compose the run, start it, watch it, read what past runs were
 * told.
 *
 * Nothing spawns on mount. The tab's session appears the moment Start is
 * pressed and is remembered by id (`fabSessions[tab]`) — the ad-hoc version of
 * this panel spawned four sessions eagerly and then latched all four tabs onto
 * whichever session happened to be last in a pre-call closure snapshot, which
 * is why every tab showed the same terminal while four strays piled into the
 * main housing.
 */
export function LoopTab({
  loop,
  active,
  runs,
  fitSignal,
}: {
  loop: LoopDefinition;
  active: boolean;
  runs: LoopRunRecord[];
  /** Bumped once the FAB panel's own reveal tween settles — see `FabPanel`'s own prop. */
  fitSignal: number;
}) {
  const selectedRepoId = useLoopsState((s) => s.selectedRepoId);
  const selectedWorktreePath = useLoopsState((s) => s.selectedWorktreePath);
  const host = useLoopsHost();
  const repos = host.useRepos();
  const repo = repos.data?.find((r) => r.id === selectedRepoId);
  /*
    The worktree you are looking at, not the repo's primary checkout — the same
    directory the main terminal panel opens in. A loop is the *most* directory
    sensitive thing this app starts (it commits, branches and pushes on its
    own), so starting one while a worktree is selected and running it in the
    primary checkout is precisely the stomp `CLAUDE.md`'s worktree rules exist
    to prevent. Falls back to the repo path when no worktree is selected.
  */
  const cwd = selectedWorktreePath ?? repo?.path ?? null;

  /*
    The loop's base prompt comes from the midnite-menu registry it names, so
    the FAB and the menu can never disagree about what `/loop /midnite-create`
    is — the duplicate copies in `FAB_TABS` are what this replaces. The cast
    is the boundary between a shared schema whose `agentCommandId` is a plain
    string and a renderer union: an id naming no entry falls through to the
    loop's own `fallbackPrompt` rather than composing an empty command.
  */
  const basePrompt = useLoopsState(
    (s) =>
      (s.agentSkills as Record<string, string | undefined>)[loop.agentCommandId] ??
      loop.fallbackPrompt,
  );
  const defaults = useLoopsState((s) => s.loopModifierDefaults[loop.id]);
  const checks = useLoopsState((s) => s.loopModifierChecks[loop.id]);
  const savedChoices = useLoopsState((s) => s.loopChoices[loop.id]);
  const savedAgentId = useLoopsState((s) => s.loopAgents[loop.id]);
  const model = useLoopsState((s) => s.loopModels[loop.id] ?? 'default');
  const schedule = useLoopsState((s) => s.loopSchedules[loop.id] ?? DEFAULT_LOOP_SCHEDULE);
  const extras = useLoopsState((s) => s.loopExtras[loop.id] ?? '');
  const setCheck = useLoopsState((s) => s.setLoopModifierCheck);
  const setChoice = useLoopsState((s) => s.setLoopChoice);
  const setAgent = useLoopsState((s) => s.setLoopAgent);
  const setModel = useLoopsState((s) => s.setLoopModel);
  const setSchedule = useLoopsState((s) => s.setLoopSchedule);
  const setExtras = useLoopsState((s) => s.setLoopExtras);
  const skills = useLoopsState((s) => s.loopModifierSkills[loop.id] ?? NO_SKILLS);
  const setSkill = useLoopsState((s) => s.setLoopModifierSkill);
  const runOptions = useLoopsState((s) => s.loopRunOptions[loop.id] ?? NO_RUN_OPTIONS);
  const setRunOptions = useLoopsState((s) => s.setLoopRunOptions);
  /*
    Resolved on read, like the switches: an older profile has no entry, and
    reads as no users and the default rotation.
  */
  const reviewUsers = loop.reviewsPrs ? (runOptions.reviewUsers ?? NO_USERS) : NO_USERS;
  const autoRotatePercent = runOptions.autoRotatePercent ?? LOOP_AUTO_ROTATE.default;
  // The tab bar's own "Loop" switch (fab-panel.tsx) is the single control for
  // `/loop`; absent means on.
  const repeat = useLoopsState((s) => s.loopEnabled[loop.id] ?? true);

  // Only the active tab asks main for skills and contributors; the five behind it stay idle.
  const knownSkills = host.useKnownSkills(selectedRepoId, active);
  const stats = host.useContributors(selectedRepoId, active && loop.reviewsPrs);
  const contributors = useMemo(
    () => contributorOptions(stats.data ?? []),
    [stats.data],
  );

  /*
    Three layers, resolved here rather than written into the store: the
    modifier's own declared `defaultOn`, the user's saved default for this
    loop (Settings ▸ Agent ▸ Loops), and whatever this session's composer has
    been toggled to. Resolving on read means a loop whose modifiers change in
    a later version picks up the new declarations instead of being frozen by
    a snapshot someone's store took years ago.
  */
  const checked = Object.fromEntries(
    loop.modifiers.map((m) => [m.id, checks?.[m.id] ?? defaults?.[m.id] ?? m.defaultOn]),
  );
  const checkedModifierIds = loop.modifiers.filter((m) => checked[m.id]).map((m) => m.id);
  /*
    Radios are resolved on read for the same reason the boxes above are: a
    stored option id that a later version renamed falls back to the declared
    default rather than leaving the group with nothing selected — and the
    composer never has to guess, because what it is handed is always a real
    option id.
  */
  const choiceIds = Object.fromEntries(
    loop.choices.map((choice) => [
      choice.id,
      resolveLoopChoice(choice, savedChoices?.[choice.id]).id,
    ]),
  );
  /** Is there a skill on the line at all? Only asked of a `requiresModifier` loop. */
  const hasTask = loop.modifiers.some((m) => checked[m.id] && m.providesTask);
  /*
    A custom loop's gate is its own: when its base prompt says nothing beyond
    a bare `/loop`, Start needs one of the author's options on (one with words
    in it — an empty fragment adds nothing), for the same reason Patrol needs
    a task. The shared Run switches do not count; a policy is not a job.
  */
  const custom = isCustomLoop(loop) ? loop : null;
  const needsOption =
    custom !== null &&
    customLoopNeedsOption(custom) &&
    !custom.modifiers.some((m) => m.section !== undefined && checked[m.id] && m.promptFragment.trim() !== '');
  const blocked = custom ? needsOption : loop.requiresModifier === true && !hasTask;
  /** What the run composes from — a custom loop minus the options still waiting for words. */
  const runLoop = useMemo(() => (custom ? customLoopForRun(custom) : loop), [custom, loop]);

  const status = useLoopStatus(loop.id);
  const agents = host.useAgents();
  /*
    The provider this tab runs on: whatever the user picked, as long as the
    live roster still has it. Resolved here rather than in the store because
    the roster is queried (`agents.json` can be edited between launches) — a
    saved `cursor` that has since been removed from the roster must fall back
    to the loop's declared agent, not launch a command that does not exist.
    The saved answer is left alone either way: re-add the agent and the tab is
    back on it.
  */
  const agentId =
    savedAgentId !== undefined && agents.agents.some((a) => a.id === savedAgentId)
      ? savedAgentId
      : loop.agentId;
  // The roster's own command, not the id — see `useLoopSession`'s note.
  const command = agents.agents.find((a) => a.id === agentId)?.command ?? agentId;
  const { start, stop } = useLoopSession(runLoop, {
    repoId: selectedRepoId,
    cwd,
    basePrompt,
    checkedModifierIds,
    choiceIds,
    schedule: schedule.enabled ? schedule : null,
    agentId,
    model,
    extras,
    command,
    skills,
    reviewUsers,
    autoRotatePercent,
    repeat,
  });

  const session = useLoopsTerminal((s) => s.sessions.find((row) => row.id === status.sessionId));

  /*
    Form height: its natural content height until the user drags the splitter,
    then their height (persisted as `layout.loopFormHeight`; 0 = never dragged).
    Both are clamped into the pane so the terminal below always keeps its
    minimum, and a size saved in a taller window cannot overflow a shorter one.
    `natural` and `container` are measured: the content wrapper's height moves
    as sections expand, and the pane's with the window.
  */
  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState(0);
  const [container, setContainer] = useState(0);
  useEffect(() => {
    const pane = paneRef.current;
    const content = contentRef.current;
    if (!pane || !content) return;
    const measure = () => {
      setNatural(content.offsetHeight);
      setContainer(pane.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(pane);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);
  const storedFormHeight = useLoopsState((s) => s.layout.loopFormHeight);
  const setLayout = useLoopsState((s) => s.setLayout);
  // Unmeasured (first paint, jsdom): leave the form to its content.
  const measured = container > 0;
  const range = loopFormRange(container);
  const effective = resolveLoopFormHeight(storedFormHeight, natural, container);
  const commitHeight = useCallback(
    // Dragging back to the content height (or double-click) returns to auto.
    (value: number) =>
      setLayout('loopFormHeight', Math.round(value) === Math.round(natural) ? 0 : value),
    [natural, setLayout],
  );
  const form = useResizable({
    size: effective,
    onSize: commitHeight,
    min: range.min,
    max: range.max,
    initial: natural,
    axis: 'y',
  });

  return (
    <div ref={paneRef} className="flex h-full w-full flex-col">
      {/*
        The form takes its natural content height and scrolls only when the pane
        is too short to leave the terminal its minimum, or when the user has
        dragged the splitter smaller than the content. (It used to be a hard
        `max-h-80`, which clipped the form in a tall window and left the
        terminal's empty "Press Start" area with the rest.)
      */}
      <div
        className="shrink-0 overflow-y-auto"
        style={measured ? { height: form.current } : { maxHeight: '60%' }}
        data-testid="loop-form"
      >
        <div ref={contentRef} className="flex flex-col">
          <LoopComposer
            loop={loop}
            running={status.running}
            waiting={status.waiting}
            thinking={status.thinking}
            checked={checked}
            choiceIds={choiceIds}
            agents={agents.agents}
            agentId={agentId}
            model={model}
            schedule={schedule}
            extras={extras}
            skills={skills}
            skillSuggestions={knownSkills.data ?? []}
            reviewUsers={reviewUsers}
            contributorOptions={contributors}
            autoRotatePercent={autoRotatePercent}
            repeat={repeat}
            disabled={!repo || blocked}
            disabledReason={
              repo && custom
                ? 'Turn on an option — the base prompt alone gives the loop nothing to do.'
                : repo
                ? // Patrol's base is a bare `/loop`: with no task box checked there
                  // is no skill on the line at all, so Start would launch an agent
                  // and tell it nothing. The autonomy radio does not count — a
                  // standing rule is not a task. Held here rather than in
                  // `composeLoopPrompt`, which is pure and has no business refusing
                  // to compose.
                  'Pick a task — Routine, Review PRs, Reply to PRs, Security review or Triage only.'
                : 'Select a repository first.'
            }
            onToggle={(modifierId, on) => setCheck(loop.id, modifierId, on)}
            onSkill={(modifierId, skill) => setSkill(loop.id, modifierId, skill)}
            onReviewUsers={(users) => setRunOptions(loop.id, { reviewUsers: users })}
            onAutoRotate={(percent) => setRunOptions(loop.id, { autoRotatePercent: percent })}
            onChoice={(choiceId, optionId) => setChoice(loop.id, choiceId, optionId)}
            onAgent={(next) => setAgent(loop.id, next)}
            onModel={(next: LoopModel) => setModel(loop.id, next)}
            onSchedule={(next) => setSchedule(loop.id, next)}
            onExtras={(text) => setExtras(loop.id, text)}
            onStart={start}
            onStop={stop}
          />
          <LoopHistory runs={runs} />
        </div>
      </div>
      <ResizeHandle resizable={form} axis="y" label="Resize loop form" />
      <div className="min-h-0 flex-1">
        {session ? (
          /*
            The app draws the xterm: the same `pendingInput ?? agentInitialInput`
            handoff the main housing does (the composed command reaches the pty
            as its start input, the roster's launch command is the fallback),
            and a session the Sessions page's own live pane has claimed shows
            that page's placeholder instead — one xterm per pty.
          */
          host.renderTerminal({
            sessionId: session.id,
            active,
            fitSignal,
            layoutClassName: 'h-full w-full',
          })
        ) : (
          <p className="p-3 text-[11px] text-muted-foreground">
            {repo
              ? `Press Start to run ${loopLabel(loop)} in ${repo.name}.`
              : 'Select a repository to run a loop.'}
          </p>
        )}
      </div>
    </div>
  );
}
