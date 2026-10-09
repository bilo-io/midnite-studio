import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_LOOP_SCHEDULE,
  resolveLoopChoice,
  type LoopDefinition,
  type LoopModel,
  type LoopRunRecord,
} from '@midnite/studio-shared';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { LoopComposer } from './loop-composer';
import { loopFormRange, resolveLoopFormHeight } from './loop-form-size';
import { LoopHistory } from './loop-history';
import { useLoopStatus } from './loop-status';
import { useLoopSession } from './use-loop-session';
import { useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { agentInitialInput } from '../terminal/terminal-panel';
import { useTerminalStore } from '../terminal/terminal-store';
import { LazyTerminalView } from '../terminal/lazy-terminal-view';
import { useAgents } from '../terminal/use-agents';
import { YieldedToSessionsPage } from '../terminal/yielded-to-sessions-page';

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
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const repos = useRepos();
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
  const basePrompt = useUiStore(
    (s) =>
      (s.agentSkills as Record<string, string | undefined>)[loop.agentCommandId] ??
      loop.fallbackPrompt,
  );
  const defaults = useUiStore((s) => s.loopModifierDefaults[loop.id]);
  const checks = useUiStore((s) => s.loopModifierChecks[loop.id]);
  const savedChoices = useUiStore((s) => s.loopChoices[loop.id]);
  const savedAgentId = useUiStore((s) => s.loopAgents[loop.id]);
  const model = useUiStore((s) => s.loopModels[loop.id] ?? 'default');
  const schedule = useUiStore((s) => s.loopSchedules[loop.id] ?? DEFAULT_LOOP_SCHEDULE);
  const extras = useUiStore((s) => s.loopExtras[loop.id] ?? '');
  const setCheck = useUiStore((s) => s.setLoopModifierCheck);
  const setChoice = useUiStore((s) => s.setLoopChoice);
  const setAgent = useUiStore((s) => s.setLoopAgent);
  const setModel = useUiStore((s) => s.setLoopModel);
  const setSchedule = useUiStore((s) => s.setLoopSchedule);
  const setExtras = useUiStore((s) => s.setLoopExtras);

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

  const status = useLoopStatus(loop.id);
  const agents = useAgents();
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
  const { start, stop } = useLoopSession(loop, {
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
  });

  const session = useTerminalStore((s) => s.sessions.find((row) => row.id === status.sessionId));
  const pendingInput = useTerminalStore((s) =>
    status.sessionId ? s.pendingInput[status.sessionId] : undefined,
  );
  // Yielded to the Sessions page's own live pane — one xterm per pty, see
  // `sessionsPaneSessionId` in `terminal-store.ts`.
  const yielded = useTerminalStore((s) => s.sessionsPaneSessionId === status.sessionId);

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
  const storedFormHeight = useUiStore((s) => s.layout.loopFormHeight);
  const setLayout = useUiStore((s) => s.setLayout);
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
            disabled={!repo || (loop.requiresModifier && !hasTask)}
            disabledReason={
              repo
                ? // Patrol's base is a bare `/loop`: with no task box checked there
                  // is no skill on the line at all, so Start would launch an agent
                  // and tell it nothing. The autonomy radio does not count — a
                  // standing rule is not a task. Held here rather than in
                  // `composeLoopPrompt`, which is pure and has no business refusing
                  // to compose.
                  'Pick a task — Review PRs, Answer feedback, Security review or Triage only.'
                : 'Select a repository first.'
            }
            onToggle={(modifierId, on) => setCheck(loop.id, modifierId, on)}
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
        {session && yielded ? (
          <YieldedToSessionsPage sessionId={session.id} layoutClassName="h-full w-full" />
        ) : session ? (
          /*
            The same `pendingInput ?? agentInitialInput` handoff the main
            housing does — the composed command reaches the pty as its start
            input, and the roster's own launch command is the fallback. The
            ad-hoc version passed the raw slash-text straight through, which
            bypassed `agent-invocation.ts` and typed a bare `/loop …` at a
            shell that has no such command.
          */
          <LazyTerminalView
            key={session.id}
            session={session}
            active={active}
            initialInput={pendingInput ?? agentInitialInput(agents.agents, session.agentId)}
            fitSignal={fitSignal}
            layoutClassName="h-full w-full"
          />
        ) : (
          <p className="p-3 text-[11px] text-muted-foreground">
            {repo
              ? `Press Start to run ${loop.label} in ${repo.name}.`
              : 'Select a repository to run a loop.'}
          </p>
        )}
      </div>
    </div>
  );
}
