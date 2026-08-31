import { useMemo } from 'react';

import type { RepoStats } from '@midnite/studio-shared';

import { formatNumber } from '../../../lib/format-number';
import { localDayKey, newestFirst } from '../dashboard-derive';
import { AuthorAvatar } from './author-avatar';
import { relativeDays } from './contributors-widget';
import { WidgetState } from '../widget-frame';

/** How many rows the feed shows before it stops. */
const FEED_LIMIT = 40;

/**
 * The newest commits, as a feed you can click through to the graph.
 *
 * Commits only, for now. The phase describes this as a merged feed that also
 * carries run and PR events where a GitHub remote exists — but those arrive
 * with an ISO timestamp and a wholly different row shape, and interleaving them
 * correctly is Theme C/E's `ForgeRunDetail` work rather than something to
 * approximate here from a run list that carries no per-event history.
 */
export function ActivityWidget({
  stats,
  loading,
  selectedDay,
  onClearDay,
  onSelectCommit,
}: {
  stats: RepoStats | undefined;
  loading: boolean;
  /** Set by clicking a calendar cell. Null means the whole window. */
  selectedDay: string | null;
  onClearDay: () => void;
  onSelectCommit: (sha: string) => void;
}) {
  const rows = useMemo(() => {
    const all = newestFirst(stats?.activity ?? []);
    const scoped = selectedDay ? all.filter((e) => localDayKey(e.at) === selectedDay) : all;
    return scoped.slice(0, FEED_LIMIT);
  }, [stats?.activity, selectedDay]);

  const totalScoped = useMemo(() => {
    if (!selectedDay) return stats?.activity.length ?? 0;
    return (stats?.activity ?? []).filter((e) => localDayKey(e.at) === selectedDay).length;
  }, [stats?.activity, selectedDay]);

  return (
    <WidgetState
      loading={loading}
      empty={rows.length === 0}
      emptyLabel={
        selectedDay ? `No commits on ${selectedDay}.` : 'No commits in this window yet.'
      }
    >
      <div className="flex flex-col gap-1">
        {selectedDay ? (
          <button
            type="button"
            onClick={onClearDay}
            className="self-start rounded bg-accent/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {selectedDay} · clear day filter
          </button>
        ) : null}

        <ul className="flex flex-col">
          {rows.map((entry) => (
            <li key={entry.sha} className="border-b border-border/40 last:border-0">
              <button
                type="button"
                onClick={() => onSelectCommit(entry.sha)}
                className="flex w-full min-w-0 items-center gap-2 py-1 text-left transition-colors hover:bg-accent/30"
              >
                <AuthorAvatar email={entry.authorEmail} name={entry.authorName} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{entry.subject}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {entry.authorName}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {entry.sha.slice(0, 7)}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {relativeDays(entry.at)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/*
          Said out loud rather than left as a silently short list. The feed is
          the one widget where "there are more" is genuinely likely, and a
          truncated list that does not admit it reads as the whole answer.
        */}
        {totalScoped > rows.length ? (
          <p className="pt-1 text-[10px] text-muted-foreground">
            Showing the newest {formatNumber(rows.length)} of {formatNumber(totalScoped)}.
          </p>
        ) : null}
      </div>
    </WidgetState>
  );
}
