import { LOOP_MODELS, loopModelArgs, type ForgeProjectItem, type LoopModel } from '@midnite/studio-shared';
import { useEffect, useMemo, useState } from 'react';
import { LuCircleStop, LuPlay, LuSquareTerminal, LuX, LuZap } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { IconSelect, type IconSelectOption } from '../../../components/select/icon-select';
import { resolveAgentIcon } from '../../../components/icons';
import { useToastStore } from '../../../store/toast-store';
import { useUiStore } from '../../../store/ui-store';
import {
  agentInvocationArgs,
  shellQuote,
  startAgent,
  toAgentPrompt,
} from '../../terminal/start-agent';
import { revealSession } from '../../terminal/reveal-session';
import {
  findAnyCardSession,
  findCardSession,
  sessionPhase,
  useTerminalStore,
} from '../../terminal/terminal-store';
import { useAgents } from '../../terminal/use-agents';
import { composeCardPrompt, CONCURRENT_CARD_SESSION_SOFT_LIMIT, countLiveCardSessions } from './board-derive';

/**
 * `LOOP_MODELS` is Claude-only today — see `loopModelArgs`'s own comment:
 * handing `--model` to `codex exec` or `agy -p` fails the invocation outright
 * rather than degrading. So every other agent gets a select disabled down to
 * the one neutral option, not a guessed flag.
 */
const MODEL_OPTIONS: IconSelectOption[] = LOOP_MODELS.map((model) => ({ id: model.id, label: model.label }));

/**
 * A card's agent launcher (Phase 41 Theme G): pick an agent, review and edit
 * the composed prompt, see the exact shell command Start will type, then
 * type-but-don't-send it into a fresh `kanban`-surface session bound to this
 * card via `taskRef` — Theme H's reconciliation is what finds it again after
 * a reload.
 *
 * **One live session per card, enforced by hiding the form rather than
 * disabling it.** The phase doc's own rule: a card already running shows
 * Stop, never a second Start. Reads its own session off the store via
 * `findCardSession`/`findAnyCardSession` (Theme F's own lookups) rather than
 * taking one as a prop — Theme F's `useCardStatus` already established that
 * a card never keeps its own copy of "which session am I". There is no
 * inline transcript here — that is Theme E, not in this batch — so a
 * running card shows its status and a Stop, and the main terminal panel is
 * the only place to watch it work once Theme H re-homes it.
 *
 * **A session outlives its agent (Phase 50 Theme A).** The Start form stays
 * hidden for an ended or asleep session too, not just a live one — `anySession`
 * gates it, not `isLive` — because the binding is exactly what
 * `findAnyCardSession` would otherwise still resolve to on a second Start,
 * hiding the freshly-launched session behind the stale one forever (both
 * would carry the same `taskRef`, and `.find()` returns whichever is first).
 * Dismiss is the one way past that: it clears the binding via
 * `dismissCardSession`, the same drop-to-`'main'` transition Theme H's
 * automatic `rehomeSession` already performs, so a still-live session is
 * never the one Dismiss is offered for — Stop is.
 *
 * **Launch and run, opt-in (Phase 50 Theme B).** A second button beside
 * Start, revealed only behind `Settings ▸ Projects`'s toggle (default off).
 * The setting removes a step, not the look-before-you-leap: pressing it
 * still opens a confirm naming the exact composed command before
 * `startAgent({ ..., autoSend: true })` ever runs — a kanban prompt is
 * composed from remote GitHub text, unlike a FAB loop's fixed,
 * user-authored one, and that argument is exactly what the confirm carries
 * regardless of the setting.
 */
export function CardComposer({
  projectId,
  repoId,
  worktreePath,
  item,
}: {
  projectId: string;
  repoId: string;
  worktreePath: string;
  item: ForgeProjectItem;
}) {
  const { agents } = useAgents();
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const addToast = useToastStore((s) => s.addToast);
  const launchAndRunEnabled = useUiStore((s) => s.launchAndRunEnabled);
  const dialogs = useDialogs();

  const taskRef = useMemo(() => ({ projectId, itemId: item.id }), [projectId, item.id]);
  const liveSession = findCardSession(sessions, states, taskRef);
  const anySession = findAnyCardSession(sessions, taskRef);
  const isLive = liveSession !== undefined;
  const phase = anySession ? sessionPhase(anySession, states[anySession.id]) : null;

  /*
    Defaulting per repo (the phase doc's own words) reads off this repo's
    most recent agent launch rather than a second persisted setting — no new
    store field, and it tracks whatever the user actually used last without
    a separate "set the default" control to maintain. Read once, as
    `useState`'s initial value: this component remounts per open card (see
    `board-view.tsx`'s `key={item.id}`), so re-deriving on every keystroke
    would fight the user's own agent choice.
  */
  const [agentId, setAgentId] = useState(() => {
    const mostRecent = sessions
      .filter((s) => s.repoId === repoId && s.kind === 'agent' && s.agentId !== undefined)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return mostRecent?.agentId ?? agents[0]?.id ?? '';
  });
  const [prompt, setPrompt] = useState(() => composeCardPrompt(item, worktreePath));
  const [model, setModel] = useState<LoopModel>('default');

  // A model chosen for one agent means nothing for another — `loopModelArgs`
  // is Claude-only, so switching away from `claude` drops back to the neutral
  // choice rather than carrying a `--model` flag it would refuse to apply.
  useEffect(() => {
    if (agentId !== 'claude') setModel('default');
  }, [agentId]);

  const modelArgs = useMemo(() => loopModelArgs(agentId, model), [agentId, model]);

  const commandPreview = useMemo(() => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return '';
    return [
      agent.command,
      ...modelArgs,
      ...agentInvocationArgs(agentId),
      shellQuote(toAgentPrompt(prompt, agentId)),
    ].join(' ');
  }, [agents, agentId, modelArgs, prompt]);

  /**
   * Shared by Start (`autoSend: false`) and Launch and run (`true`, Theme B)
   * — everything about the launch is identical except whether the composed
   * prompt is typed or sent, so this is the one place either path funnels
   * through rather than two copies drifting apart.
   */
  function launch(autoSend: boolean) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;

    /*
      Soft warning, not a block (Phase 50 Theme A): the 6th concurrently-live
      card session on this board gets a heads-up here, before the mutation
      below — a client-side quota that refused the launch outright is
      exactly what the phase doc's own recommendation argues against.
    */
    if (countLiveCardSessions(sessions, states, projectId) >= CONCURRENT_CARD_SESSION_SOFT_LIMIT) {
      addToast({
        status: 'warning',
        message: `${CONCURRENT_CARD_SESSION_SOFT_LIMIT}+ agents already running on this board — that's a lot to keep track of.`,
      });
    }

    startAgent({
      repoId,
      cwd: worktreePath,
      title: item.content.title,
      prompt,
      agentId: agent.id,
      command: agent.command,
      surface: 'kanban',
      taskRef,
      extraArgs: modelArgs,
      autoSend,
    });
  }

  function handleStart() {
    launch(false);
  }

  function handleLaunchAndRun() {
    dialogs.confirm({
      title: 'Launch and run?',
      body: commandPreview,
      confirmLabel: 'Launch and run',
      onConfirm: () => launch(true),
    });
  }

  function handleStop() {
    if (liveSession) useTerminalStore.getState().sleepSession(liveSession.id);
  }

  function handleDismiss() {
    useTerminalStore.getState().dismissCardSession(taskRef);
  }

  return (
    <section className="border-t border-border/50 px-3 py-2.5" data-testid="card-composer">
      <h3 className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Launch agent
      </h3>

      {anySession ? (
        <p className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{phase === 'live' ? 'Running' : phase === 'asleep' ? 'Asleep' : 'Ended'}</span>
          <span className="flex items-center gap-2.5">
            {/*
              Where the session actually is. Offered for an ENDED or asleep
              session too, not just a live one: the panel keeps the pane and
              its scrollback either way, and "what did it do before it
              stopped" is the commoner question of the two.
            */}
            <button
              type="button"
              onClick={() => revealSession(anySession.id)}
              data-testid="composer-reveal-terminal"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <LuSquareTerminal aria-hidden className="h-3 w-3" />
              Terminal
            </button>
            {isLive ? (
              <button
                type="button"
                onClick={handleStop}
                data-testid="card-stop"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <LuCircleStop aria-hidden className="h-3 w-3" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDismiss}
                data-testid="card-dismiss"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <LuX aria-hidden className="h-3 w-3" />
                Dismiss
              </button>
            )}
          </span>
        </p>
      ) : null}

      {!anySession ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Agent</p>
              <IconSelect
                ariaLabel="Agent"
                options={agents.map((agent) => ({
                  id: agent.id,
                  label: agent.label,
                  icon: resolveAgentIcon(agent),
                  iconColor: agent.accent,
                }))}
                value={agentId}
                onChange={setAgentId}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Model</p>
              <IconSelect
                ariaLabel="Model"
                options={MODEL_OPTIONS}
                value={model}
                onChange={(id) => setModel(id as LoopModel)}
                isDisabled={agentId !== 'claude'}
              />
            </div>
          </div>
          <textarea
            aria-label="Prompt"
            value={prompt}
            spellCheck={false}
            rows={6}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-[6rem] w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed outline-none"
          />
          <p
            title={commandPreview}
            data-testid="card-command-preview"
            className="truncate rounded border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[10px] text-muted-foreground"
          >
            {commandPreview}
          </p>
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={handleStart}
              disabled={agentId === ''}
              data-testid="card-start"
              className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LuPlay aria-hidden className="h-3.5 w-3.5" />
              Start
            </button>
            {launchAndRunEnabled ? (
              <button
                type="button"
                onClick={handleLaunchAndRun}
                disabled={agentId === ''}
                data-testid="card-launch-and-run"
                title="Confirms the exact command, then sends it — no typed-but-not-sent step."
                className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LuZap aria-hidden className="h-3.5 w-3.5" />
                Launch and run
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
