import type { LoopDefinition, LoopRunRecord } from '@midnite/studio-shared';

import { LoopComposer } from './loop-composer';
import { LoopHistory } from './loop-history';
import { useLoopStatus } from './loop-status';
import { useLoopSession } from './use-loop-session';
import { useRepos } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { agentInitialInput } from '../terminal/terminal-panel';
import { useTerminalStore } from '../terminal/terminal-store';
import { LazyTerminalView } from '../terminal/lazy-terminal-view';
import { useAgents } from '../terminal/use-agents';

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
}: {
  loop: LoopDefinition;
  active: boolean;
  runs: LoopRunRecord[];
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
    the FAB and the menu can never disagree about what `/loop /midnite-exec`
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
  const extras = useUiStore((s) => s.loopExtras[loop.id] ?? '');
  const setCheck = useUiStore((s) => s.setLoopModifierCheck);
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
  /** Is there a skill on the line at all? Only asked of a `requiresModifier` loop. */
  const hasTask = loop.modifiers.some((m) => checked[m.id] && m.providesTask);

  const status = useLoopStatus(loop.id);
  const agents = useAgents();
  // The roster's own command, not the id — see `useLoopSession`'s note.
  const command = agents.agents.find((a) => a.id === loop.agentId)?.command ?? loop.agentId;
  const { start, stop } = useLoopSession(loop, {
    repoId: selectedRepoId,
    cwd,
    basePrompt,
    checkedModifierIds,
    extras,
    command,
  });

  const session = useTerminalStore((s) => s.sessions.find((row) => row.id === status.sessionId));
  const pendingInput = useTerminalStore((s) =>
    status.sessionId ? s.pendingInput[status.sessionId] : undefined,
  );

  return (
    <div className="flex h-full w-full flex-col">
      <LoopComposer
        loop={loop}
        running={status.running}
        waiting={status.waiting}
        thinking={status.thinking}
        checked={checked}
        extras={extras}
        disabled={!repo || (loop.requiresModifier && !hasTask)}
        disabledReason={
          repo
            ? // Patrol's base is a bare `/loop`: with no task box checked there
              // is no skill on the line at all, so Start would launch an agent
              // and tell it nothing. The auto-pick pair does not count — a
              // standing rule is not a task. Held here rather than in
              // `composeLoopPrompt`, which is pure and has no business refusing
              // to compose.
              'Check PR review, PR feedback or Triage only — this loop takes its task from them.'
            : 'Select a repository first.'
        }
        onToggle={(modifierId, on) => setCheck(loop.id, modifierId, on)}
        onExtras={(text) => setExtras(loop.id, text)}
        onStart={start}
        onStop={stop}
      />
      <LoopHistory runs={runs} />
      <div className="min-h-0 flex-1">
        {session ? (
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
            fitSignal={0}
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
