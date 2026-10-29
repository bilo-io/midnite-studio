import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import { LuSearch } from 'react-icons/lu';

import { cascadeStyle } from '../../lib/cascade';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { displayChord } from '../../shell/nav-config';
import type { CommandRuntime } from '../command-runtime';
import { createCommandSource, type CommandSourceOptions } from './command-source';
import { useFrecencyStore } from './frecency-store';
import { parsePaletteQuery, usePaletteStore, type PaletteMode } from './palette-store';
import { highlightMatches, scorePaletteItem, type PaletteSource, type ScoredPaletteItem } from './source';

const MODE_PLACEHOLDER: Partial<Record<PaletteMode, string>> = {
  journal: 'Reserved for the ops journal — see Phase 22 Theme H.',
};

type FlatRow =
  | { kind: 'heading'; group: string }
  | { kind: 'item'; scored: ScoredPaletteItem; flatIndex: number };

/**
 * `flat`, when true, skips section headings entirely and returns the items in whatever order
 * `scoredItems` already arrives in (score-sorted once a needle is typed). Grouping is for the
 * *unfiltered* open; once fuzzy scoring is ranking across every source, re-bucketing the
 * already-ranked list by group would fight that ranking (Phase 23 Theme E, reopened).
 */
function buildFlatRows(scoredItems: ScoredPaletteItem[], flat: boolean): FlatRow[] {
  if (flat) {
    return scoredItems.map((scored, flatIndex) => ({ kind: 'item', scored, flatIndex }));
  }

  const rows: FlatRow[] = [];
  const groups = new Map<string, ScoredPaletteItem[]>();

  for (const s of scoredItems) {
    const grp = s.item.group;
    const bucket = groups.get(grp);
    if (bucket) bucket.push(s);
    else groups.set(grp, [s]);
  }

  let flatIndex = 0;
  for (const [group, items] of groups) {
    rows.push({ kind: 'heading', group });
    for (const scored of items) {
      rows.push({ kind: 'item', scored, flatIndex: flatIndex++ });
    }
  }
  return rows;
}

/** Escape closes — the default when the host app has no dismissal stack of its own. */
function useEscapeDismiss(active: boolean, onDismiss: () => void): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismissRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

export type CommandPaletteProps = {
  /** The app's commands: the palette lists every one with a handler, and nothing else. */
  runtime: CommandRuntime;
  /** Studio narrows the command rows to its palette-safe list and gives them glyphs. */
  commandOptions?: CommandSourceOptions;
  /**
   * Further sources listed after the commands — Studio's views, repos, refs, files and sessions.
   * The caller reads the palette's `mode` from `usePaletteStore` to decide which apply.
   */
  sources?: readonly PaletteSource[];
  /** A note under the results (Studio's "results capped" line). */
  footer?: ReactNode;
  /**
   * Registers the palette's Escape with the host's dismissal stack (Studio's `useDismiss`, which
   * also counts it as an occluder over the browser pane). Called as a hook, so it must be the same
   * function for the palette's whole lifetime. Defaults to a plain Escape listener.
   */
  useDismiss?: (active: boolean, onDismiss: () => void) => void;
};

/**
 * The `Mod+K` surface (moved to the frame in Phase 123 Theme D): fuzzy search, match highlighting
 * and frecency over the app's commands plus whatever sources the app adds.
 */
export function CommandPalette({
  runtime,
  commandOptions,
  sources: extraSources,
  footer,
  useDismiss = useEscapeDismiss,
}: CommandPaletteProps) {
  const query = usePaletteStore((s) => s.query);
  const mode = usePaletteStore((s) => s.mode);
  const selectedIndex = usePaletteStore((s) => s.selectedIndex);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const setSelectedIndex = usePaletteStore((s) => s.setSelectedIndex);
  const close = usePaletteStore((s) => s.close);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restoration on close is the trap's job (Phase 68 Theme A); the palette navigates views, so its
  // trigger being gone by the time it closes is the normal case, not the edge one.
  useFocusTrap(containerRef, true);

  // Forward focus stays the palette's own business: the search box is where a freshly opened
  // palette expects the next keystroke.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { needle } = parsePaletteQuery(query);

  const sources = useMemo<PaletteSource[]>(() => {
    const list: PaletteSource[] = [];
    if (mode === 'all' || mode === 'commands') {
      list.push(createCommandSource(runtime, close, commandOptions));
    }
    if (extraSources) list.push(...extraSources);
    return list;
  }, [mode, runtime, close, commandOptions, extraSources]);

  const scoredResults = useMemo(() => {
    const results: ScoredPaletteItem[] = [];
    for (const source of sources) {
      for (const item of source.items()) {
        const scored = scorePaletteItem(item, needle, source.key);
        if (scored) results.push(scored);
      }
    }
    // Sort by score descending (highest rank first)
    if (needle) results.sort((a, b) => b.score - a.score);
    return results;
  }, [sources, needle]);

  const flatRows = useMemo(() => buildFlatRows(scoredResults, Boolean(needle)), [scoredResults, needle]);

  const rowIndexForSelection = flatRows.findIndex(
    (row) => row.kind === 'item' && row.flatIndex === selectedIndex,
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flatRows[index]?.kind === 'heading' ? 28 : 38),
    overscan: 8,
  });

  useEffect(() => {
    if (rowIndexForSelection >= 0) virtualizer.scrollToIndex(rowIndexForSelection, { align: 'auto' });
  }, [rowIndexForSelection, virtualizer]);

  const runSelectedItem = useCallback(
    (flatIndex: number) => {
      const row = flatRows.find((r) => r.kind === 'item' && r.flatIndex === flatIndex);
      if (!row || row.kind !== 'item') return;
      if (row.scored.item.disabled) return;
      // The frecency nudge (Phase 23 Theme D, reopened): every run, from any source, bumps that
      // item's id — the one place a palette item actually fires.
      useFrecencyStore.getState().bump(row.scored.item.id);
      row.scored.item.run();
    },
    [flatRows],
  );

  // Read through refs rather than depending on these directly — `scoredResults` and
  // `selectedIndex` change on every keystroke, which would otherwise tear down and re-register
  // this listener on every render.
  const scoredResultsLengthRef = useRef(scoredResults.length);
  scoredResultsLengthRef.current = scoredResults.length;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const runSelectedItemRef = useRef(runSelectedItem);
  runSelectedItemRef.current = runSelectedItem;

  useDismiss(true, close);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const length = scoredResultsLengthRef.current;
      if (length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(Math.min(selectedIndexRef.current + 1, length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(Math.max(selectedIndexRef.current - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runSelectedItemRef.current(selectedIndexRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSelectedIndex]);

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
        className="w-full max-w-xl animate-fade-in overflow-hidden rounded-lg gradient-border gradient-border--always border border-border bg-popover shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <LuSearch aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        <div
          ref={scrollRef}
          id="palette-results"
          role="listbox"
          className="hide-scrollbar max-h-96 overflow-auto p-1"
        >
          {placeholder ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{placeholder}</p>
          ) : scoredResults.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching items found.</p>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const row = flatRows[vItem.index];
                if (!row) return null;
                const style = { transform: `translateY(${vItem.start}px)` } as const;

                if (row.kind === 'heading') {
                  return (
                    <div
                      key={`heading:${row.group}`}
                      className="absolute left-0 top-0 w-full px-2.5 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      style={style}
                    >
                      {row.group}
                    </div>
                  );
                }

                const { item, labelIndices, detailIndices } = row.scored;
                const selected = row.flatIndex === selectedIndex;
                const Icon = item.icon;

                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={item.disabled}
                    onMouseEnter={() => setSelectedIndex(row.flatIndex)}
                    onClick={() => runSelectedItem(row.flatIndex)}
                    className="absolute left-0 top-0 w-full"
                    style={{ ...style, height: 38 }}
                    title={item.disabled ? item.disabledReason : undefined}
                  >
                    <div
                      className={`flex h-full w-full animate-fade-in-up cascade-delay items-center justify-between gap-3 rounded-md px-2.5 text-sm ${
                        !item.disabled ? 'cursor-pointer' : 'cursor-default opacity-50'
                      } ${selected ? 'bg-accent text-foreground' : 'text-foreground'}`}
                      style={cascadeStyle(row.flatIndex)}
                    >
                      <div className="flex min-w-0 items-center gap-2.5 truncate">
                        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{highlightMatches(item.label, labelIndices)}</span>
                        {item.detail && (
                          <span className="truncate text-xs text-muted-foreground">
                            {highlightMatches(item.detail, detailIndices ?? [])}
                          </span>
                        )}
                      </div>
                      {item.chord ? (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {displayChord(item.chord)}
                        </span>
                      ) : item.disabled ? (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">
                          {item.disabledReason}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}
