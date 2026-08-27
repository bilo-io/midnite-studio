import type { AgentDefinition, TerminalSession } from '@midnite/git-shared';
import { Terminal, X } from 'lucide-react';
import { LuChevronRight, LuLoaderCircle, LuMessageCircleQuestion, LuPencil } from 'react-icons/lu';

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

      <ActivityIndicator activity={activity} />

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
 * Whether a live agent looks to be generating or back waiting on you — a
 * second, distinct glyph beside the connection dot, which only ever says
 * whether the PROCESS is alive.
 */
function ActivityIndicator({ activity }: { activity: SessionActivity | undefined }) {
  if (activity === 'thinking') {
    return (
      <LuLoaderCircle
        role="img"
        aria-label="Thinking"
        className="h-3 w-3 shrink-0 animate-spin text-muted-foreground"
      />
    );
  }
  if (activity === 'waiting') {
    return (
      <LuMessageCircleQuestion
        role="img"
        aria-label="Waiting for input"
        className="h-3 w-3 shrink-0 text-amber-500"
      />
    );
  }
  return null;
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
