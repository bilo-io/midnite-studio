import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Search } from 'lucide-react';

import { useRepoFiles, useRepos, useRefs, useWorktrees } from '../services/queries';
import { useAgents } from '../features/terminal/use-agents';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useUiStore } from '../store/ui-store';
import { displayChord } from '../features/status-bar/chord-hint';
import { cascadeStyle } from '../lib/cascade';
import { useCommandHandlers } from '../services/keybindings/use-command-handlers';
import { useGitOp } from '../services/use-status';
import {
  highlightMatches,
  scorePaletteItem,
  type PaletteSource,
  type ScoredPaletteItem,
} from '../services/palette/source';
import {
  createCommandSource,
  createFilesSource,
  createRefsSource,
  createReposSource,
  createTerminalSource,
  createViewsSource,
} from '../services/palette/providers';
import { parsePaletteQuery, usePaletteStore, type PaletteMode } from '../store/palette-store';
import { useFocusTrap } from './use-focus-trap';

const MODE_PLACEHOLDER: Partial<Record<PaletteMode, string>> = {
  journal: 'Reserved for the ops journal — see Phase 22 Theme H.',
};

type FlatRow =
  | { kind: 'heading'; group: string }
  | { kind: 'item'; scored: ScoredPaletteItem; flatIndex: number };

function buildFlatRows(scoredItems: ScoredPaletteItem[]): FlatRow[] {
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

/**
 * The `Mod+K` surface with fuzzy search, match highlighting and cross-source navigation.
 */
export function Palette() {
  const query = usePaletteStore((s) => s.query);
  const mode = usePaletteStore((s) => s.mode);
  const selectedIndex = usePaletteStore((s) => s.selectedIndex);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const setSelectedIndex = usePaletteStore((s) => s.setSelectedIndex);
  const close = usePaletteStore((s) => s.close);

  const runtime = useCommandHandlers();

  // Navigation data sources
  const reposQuery = useRepos();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const worktreesQuery = useWorktrees(selectedRepoId);
  const refsQuery = useRefs(selectedRepoId);
  const { agents } = useAgents();
  const sessions = useTerminalStore((s) => s.sessions);

  const repos = useMemo(() => reposQuery.data ?? [], [reposQuery.data]);
  const activeRepo = useMemo(
    () => repos.find((r) => r.id === selectedRepoId) ?? null,
    [repos, selectedRepoId],
  );
  const worktrees = useMemo(() => worktreesQuery.data ?? [], [worktreesQuery.data]);
  const refs = useMemo(() => refsQuery.data ?? [], [refsQuery.data]);

  // Head/tip SHA of active worktree or main
  const tipSha = useMemo(() => {
    const headRef = refs.find((r) => r.isHead);
    return headRef?.sha ?? null;
  }, [refs]);

  const filesQuery = useRepoFiles(
    selectedRepoId,
    tipSha,
    selectedWorktreePath ?? undefined,
    { enabled: mode === 'all' || mode === 'files' },
  );
  const files = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data]);
  const filesTruncated = filesQuery.data?.truncated ?? false;

  const checkoutOp = useGitOp<{ target: string; detach?: boolean }>('checkout', (api, args, ctx) =>
    api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );

  const handleCheckout = useCallback(
    (ref: { name: string }) => {
      checkoutOp.mutate({ target: ref.name });
    },
    [checkoutOp],
  );

  const handleReveal = useCallback((ref: { sha: string }) => {
    useUiStore.getState().setActiveView('graph');
    useUiStore.getState().selectCommit(ref.sha);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  useFocusTrap(containerRef, true);

  useEffect(() => {
    inputRef.current?.focus();
    const restoreTo = previouslyFocused.current;
    return () => restoreTo?.focus();
  }, []);

  const { needle } = parsePaletteQuery(query);

  const sources = useMemo<PaletteSource[]>(() => {
    const list: PaletteSource[] = [];

    // Commands source
    if (mode === 'all' || mode === 'commands') {
      list.push(createCommandSource(runtime, close));
    }

    // Views & Settings source
    if (mode === 'all' || mode === 'views') {
      list.push(createViewsSource(close));
    }

    // Repos & Worktrees source
    if (mode === 'all') {
      list.push(createReposSource(repos, worktrees, activeRepo?.id ?? null, close));
    }

    // Refs source (branches, tags)
    if ((mode === 'all' || mode === 'refs') && selectedRepoId) {
      list.push(createRefsSource(refs, close, handleCheckout, handleReveal));
    }

    // Files source
    if ((mode === 'all' || mode === 'files') && selectedRepoId) {
      list.push(createFilesSource(files, close));
    }

    // Sessions & Agents source
    if (mode === 'all') {
      list.push(createTerminalSource(sessions, agents, activeRepo, close));
    }

    return list;
  }, [
    mode,
    runtime,
    close,
    repos,
    worktrees,
    activeRepo,
    selectedRepoId,
    refs,
    handleCheckout,
    handleReveal,
    files,
    sessions,
    agents,
  ]);

  const scoredResults = useMemo(() => {
    const results: ScoredPaletteItem[] = [];

    for (const source of sources) {
      const items = source.items();
      for (const item of items) {
        const scored = scorePaletteItem(item, needle, source.key);
        if (scored) {
          results.push(scored);
        }
      }
    }

    // Sort by score descending (highest rank first)
    if (needle) {
      results.sort((a, b) => b.score - a.score);
    }

    return results;
  }, [sources, needle]);

  const flatRows = useMemo(() => buildFlatRows(scoredResults), [scoredResults]);

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
      row.scored.item.run();
    },
    [flatRows],
  );

  // Read through refs rather than depending on these directly — `scoredResults`
  // and `selectedIndex` change on every keystroke, which would otherwise tear
  // down and re-register this capture-phase listener on every render.
  const scoredResultsLengthRef = useRef(scoredResults.length);
  scoredResultsLengthRef.current = scoredResults.length;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const runSelectedItemRef = useRef(runSelectedItem);
  runSelectedItemRef.current = runSelectedItem;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
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
  }, [close, setSelectedIndex]);

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
        <div ref={scrollRef} id="palette-results" role="listbox" className="max-h-96 overflow-auto p-1">
          {placeholder ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{placeholder}</p>
          ) : scoredResults.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching items found.
            </p>
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
        {filesTruncated && (mode === 'all' || mode === 'files') && (
          <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            Results capped at 20,000 files. Refine your search query.
          </div>
        )}
      </div>
    </div>
  );
}
