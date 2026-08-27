import type { AgentDefinition, TerminalSession } from '@midnite/git-shared';
import { Terminal, X } from 'lucide-react';
import { LuChevronRight, LuPencil } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { ClaudeIcon } from '../../components/icons/claude-icon';
import { SortableList, useSortableRow } from '../../components/sortable-list';
import { useUiStore } from '../../store/ui-store';
import {
  sessionLabel,
  useTerminalStore,
  type ConnectionState,
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
}: {
  session: TerminalSession;
  active: boolean;
  agent: AgentDefinition | undefined;
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
      className={`group flex w-full items-center gap-1.5 px-2 py-1 text-xs ${
        active ? 'bg-accent/60' : 'hover:bg-accent/30'
      } ${isDragging ? 'opacity-80' : ''}`}
      onContextMenu={showMenu}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        onClick={() => useTerminalStore.getState().setActive(session.id)}
        onDoubleClick={rename}
      >
        <SessionIcon agent={agent} live={live} />
        {/*
          The repo name, then the session's own name — "Claude · Claude" for
          every agent session (Phase 19's shape) said the same thing twice and
          named neither session. Shrinking the repo name rather than the
          session name keeps the part that actually tells two Claude sessions
          apart from being what truncates first.
        */}
        <span
          className={`shrink truncate ${live ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}
        >
          {session.title}
        </span>
        <LuChevronRight
          aria-hidden
          className="h-3 w-3 shrink-0 text-muted-foreground/50"
        />
        <span className={`min-w-0 flex-1 truncate ${live ? '' : 'text-muted-foreground'}`}>
          {name}
        </span>
      </button>

      {/*
        Only a live agent gets one. A plain shell has no footer to read the
        state off (see activity-detect.ts), and an exited row is a transcript
        — a blinking caret on either would be an invented signal.
      */}
      {session.kind === 'agent' && live ? <ActivityIndicator activity={activity} /> : null}

      <IconButton
        icon={LuPencil}
        label="Rename session"
        size="sm"
        className="opacity-0 group-hover:opacity-100"
        onClick={rename}
      />

      <StateDot state={state} />

      <IconButton
        icon={X}
        label="Close terminal"
        size="sm"
        className="opacity-0 group-hover:opacity-100"
        onClick={() => useTerminalStore.getState().closeSession(session.id)}
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
function SessionIcon({ agent, live }: { agent: AgentDefinition | undefined; live: boolean }) {
  if (!agent) {
    return <Terminal className={`size-3.5 shrink-0 ${live ? '' : 'opacity-50'}`} />;
  }
  return (
    <ClaudeIcon
      className={`size-3.5 shrink-0 ${live ? '' : 'opacity-50'}`}
      // Inline because the accent is data from the roster, not a Tailwind class
      // — a user-added agent brings a colour Tailwind has never seen.
      style={{ color: agent.accent }}
    />
  );
}

/**
 * Running, or a saved transcript with nothing behind it.
 *
 * A live dot (open or starting) pulses via a `box-shadow` ring in its own
 * colour — `--pulse-a`/`--pulse-b` set inline are the ring's near and far
 * alpha, since a single `box-shadow` cannot itself animate between two
 * rgba()s in a Tailwind keyframe (see `dot-pulse`, tailwind.config.ts).
 */
function StateDot({ state }: { state: ConnectionState }) {
  if (state === 'open') return <PulsingDot rgb="16 185 129" className="bg-emerald-500" />;
  if (state === 'starting') return <PulsingDot rgb="245 158 11" className="bg-amber-500" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />;
}

function PulsingDot({ rgb, className }: { rgb: string; className: string }) {
  return (
    <span
      className={`size-1.5 shrink-0 animate-dot-pulse rounded-full ${className}`}
      style={
        {
          '--pulse-a': `rgb(${rgb} / 0.65)`,
          '--pulse-b': `rgb(${rgb} / 0)`,
        } as React.CSSProperties
      }
    />
  );
}
