import type { AgentDefinition, TerminalSession } from '@midnite/git-shared';
import { Terminal, X } from 'lucide-react';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { ClaudeIcon } from '../../components/icons/claude-icon';
import { SortableList, useSortableRow } from '../../components/sortable-list';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore, type ConnectionState } from './terminal-store';

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
  const state = useTerminalStore((s) => s.states[session.id] ?? 'idle');
  const { setNodeRef, style, attributes, listeners, isDragging } = useSortableRow(session.id);

  const live = state === 'open' || state === 'starting';

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
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={() => useTerminalStore.getState().setActive(session.id)}
      >
        <SessionIcon agent={agent} live={live} />
        <span className={`truncate ${live ? '' : 'text-muted-foreground'}`}>
          {agent ? `${agent.label} · ${session.title}` : session.title}
        </span>
      </button>

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

/** Running, or a saved transcript with nothing behind it. */
function StateDot({ state }: { state: ConnectionState }) {
  if (state === 'open') return <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />;
  if (state === 'starting')
    return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />;
}
