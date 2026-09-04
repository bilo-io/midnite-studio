import type { AgentDefinition, TerminalSession } from '@midnite/studio-shared';
import {
  LuChevronRight,
  LuMoon,
  LuPanelLeft,
  LuPanelRight,
  LuPencil,
  LuRotateCcw,
  LuTerminal,
  LuX,
} from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { resolveAgentIcon } from '../../components/icons';
import { SortableList, useSortableRow } from '../../components/sortable-list';
import { StateDot } from '../../components/state-dot';
import { Spinner } from '../../components/skeleton';
import { useUiStore } from '../../store/ui-store';
import { closeSessionWithConfirm } from './close-session';
import {
  inMainPanel,
  isAgentRow,
  resolveSessionAgentId,
  sessionLabel,
  sessionPhase,
  useTerminalStore,
  type SessionActivity,
} from './terminal-store';

/**
 * The list of open terminals, VS Code style.
 *
 * Rendered only past one session: a list of one is chrome that explains
 * nothing. Its existence is also what earns the reversal of Phase 9's
 * unmount-when-hidden rule — a background shell is only defensible when there
 * is somewhere to see it and stop it.
 */
export function TerminalSessionList({
  agents,
  width,
}: {
  agents: AgentDefinition[];
  width: number;
}) {
  const dialogs = useDialogs();
  // Main-surface and Kanban sessions — a FAB loop's session (Phase 35) never
  // lists here, because it renders in the FAB's own tab.
  const sessions = useTerminalStore((s) => s.sessions).filter(inMainPanel);
  const activeId = useTerminalStore((s) => s.activeId);

  /*
    Subscribed once for the whole list rather than per row: the probe reports a
    change for one session at a time, and the map is a stable reference between
    those, so a row only re-renders when its own entry moves.
  */
  const liveAgentId = useTerminalStore((s) => s.liveAgentId);
  const side = useUiStore((s) => s.terminalSidebarSide);

  const border = side === 'left' ? 'border-r' : 'border-l';

  /**
   * Docking lives in a context menu rather than a header button.
   *
   * It is set once and then never again; spending permanent chrome on it would
   * cost more attention than the preference is worth.
   */
  const showDockMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    dialogs.openMenu(event, [
      {
        label: side === 'left' ? 'Move to right' : 'Move to left',
        icon: side === 'left' ? LuPanelRight : LuPanelLeft,
        onSelect: () =>
          useUiStore.getState().setTerminalSidebarSide(side === 'left' ? 'right' : 'left'),
      },
    ]);
  };

  /**
   * Up/down moves the active session; the arrow pointing at the terminal pane
   * hands focus over to it. Which key that is depends on the dock side — the
   * pane is always on the OTHER side from the list, never a fixed direction.
   *
   * Left/right in the other direction is deliberately not handled here: that
   * key belongs to the shell (cursor movement, agent UIs) once focus is
   * actually in the terminal, not to this list.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (sessions.length === 0) return;
    const index = sessions.findIndex((s) => s.id === activeId);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = sessions[Math.min(Math.max(index + delta, 0), sessions.length - 1)];
      if (next) useTerminalStore.getState().setActiveFromListNav(next.id);
      return;
    }

    const towardPanel = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === towardPanel) {
      event.preventDefault();
      useTerminalStore.getState().focusActiveSession();
    }
  };

  const legacy = useTerminalStore((s) => s.legacy);
  const legacyBannerDismissed = useTerminalStore((s) => s.legacyBannerDismissed);
  const dismissLegacyBanner = useTerminalStore((s) => s.dismissLegacyBanner);

  const hasLegacy = Object.values(legacy).some(Boolean);

  return (
    <div
      /*
        Named for the e2e suite, which has to tell this column apart from the
        repos sidebar and from the pane beside it — both are plain divs, and
        which SIDE this one sits on is exactly what the docking test asserts.
      */
      data-session-list
      tabIndex={0}
      className={`shrink-0 overflow-y-auto ${border} border-border py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring`}
      style={{ width }}
      onContextMenu={showDockMenu}
      onKeyDown={onKeyDown}
    >
      {hasLegacy && !legacyBannerDismissed ? (
        <div
          role="alert"
          className="mx-2 my-1 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"
        >
          <p className="font-medium">From a previous version — restart sessions?</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const store = useTerminalStore.getState();
                for (const session of sessions) {
                  if (legacy[session.id]) {
                    store.closeSession(session.id);
                    store.openSession({
                      kind: session.kind,
                      agentId: session.agentId,
                      title: session.title,
                      cwd: session.cwd,
                      repoId: session.repoId,
                    });
                  }
                }
                dismissLegacyBanner();
              }}
              className="rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-500"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={dismissLegacyBanner}
              className="rounded px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <SortableList
        ids={sessions.map((s) => s.id)}
        onReorder={(ids) => useTerminalStore.getState().reorder(ids)}
      >
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            active={session.id === activeId}
            agent={agents.find((a) => a.id === session.agentId)}
            runningAgent={agents.find((a) => a.id === resolveSessionAgentId(session, liveAgentId))}
            isAgentRow={isAgentRow(session, liveAgentId)}
            legacy={Boolean(legacy[session.id])}
          />
        ))}
      </SortableList>
    </div>
  );
}

function SessionRow({
  session,
  active,
  agent,
  runningAgent,
  isAgentRow: rowIsAgent,
  legacy,
}: {
  session: TerminalSession;
  active: boolean;
  /**
   * The roster entry this session was *opened for*. Feeds the label only.
   *
   * Kept apart from `runningAgent` on purpose: the live probe drives icons and
   * nothing else this phase. `sessionLabel` already resolves four ways and a
   * fifth input into that ordering wants its own design pass — so a shell that
   * is running Codex shows Codex's mark and keeps the name it had.
   */
  agent: AgentDefinition | undefined;
  /** What is *actually running*, from main's process probe. Drives the mark. */
  runningAgent: AgentDefinition | undefined;
  /** `isAgentRow(session, liveAgentId)` — gates the activity glyph. */
  isAgentRow: boolean;
  /** Whether a legacy broker peer answered this session's `list` — provenance, not lifecycle. */
  legacy: boolean;
}) {
  const dialogs = useDialogs();
  const state = useTerminalStore((s) => s.states[session.id] ?? 'idle');
  const activity = useTerminalStore((s) => s.activity[session.id]);
  const autoName = useTerminalStore((s) => s.autoNames[session.id]);
  const side = useUiStore((s) => s.terminalSidebarSide);
  const { setNodeRef, style, attributes, listeners, isDragging } = useSortableRow(session.id);

  const phase = sessionPhase(session, state);
  const live = phase === 'live';
  const name = sessionLabel(session, autoName, agent?.label);

  const rename = () => {
    dialogs.prompt({
      title: 'Rename session',
      label: 'Session name',
      initialValue: name,
      confirmLabel: 'Rename',
      onConfirm: (value) => useTerminalStore.getState().renameSession(session.id, value),
    });
  };

  const showMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dialogs.openMenu(event, [
      { label: 'Rename session…', icon: LuPencil, onSelect: rename },
      // The prompt dialog itself cannot submit an empty value, so clearing a
      // custom name back to the live guess is a separate, explicit action
      // rather than "rename to nothing".
      {
        label: 'Reset to detected name',
        icon: LuRotateCcw,
        disabled: session.name === undefined,
        disabledReason: 'This session has no custom name.',
        onSelect: () => useTerminalStore.getState().renameSession(session.id, undefined),
      },
      { type: 'separator' },
      {
        label: 'Sleep session',
        icon: LuMoon,
        disabled: phase !== 'live',
        disabledReason: 'Only a live session can be slept.',
        onSelect: () => useTerminalStore.getState().sleepSession(session.id),
      },
      { type: 'separator' },
      {
        label: side === 'left' ? 'Move to right' : 'Move to left',
        icon: side === 'left' ? LuPanelRight : LuPanelLeft,
        onSelect: () =>
          useUiStore.getState().setTerminalSidebarSide(side === 'left' ? 'right' : 'left'),
      },
    ]);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // A drag gesture needs a row to grab by; the close button and the label
      // are both inside it and neither is the drag handle.
      data-session-row
      data-phase={phase}
      className={`group flex w-full cursor-pointer select-none items-center gap-1.5 px-2 py-1.5 text-xs ${
        active ? 'bg-accent/60' : 'hover:bg-accent/30'
      } ${isDragging ? 'opacity-80' : ''} ${phase !== 'live' ? 'opacity-60' : ''}`}
      onContextMenu={showMenu}
      onClick={() => useTerminalStore.getState().setActive(session.id)}
      onDoubleClick={rename}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 text-left">
        <SessionIcon agent={runningAgent} live={live} />
        {
          // Provenance, not state (Phase 51 Theme G) — a legacy session can be
          // live (see `sessionPhase`'s own note), so this checks `legacy`
          // first and independently of `phase`. Falls back to the ordinary
          // asleep mark only when the row is neither.
          legacy ? (
            <LuMoon
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label="From a previous run"
              title="From a previous run"
            />
          ) : phase === 'asleep' ? (
            <LuMoon className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Asleep" />
          ) : null
        }
        {/*
          The repo name, then the session's own name — "Claude · Claude" for
          every agent session (Phase 19's shape) said the same thing twice and
          named neither session. Shrinking the repo name rather than the
          session name keeps the part that actually tells two Claude sessions
          apart from being what truncates first.
        */}
        <span
          /*
            Shrinks four times faster than the session name beside it. Phase 19
            said this in words — "shrinking the repo name rather than the
            session name keeps the part that actually tells two Claude sessions
            apart from being what truncates first" — and then wrote the opposite
            in CSS: this span was `shrink` (basis auto, so content-sized until
            something overflows) while the name was `flex-1` (basis ZERO, so it
            only ever got the leftovers). At the list's default 176px the repo
            name rendered in full and the session name became a single letter
            and an ellipsis, which is the one half that cannot be guessed —
            especially now that there are four agents it could be naming.
          */
          className={`min-w-0 shrink-[4] truncate ${live ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}
        >
          {session.title}
        </span>
        <LuChevronRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span
          /*
            Named for the e2e suite. Phase 19 split this row into a repo name
            AND a session name, both of them `truncate`, so a spec locator
            written as `span.truncate` quietly began matching two spans per row
            and asserting on whichever came first. A hook on the half that
            carries the session's own identity is what stops that recurring.
          */
          data-session-name
          className={`min-w-0 shrink truncate ${live ? '' : 'text-muted-foreground'}`}
        >
          {name}
        </span>
      </div>

      {/*
        Only a live agent gets one — gated on what is *running*
        (`isAgentRow`), not on what the session was opened as, so a plain
        shell running an agent typed by hand gets the glyph too. An exited
        row is a transcript — a blinking caret on it would be an invented
        signal.
      */}
      {rowIsAgent && live ? <ActivityIndicator activity={activity} /> : null}

      <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center transition-opacity group-hover:opacity-0"
        >
          <StateDot state={phase === 'asleep' ? 'asleep' : state} />
        </span>
        <IconButton
          icon={LuX}
          label="Close terminal"
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            closeSessionWithConfirm(dialogs, session);
          }}
        />
      </div>
    </div>
  );
}

/**
 * Whether a live agent looks to be generating, back waiting on you, idle, or
 * simply unknown — a second, distinct glyph beside the connection dot, which
 * only ever says whether the PROCESS is alive.
 *
 * Four drawn shapes rather than four icons, because the state IS the motion:
 * an arc going round is work in progress, an ellipsis rolling is a question
 * left open, a caret ticking is a prompt with nobody at it, and a dim static
 * dot is "live, and the detector has not spoken" — a real fourth state, not a
 * synonym for idle. Drawing that unspoken case as a confident idle caret is
 * what let the detector sit broken from Claude Code 2.1.x onward without
 * anyone noticing; a quiet, visibly-unsure mark is what would have surfaced it
 * on day one. An icon has to be decoded; these are the same marks a terminal
 * already uses for the same things. The 14px slot is fixed so the row's
 * connection dot does not shift sideways each time the glyph under it changes.
 *
 * `data-activity` is the hook Playwright and the reduced-motion CSS rule both
 * need — the sibling of `data-phase` above it.
 */
export function ActivityIndicator({ activity }: { activity: SessionActivity | undefined }) {
  return (
    <span
      data-activity={activity ?? 'unknown'}
      className="flex size-3.5 shrink-0 items-center justify-center"
    >
      {activity === 'thinking' ? (
        <Spinner label="Thinking" />
      ) : activity === 'waiting' ? (
        <WaitingDots />
      ) : activity === 'idle' ? (
        <IdleCaret />
      ) : (
        <UnknownDot />
      )}
    </span>
  );
}

/**
 * "…" as three dots riding a wave, amber like the old question mark was: this
 * is still the one state that wants something from you.
 *
 * The delays are negative so the wave is already halfway through on the first
 * paint — a row that appears mid-answer should not have to wait a full cycle
 * before it looks like it is waiting.
 */
const WAVE_DOTS = [0, 1, 2];

function WaitingDots() {
  return (
    <span role="img" aria-label="Waiting for input" className="flex items-center gap-[1.5px]">
      {WAVE_DOTS.map((index) => (
        <span
          key={index}
          className="size-1 animate-dot-wave rounded-full bg-amber-500"
          style={{ animationDelay: `${(index - 2) * 160}ms` }}
        />
      ))}
    </span>
  );
}

/** A prompt with nobody typing at it: the terminal's own caret, blinking. */
function IdleCaret() {
  return (
    <span
      role="img"
      aria-label="Idle"
      className="h-2.5 w-[2px] animate-caret-blink rounded-[1px] bg-muted-foreground/70"
    />
  );
}

/**
 * "Live, and the detector has not spoken" — a real fourth state, deliberately
 * the quietest mark in the slot: a 4px dot at 35% opacity, smaller than the
 * `StateDot` beside it (`size-1.5`) so the pair never reads as two connection
 * dots. Shown for an agent with no marker set at all, or one main's detector
 * has explicitly said `null` about — never a guess.
 */
function UnknownDot() {
  return (
    <span
      role="img"
      aria-label="Activity unknown"
      className="size-1 rounded-full bg-muted-foreground/35"
    />
  );
}

/**
 * A shell gets lucide's terminal glyph; an agent gets its own mark, in its own
 * accent from the roster — so a Claude session is identifiable before the label
 * is read, which is the whole reason the list is scannable at a glance.
 */
/**
 * The row's mark: a terminal glyph, or the agent's own.
 *
 * Resolved through `AGENT_ICONS` rather than hard-coded. This used to render
 * `<ClaudeIcon>` for *any* agent id, which was invisible while the roster had
 * exactly one entry in it and would have put Claude's face on Codex the moment
 * it had two.
 */
function SessionIcon({ agent, live }: { agent: AgentDefinition | undefined; live: boolean }) {
  const className = `size-3.5 shrink-0 ${live ? '' : 'opacity-50'}`;
  if (!agent) return <LuTerminal className={className} />;

  const Icon = resolveAgentIcon(agent);
  return (
    <Icon
      className={className}
      // Inline because the accent is data from the roster, not a Tailwind class
      // — a user-added agent brings a colour Tailwind has never seen.
      style={{ color: agent.accent }}
    />
  );
}
