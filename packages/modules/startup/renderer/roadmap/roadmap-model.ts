import { milestoneCycle, type Milestone } from '@midnite/studio-shared';

const CLOSED = new Set<Milestone['status']>(['done', 'dropped']);

export const byIdMap = (milestones: readonly Milestone[]): ReadonlyMap<string, Milestone> => new Map(milestones.map((m) => [m.id, m]));

/** Would giving `id` these dependencies close a loop? A self-dependency is a loop. Main re-checks on every upsert. */
export function wouldCreateCycle(milestones: readonly Milestone[], id: string, dependsOn: readonly string[]): boolean {
  return milestoneCycle(milestones, id, dependsOn) !== null;
}

/** Not finished, yet a dependency that is not `done` is due on or after this milestone's own due date. */
export function atRisk(m: Milestone, byId: ReadonlyMap<string, Milestone>): boolean {
  if (CLOSED.has(m.status)) return false;
  return m.dependsOn.some((id) => {
    const dependency = byId.get(id);
    return dependency !== undefined && dependency.status !== 'done' && dependency.due >= m.due;
  });
}

/** Due before `today` (`YYYY-MM-DD`) and still open. */
export function overdue(m: Milestone, today: string): boolean {
  return !CLOSED.has(m.status) && m.due < today;
}

export type TimelineRange = { from: string; to: string; months: number; later: number };

const MIN_MONTHS = 6;
const MAX_MONTHS = 36;

const monthIndex = (ym: string): number => Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1);
export const indexToMonth = (index: number): string => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/**
 * The months the timeline draws: the earliest start or due minus a month, to the latest due plus a month, at
 * least 6 months and at most 36. Beyond 36 the range is clipped and `later` counts the milestones due after it.
 */
export function timelineRange(milestones: readonly Milestone[], today: string): TimelineRange {
  if (milestones.length === 0) {
    const from = monthIndex(today.slice(0, 7));
    return { from: indexToMonth(from), to: indexToMonth(from + MIN_MONTHS - 1), months: MIN_MONTHS, later: 0 };
  }
  const starts = milestones.map((m) => monthIndex((m.start ?? m.due).slice(0, 7)));
  const dues = milestones.map((m) => monthIndex(m.due.slice(0, 7)));
  const from = Math.min(...starts) - 1;
  let to = Math.max(...dues) + 1;
  if (to - from + 1 < MIN_MONTHS) to = from + MIN_MONTHS - 1;
  let later = 0;
  if (to - from + 1 > MAX_MONTHS) {
    to = from + MAX_MONTHS - 1;
    later = dues.filter((d) => d > to).length;
  }
  return { from: indexToMonth(from), to: indexToMonth(to), months: to - from + 1, later };
}

/** A date's horizontal position in the range, 0 to 1, by month and day (clamped to the ends). */
export function positionInRange(date: string, range: TimelineRange): number {
  const month = monthIndex(date.slice(0, 7)) - monthIndex(range.from);
  const day = Number(date.slice(8, 10));
  const daysIn = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const position = (month + (day - 1) / daysIn) / range.months;
  return Math.min(1, Math.max(0, position));
}

export const STATUS_ORDER: readonly Milestone['status'][] = ['in-progress', 'planned', 'done', 'dropped'];

/** The list view's groups: by status in a fixed order, each sorted by due date then title. */
export function groupByStatus(milestones: readonly Milestone[]): { status: Milestone['status']; items: Milestone[] }[] {
  return STATUS_ORDER.map((status) => ({
    status,
    items: milestones.filter((m) => m.status === status).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title)),
  })).filter((g) => g.items.length > 0);
}
