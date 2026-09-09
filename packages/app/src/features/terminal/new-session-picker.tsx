import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';
import { LuPlus, LuSearch, LuTerminal } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { Popover } from '../../components/popover';
import { fuzzyMatch } from '../../services/palette/fuzzy-match';
import { buildAgentSections, NO_WORKTREE, type AgentRow, type AgentSection } from './new-session-menu';

export type NewSessionPickerProps = {
  agents: AgentDefinition[];
  status: AgentStatus[];
  hasWorktree: boolean;
  onNewTerminal: () => void;
  onNewAgent: (agent: AgentDefinition) => void;
};

/**
 * The `+` menu's trigger and its searchable panel.
 *
 * A dedicated popover rather than the generic `ContextMenu` (`dialogs.openMenu`,
 * still used everywhere else): the roster is long enough now that finding a
 * row means typing its name, and `ContextMenu` has no room for an input above
 * its items. Built on the same `Popover` primitive the status bar's own
 * panels use (`notification-bell.tsx`), with the keyboard model copied from
 * the command palette (`components/palette.tsx`) rather than invented fresh —
 * focus lands in the search box on open, arrow keys move a highlight through
 * the *filtered* rows, Enter runs the highlighted one, and Escape closes
 * (`Popover`'s own `useDismiss`, unchanged).
 */
export function NewSessionPicker({
  agents,
  status,
  hasWorktree,
  onNewTerminal,
  onNewAgent,
}: NewSessionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      label="New terminal or agent"
      testId="new-session-picker"
      panelClassName="w-72"
      triggerClassName="inline-flex h-6 shrink-0 items-center rounded-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
      trigger={<LuPlus aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />}
    >
      {/*
        Gated on `open` even though `Popover` already only mounts `children`
        into the DOM while open: it is what makes `PickerPanel` a fresh
        component instance every time the menu opens, so its own `query` and
        `highlighted` state start over rather than carrying the last search
        into the next open.
      */}
      {open ? (
        <PickerPanel
          agents={agents}
          status={status}
          hasWorktree={hasWorktree}
          onNewTerminal={() => {
            onNewTerminal();
            setOpen(false);
          }}
          onNewAgent={(agent) => {
            onNewAgent(agent);
            setOpen(false);
          }}
        />
      ) : null}
    </Popover>
  );
}

/** A row the keyboard may land on: the pinned New Terminal row, or one agent. */
type Row = { kind: 'terminal' } | { kind: 'agent'; row: AgentRow };

/**
 * Whether `query` picks out `agent` at all.
 *
 * Matched against `label` OR `command` — a user typing "goose" or "gs" (its
 * shorthand, as a fuzzy subsequence) finds it by name, and one who only
 * remembers the binary (`opencode`, `agy`) finds it by that instead. An empty
 * query matches everything, which is what makes "no query yet" render
 * identically to the unfiltered menu this replaced.
 */
function matchesQuery(query: string, agent: AgentDefinition): boolean {
  if (!query) return true;
  return Boolean(fuzzyMatch(query, agent.label) ?? fuzzyMatch(query, agent.command));
}

function isSelectable(row: Row | undefined, hasWorktree: boolean): row is Row {
  if (!row) return false;
  return row.kind === 'terminal' ? hasWorktree : !row.row.disabled;
}

/**
 * The next selectable row in `direction`, wrapping past either end — the same
 * stepping rule `context-menu.tsx` uses for its own roving focus, ported to a
 * flat array since this list has no submenus to skip over.
 */
function step(rows: Row[], from: number, direction: 1 | -1, hasWorktree: boolean): number {
  if (rows.length === 0) return 0;
  for (let hop = 1; hop <= rows.length; hop += 1) {
    const index = (((from + direction * hop) % rows.length) + rows.length) % rows.length;
    if (isSelectable(rows[index], hasWorktree)) return index;
  }
  return from;
}

function PickerPanel({
  agents,
  status,
  hasWorktree,
  onNewTerminal,
  onNewAgent,
}: {
  agents: AgentDefinition[];
  status: AgentStatus[];
  hasWorktree: boolean;
  onNewTerminal: () => void;
  onNewAgent: (agent: AgentDefinition) => void;
}) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Forward focus stays this panel's own business, the same as the palette's:
  // the search box is where a freshly opened picker expects the next keystroke.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sections = useMemo(
    () => buildAgentSections({ agents, status, hasWorktree }),
    [agents, status, hasWorktree],
  );

  /**
   * Sections filtered by the query, with a section dropped outright once its
   * matches run out — a header with nothing under it reads as a bug, not an
   * empty state.
   */
  const filteredSections = useMemo<AgentSection[]>(
    () =>
      sections
        .map((section) => ({
          ...section,
          rows: section.rows.filter((r) => matchesQuery(query, r.agent)),
        }))
        .filter((section) => section.rows.length > 0),
    [sections, query],
  );

  const flatRows = useMemo<Row[]>(() => {
    const list: Row[] = [{ kind: 'terminal' }];
    for (const section of filteredSections) {
      for (const row of section.rows) list.push({ kind: 'agent', row });
    }
    return list;
  }, [filteredSections]);

  /** Row index by identity, so render order and keyboard order can never drift apart. */
  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((r, i) => map.set(r.kind === 'terminal' ? 'terminal' : r.row.agent.id, i));
    return map;
  }, [flatRows]);

  // Typing a query that drops the highlighted row must not leave the
  // highlight pointed at a row that no longer exists.
  useEffect(() => {
    setHighlighted((current) =>
      isSelectable(flatRows[current], hasWorktree) ? current : step(flatRows, -1, 1, hasWorktree),
    );
  }, [flatRows, hasWorktree]);

  const runRow = (row: Row | undefined) => {
    if (!isSelectable(row, hasWorktree)) return;
    if (row.kind === 'terminal') onNewTerminal();
    else onNewAgent(row.row.agent);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => step(flatRows, current, 1, hasWorktree));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => step(flatRows, current, -1, hasWorktree));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runRow(flatRows[highlighted]);
    }
    // Escape is deliberately absent — `Popover`'s own `useDismiss` already
    // owns it, the same split `context-menu.tsx` makes for the same reason.
  };

  const noMatches = query.length > 0 && filteredSections.length === 0;

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <LuSearch aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a CLI…"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search agent CLIs"
        />
      </div>
      {/*
        `role="menu"`/`menuitem`, not `listbox`/`option`: this panel replaces
        `ContextMenu` at the one call site that used it (`terminal-panel.tsx`'s
        `+` button), and the whole existing e2e suite
        (`e2e/terminal.spec.ts`, `e2e/phase-21-roster.spec.ts`) already reads
        that menu by its rows' `menuitem` role, native `disabled` state and
        native `title` tooltip. Matching that contract here — real `<button>`
        rows rather than `Palette`'s `<div role="option">` — is what let the
        search box get added without touching a single existing assertion
        about the roster itself.
      */}
      <div role="menu" aria-orientation="vertical" className="max-h-80 overflow-auto p-1">
        <PickerRow
          label="New Terminal"
          icon={LuTerminal}
          selected={highlighted === indexByKey.get('terminal')}
          disabled={!hasWorktree}
          disabledReason={hasWorktree ? undefined : NO_WORKTREE}
          onSelect={() => runRow({ kind: 'terminal' })}
          onHover={() => setHighlighted(indexByKey.get('terminal') ?? 0)}
        />
        {noMatches ? (
          <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            No CLI matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id}>
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </div>
              {section.rows.map((row) => {
                const rowIndex = indexByKey.get(row.agent.id);
                return (
                  <PickerRow
                    key={row.agent.id}
                    label={row.agent.label}
                    icon={row.icon}
                    iconStyle={row.iconStyle}
                    selected={highlighted === rowIndex}
                    disabled={row.disabled}
                    disabledReason={row.disabledReason}
                    onSelect={() => runRow({ kind: 'agent', row })}
                    onHover={() => setHighlighted(rowIndex ?? 0)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PickerRow({
  label,
  icon: Icon,
  iconStyle,
  selected,
  disabled,
  disabledReason,
  onSelect,
  onHover,
}: {
  label: string;
  icon: IconComponent;
  iconStyle?: CSSProperties;
  selected: boolean;
  disabled: boolean;
  /** Shown as the row's native `title` tooltip — same surface `context-menu.tsx` uses. */
  disabledReason: string | undefined;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-selected={selected}
      disabled={disabled}
      onMouseEnter={onHover}
      onClick={disabled ? undefined : onSelect}
      // The reason belongs on the row itself — see `context-menu.tsx`'s
      // identical choice: a greyed-out row with no explanation is the most
      // frustrating thing a menu can show.
      title={disabled ? disabledReason : undefined}
      className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected ? 'bg-accent text-foreground' : 'text-foreground'
      }`}
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" style={iconStyle} />
      <span className="truncate">{label}</span>
    </button>
  );
}
