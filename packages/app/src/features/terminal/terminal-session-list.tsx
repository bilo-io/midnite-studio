import type { AgentDefinition, TerminalSession } from '@midnite/git-shared';
import { Terminal, X } from 'lucide-react';
import { LuChevronRight } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { resolveAgentIcon } from '../../components/icons';
import { SortableList, useSortableRow } from '../../components/sortable-list';
import { StateDot } from '../../components/state-dot';
import { useUiStore } from '../../store/ui-store';
import {
  resolveSessionAgentId,
  sessionLabel,
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
  const sessions = useTerminalStore((s) => s.sessions);
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
        onSelect: () =>
          useUiStore.getState().setTerminalSidebarSide(side === 'left' ? 'right' : 'left'),
      },
    ]);
  };

  return (
    <div
      /*
        Named for the e2e suite, which has to tell this column apart from the
        repos sidebar and from the pane beside it — both are plain divs, and
        which SIDE this one sits on is exactly what the docking test asserts.
      */
      data-session-list
      className={`shrink-0 overflow-y-auto ${border} border-border py-1`}
      style={{ width }}
      onContextMenu={showDockMenu}
    >
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
            runningAgent={agents.find(
              (a) => a.id === resolveSessionAgentId(session, liveAgentId),
            )}
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
}) {
  const dialogs = useDialogs();
  const state = useTerminalStore((s) => s.states[session.id] ?? 'idle');
  const activity = useTerminalStore((s) => s.activity[session.id]);
  const autoName = useTerminalStore((s) => s.autoNames[session.id]);
  const { setNodeRef, style, attributes, listeners, isDragging } = useSortableRow(session.id);

  const live = state === 'open' || state === 'starting';
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
    dialogs.openMenu(event, [
      { label: 'Rename session…', onSelect: rename },
      // The prompt dialog itself cannot submit an empty value, so clearing a
      // custom name back to the live guess is a separate, explicit action
      // rather than "rename to nothing".
      {
        label: 'Reset to detected name',
        disabled: session.name === undefined,
        disabledReason: 'This session has no custom name.',
        onSelect: () => useTerminalStore.getState().renameSession(session.id, undefined),
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
      className={`group flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs ${
        active ? 'bg-accent/60' : 'hover:bg-accent/30'
      } ${isDragging ? 'opacity-80' : ''}`}
      onContextMenu={showMenu}
      onClick={() => useTerminalStore.getState().setActive(session.id)}
      onDoubleClick={rename}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
      >
        <SessionIcon agent={runningAgent} live={live} />
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
        <LuChevronRight
          aria-hidden
          className="h-3 w-3 shrink-0 text-muted-foreground/50"
        />
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
        Only a live agent gets one. A plain shell has no footer to read the
        state off (see activity-detect.ts), and an exited row is a transcript
        — a blinking caret on either would be an invented signal.
      */}
      {session.kind === 'agent' && live ? <ActivityIndicator activity={activity} /> : null}

      <StateDot state={state} />

      <IconButton
        icon={X}
        label="Close terminal"
        size="sm"
        className="opacity-0 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          useTerminalStore.getState().closeSession(session.id);
        }}
      />
    </div>
  );
}

/**
 * Whether a live agent looks to be generating, back waiting on you, or simply
 * sitting there — a second, distinct glyph beside the connection dot, which
 * only ever says whether the PROCESS is alive.
 *
 * Three drawn shapes rather than three icons, because the state IS the motion:
 * an arc going round is work in progress, an ellipsis rolling is a question
 * left open, a caret ticking is a prompt with nobody at it. An icon has to be
 * decoded; these are the same marks a terminal already uses for the same three
 * things. The 14px slot is fixed so the row's connection dot does not shift
 * sideways each time the glyph under it changes.
 */
function ActivityIndicator({ activity }: { activity: SessionActivity | undefined }) {
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      {activity === 'thinking' ? (
        <ThinkingSpinner />
      ) : activity === 'waiting' ? (
        <WaitingDots />
      ) : (
        <IdleCaret />
      )}
    </span>
  );
}

/**
 * The spinner, as a ring with a half-lit rim.
 *
 * Borders rather than an SVG or a glyph: at this size a stroked arc is a couple
 * of `border-*` colours on a circle, and rotating a bordered box is a
 * compositor-only transform where an animated icon component is a React tree
 * that re-renders.
 *
 * What the geometry has to earn, though, is legibility of the MOTION, and the
 * first cut — 12px, `border-[1.5px]`, one lit quadrant — did not. The lit part
 * came out as a lone ~8px dash one device pixel thick (Chromium floors a 1.5px
 * border to 1px below 2× scale), and one small dash going round once a second,
 * in a sidebar nobody is looking straight at, reads as a ring that is simply
 * sitting there. Measured before touching it, frame by frame off a paused
 * animation: the rotation was running the whole time and could not be seen.
 *
 * So 14px, a 2px rim, and two adjacent borders lit rather than one — a half
 * ring sweeping, which is unmistakably moving at a glance and is still the same
 * mark. Duration stays Tailwind's own 1s: `animate-spin` is the only animation
 * here that does not need a keyframe of its own, and inventing one to shave
 * 100ms off would make the mark depend on a `@keyframes spin` that Tailwind
 * only emits while some other file still uses the built-in utility.
 */
function ThinkingSpinner() {
  return (
    <span
      role="img"
      aria-label="Thinking"
      className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/25 border-r-foreground border-t-foreground"
    />
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
  if (!agent) return <Terminal className={className} />;

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

