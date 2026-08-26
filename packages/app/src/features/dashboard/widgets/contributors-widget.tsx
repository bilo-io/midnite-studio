import { useMemo } from 'react';

import type { RepoStats } from '@midnite/git-shared';

import { byCommits } from '../dashboard-derive';
import { AuthorAvatar } from './author-avatar';
import { WidgetState } from '../widget-frame';

/**
 * Who committed, how much, and when they were last seen.
 *
 * Insertions and deletions are `null` — not zero — when the board has no reason
 * to have paid for `--numstat`, and that distinction is rendered as `—` rather
 * than as `0`. "We did not measure this" and "this person added no lines" are
 * different statements, and the `RepoStats` contract keeps them apart
 * specifically so a table like this one can too.
 */
export function ContributorsWidget({
  stats,
  loading,
  authors,
  onToggleAuthor,
}: {
  stats: RepoStats | undefined;
  loading: boolean;
  /** Board-wide author filter. Empty means everyone. */
  authors: readonly string[];
  onToggleAuthor: (email: string) => void;
}) {
  const rows = useMemo(() => byCommits(stats?.contributors ?? []), [stats?.contributors]);

  return (
    <WidgetState
      loading={loading}
      empty={rows.length === 0}
      emptyLabel="No commits by anyone in this window."
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="pb-1 font-medium">
              Author
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Commits
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              +
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              −
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Last
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => {
            const selected = authors.includes(person.email);
            return (
              <tr key={person.email} className="border-t border-border/50">
                <td className="py-1 pr-2">
                  {/*
                    The row IS the filter control — clicking a name scopes the
                    whole board to that person. A separate filter menu exists in
                    the toolbar for reaching someone not on the visible page;
                    this is the gesture you actually reach for while reading the
                    table.
                  */}
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggleAuthor(person.email)}
                    title={person.email}
                    className={`flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent/40 ${
                      selected ? 'bg-accent/60 font-medium' : ''
                    }`}
                  >
                    <AuthorAvatar email={person.email} name={person.name} size={16} />
                    <span className="truncate">{person.name}</span>
                  </button>
                </td>
                <td className="py-1 text-right tabular-nums">{person.commits}</td>
                <td className="py-1 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {person.insertions === null ? '—' : person.insertions}
                </td>
                <td className="py-1 text-right tabular-nums text-rose-600 dark:text-rose-400">
                  {person.deletions === null ? '—' : person.deletions}
                </td>
                <td className="py-1 text-right tabular-nums text-muted-foreground">
                  {relativeDays(person.lastAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </WidgetState>
  );
}

/**
 * "3d", "5w", "2y" — a width that fits in a table column.
 *
 * Computed against `Date.now()` at render rather than memoised: the board is
 * not a live clock, and a value that is a few minutes stale at this resolution
 * is indistinguishable from a fresh one.
 */
export function relativeDays(epochSeconds: number): string {
  const days = Math.floor((Date.now() / 1000 - epochSeconds) / 86_400);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 730) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
