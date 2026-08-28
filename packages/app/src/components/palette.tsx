import { useCallback, useEffect, useMemo, useRef } from 'react';

import { COMMANDS, type CommandDescriptor, type CommandGroup } from '@midnite/git-shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';

import { displayChord } from '../features/status-bar/chord-hint';
import { cascadeStyle } from '../lib/cascade';
import { useCommandHandlers } from '../services/keybindings/use-command-handlers';
import {
  chordOf,
  filterCommands,
  groupCommands,
  parsePaletteQuery,
  usePaletteStore,
  type PaletteMode,
} from '../store/palette-store';
import { useFocusTrap } from './use-focus-trap';

const GROUP_LABEL: Record<CommandGroup, string> = {
  repository: 'Repository',
  view: 'View',
  sync: 'Sync',
  terminal: 'Terminal',
  status: 'Status',
  graph: 'Graph',
  operation: 'Operation',
  palette: 'Palette',
  files: 'Files',
};

/** Every mode besides the two Theme C actually has data for. Kept in one
 * place so adding a source later is a one-line change here, not a new
 * component — see the phase doc's "one surface" resolution. */
const MODE_PLACEHOLDER: Partial<Record<PaletteMode, string>> = {
  refs: 'Branch and ref search arrives in Theme E.',
  views: 'View and settings search arrives in Theme E.',
  files: 'The file finder arrives in Theme G.',
  journal: 'Reserved for the ops journal — see Phase 22 Theme H.',
};

type FlatRow =
  | { kind: 'heading'; group: CommandGroup }
  | { kind: 'command'; command: CommandDescriptor; flatIndex: number };

function buildFlatRows(groups: [CommandGroup, CommandDescriptor[]][]): FlatRow[] {
  const rows: FlatRow[] = [];
  let flatIndex = 0;
  for (const [group, commands] of groups) {
    rows.push({ kind: 'heading', group });
    for (const command of commands) rows.push({ kind: 'command', command, flatIndex: flatIndex++ });
  }
  return rows;
}

/**
 * The `Mod+K` surface. One component for every sigil mode, per the phase
 * doc's "one surface with a sigil grammar" — a mode with no source yet
 * renders a placeholder rather than gaining a second component when its
 * theme lands.
 *
 * Rendered only while `usePaletteStore` reports open (see `palette-host.tsx`),
 * so every hook here can assume it is mounted for exactly one open session.
 */
export function Palette() {
  const query = usePaletteStore((s) => s.query);
  const mode = usePaletteStore((s) => s.mode);
  const selectedIndex = usePaletteStore((s) => s.selectedIndex);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const setSelectedIndex = usePaletteStore((s) => s.setSelectedIndex);
  const close = usePaletteStore((s) => s.close);

  const runtime = useCommandHandlers();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Captured during render, in the lazy initializer — not in an effect. By the
  // time any effect runs (including `useFocusTrap`'s, which moves focus onto
  // the container), whatever opened the palette has already lost it, so an
  // effect-based capture would record the container itself instead.
  const previouslyFocused = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  useFocusTrap(containerRef, true);

  useEffect(() => {
    inputRef.current?.focus();
    const restoreTo = previouslyFocused.current;
    return () => restoreTo?.focus();
  }, []);

  const showsCommands = mode === 'all' || mode === 'commands';
  const { needle } = parsePaletteQuery(query);

  const results = useMemo(
    () => (showsCommands ? filterCommands(COMMANDS, needle) : []),
    [showsCommands, needle],
  );
  const groups = useMemo(() => groupCommands(results), [results]);
  const flatRows = useMemo(() => buildFlatRows(groups), [groups]);

  const rowIndexForSelection = flatRows.findIndex(
    (row) => row.kind === 'command' && row.flatIndex === selectedIndex,
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flatRows[index]?.kind === 'heading' ? 28 : 36),
    overscan: 8,
  });

  useEffect(() => {
    if (rowIndexForSelection >= 0) virtualizer.scrollToIndex(rowIndexForSelection, { align: 'auto' });
  }, [rowIndexForSelection, virtualizer]);

  // Takes the row's own index rather than reading `selectedIndex` from the
  // closure: a click handler that first calls `setSelectedIndex` and then this
  // would run the PREVIOUS selection, since the store update has not re-run
  // this render yet when the very next line executes.
  const runCommand = useCallback(
    (flatIndex: number) => {
      const row = flatRows.find((r) => r.kind === 'command' && r.flatIndex === flatIndex);
      if (!row || row.kind !== 'command') return;
      const entry = runtime[row.command.id];
      if (!entry.enabled) return;
      close();
      entry.run();
    },
    [close, flatRows, runtime],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Popover's own Escape handling stops propagation; ConfirmDialog's
        // does not, and the phase doc calls that an inconsistency worth
        // fixing rather than repeating. The palette follows Popover: it is
        // the topmost surface whenever it is open, so nothing beneath it
        // should also react to the same keystroke.
        event.stopPropagation();
        close();
        return;
      }
      if (!showsCommands || results.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, results.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runCommand(selectedIndex);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, results.length, runCommand, selectedIndex, setSelectedIndex, showsCommands]);

  const placeholder = MODE_PLACEHOLDER[mode];

  return (
    <div
      className="fixed inset-0 z-dialog flex items-start justify-center bg-background/70 p-6 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-xl animate-fade-in overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command, or > @ : for commands, refs, views…"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div ref={scrollRef} id="palette-results" role="listbox" className="max-h-80 overflow-auto p-1">
          {placeholder ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{placeholder}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching commands.
            </p>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = flatRows[item.index];
                if (!row) return null;
                const style = { transform: `translateY(${item.start}px)` } as const;

                if (row.kind === 'heading') {
                  return (
                    <div
                      key={`heading:${row.group}`}
                      className="absolute left-0 top-0 w-full px-2.5 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      style={style}
                    >
                      {GROUP_LABEL[row.group]}
                    </div>
                  );
                }

                const entry = runtime[row.command.id];
                const selected = row.flatIndex === selectedIndex;
                const chord = chordOf(row.command);
                return (
                  <div
                    key={row.command.id}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={!entry.enabled}
                    onMouseEnter={() => setSelectedIndex(row.flatIndex)}
                    onClick={() => runCommand(row.flatIndex)}
                    className={`absolute left-0 top-0 flex w-full animate-fade-in-up cascade-delay items-center justify-between gap-3 rounded-md px-2.5 text-sm ${
                      entry.enabled ? 'cursor-pointer' : 'cursor-default opacity-50'
                    } ${selected ? 'bg-accent text-foreground' : 'text-foreground'}`}
                    style={{ ...style, ...cascadeStyle(row.flatIndex), height: 36 }}
                    title={!entry.enabled ? entry.disabledReason : undefined}
                  >
                    <span className="truncate">{row.command.label}</span>
                    {chord ? (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {displayChord(chord)}
                      </span>
                    ) : !entry.enabled ? (
                      <span className="shrink-0 truncate text-xs text-muted-foreground">
                        {entry.disabledReason}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
