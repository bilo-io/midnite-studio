import type { GameLogEntry } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useGameRunStore } from './game-run-store';

type Level = GameLogEntry['level'];
type Filter = 'all' | 'warn' | 'error';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'warn', label: 'Warnings' },
  { id: 'error', label: 'Errors' },
];

const LEVEL_CLASS: Record<Level, string> = {
  log: 'text-foreground/90',
  info: 'text-foreground/90',
  warn: 'text-amber-500',
  error: 'text-destructive',
  exception: 'text-destructive',
  crash: 'text-destructive font-semibold',
};

export const matchesFilter = (level: Level, filter: Filter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'warn') return level === 'warn';
  return level === 'error' || level === 'exception' || level === 'crash';
};

/**
 * The console under the viewport (Phase 107 Theme B): everything the game
 * prints and every uncaught error, filterable by level. **Clear** empties the
 * view, not main's buffer — `game_logs` keeps its cursor. Auto-scrolls unless
 * the user has scrolled up; the log region is polite, and only errors are
 * announced.
 */
export function GameConsoleDrawer({ gameId }: { gameId: string | null }) {
  const entries = useGameRunStore((s) => (gameId ? s.logs[gameId] : undefined));
  const clearedAt = useGameRunStore((s) => (gameId ? (s.clearedAt[gameId] ?? 0) : 0));
  const clear = useGameRunStore((s) => s.clear);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(
    () => (entries ?? []).filter((entry) => entry.seq > clearedAt && matchesFilter(entry.level, filter)),
    [entries, clearedAt, filter],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const lastError = [...shown].reverse().find((entry) => matchesFilter(entry.level, 'error'));

  return (
    <section aria-label="Game console" data-testid="game-console" className="flex h-44 shrink-0 flex-col border-t border-border">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border px-2">
        <span className="mr-2 text-[11px] font-medium text-muted-foreground">Console</span>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded px-1.5 py-0.5 text-[11px] ${filter === item.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'}`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!gameId || shown.length === 0}
          onClick={() => gameId && clear(gameId)}
          className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/60 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      <div
        ref={listRef}
        role="log"
        aria-label="Console output"
        aria-live="off"
        onScroll={(event) => {
          const el = event.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
        className="min-h-0 flex-1 overflow-auto px-2 py-1 font-mono text-[11px] leading-snug"
      >
        {shown.length === 0 ? (
          <p className="text-muted-foreground">Nothing logged yet.</p>
        ) : (
          shown.map((entry) => (
            <div key={entry.seq} data-level={entry.level} className={`whitespace-pre-wrap break-words ${LEVEL_CLASS[entry.level]}`}>
              {entry.text}
              {entry.source ? (
                <span className="text-muted-foreground">
                  {' '}
                  {entry.source.replace(/^mstudio-game:\/\/[^/]+\//, '')}
                  {entry.line !== undefined ? `:${entry.line}` : ''}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
      {/* Errors only, announced politely. */}
      <p aria-live="polite" className="sr-only">
        {lastError ? lastError.text : ''}
      </p>
    </section>
  );
}
