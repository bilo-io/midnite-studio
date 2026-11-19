// Pure helpers for the History timeline (Phase 146 Theme G1): day grouping, relative time, short shas.
import type { Commit } from '@midnite/studio-shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface DaySection {
  /** Stable key: the local calendar day, `YYYY-MM-DD`. */
  key: string;
  /** "Today", "Yesterday", or `Tue 11 Nov`. */
  label: string;
  commits: Commit[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The separator label for a local calendar day relative to `now`. */
export function dayLabel(date: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const key = dayKey(date);
  if (key === dayKey(today)) return 'Today';
  if (key === dayKey(yesterday)) return 'Yesterday';
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Group commits (in the order given) into consecutive local-day sections by author date. */
export function groupByDay(commits: readonly Commit[], now: Date): DaySection[] {
  const sections: DaySection[] = [];
  for (const commit of commits) {
    const date = new Date(commit.authorDate * 1000);
    const key = dayKey(date);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.commits.push(commit);
    else sections.push({ key, label: dayLabel(date, now), commits: [commit] });
  }
  return sections;
}

export const shortSha = (sha: string): string => sha.slice(0, 7);

export const isMerge = (commit: Pick<Commit, 'parents'>): boolean => commit.parents.length > 1;

/** `now`, `5m`, `2h`, `3d`, `4w`, `6mo`, `2y` from unix seconds. */
export function relativeTime(unixSeconds: number, now: Date): string {
  const diff = Math.max(0, Math.floor(now.getTime() / 1000) - unixSeconds);
  if (diff < 60) return 'now';
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export type TimelineEntry =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'commit'; key: string; commit: Commit; isHead: boolean; isLast: boolean };

/** Flatten sections into list entries; the very first commit is the branch head, the final one ends the rail. */
export function buildTimeline(commits: readonly Commit[], now: Date, hasMore: boolean): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let index = 0;
  const total = commits.length;
  for (const section of groupByDay(commits, now)) {
    out.push({ kind: 'header', key: `h:${section.key}:${index}`, label: section.label });
    for (const commit of section.commits) {
      out.push({ kind: 'commit', key: `c:${commit.sha}`, commit, isHead: index === 0, isLast: index === total - 1 && !hasMore });
      index += 1;
    }
  }
  return out;
}

/** `Wed 11 Nov 2026, 14:03` in the device's local time. */
export function formatDateTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
