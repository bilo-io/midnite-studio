import type { HealthMonthLog } from '@midnite/studio-shared';

export type Point = { date: string; value: number };

const DAY_MS = 86_400_000;

const utc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/** Whole days since the epoch for a `YYYY-MM-DD` key (calendar days, DST-free). */
export const dayNumber = (date: string): number => Math.round(utc(date) / DAY_MS);

const byDate = (a: Point, b: Point): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Trailing average over a window of **calendar** days ending at each point (a gap does not stretch the
 * window), emitted only where the window holds at least 3 points.
 */
export function movingAverage(points: Point[], days = 7): Point[] {
  const sorted = [...points].sort(byDate);
  const out: Point[] = [];
  for (const p of sorted) {
    const end = dayNumber(p.date);
    const inWindow = sorted.filter((q) => {
      const n = dayNumber(q.date);
      return n <= end && n > end - days;
    });
    if (inWindow.length >= 3) out.push({ date: p.date, value: inWindow.reduce((a, q) => a + q.value, 0) / inWindow.length });
  }
  return out;
}

/**
 * Least-squares slope over the last `days` calendar days (ending at the latest point), per week; `null`
 * under 4 points.
 */
export function weeklyRate(points: Point[], days = 28): number | null {
  const sorted = [...points].sort(byDate);
  if (sorted.length === 0) return null;
  const last = dayNumber(sorted[sorted.length - 1]!.date);
  const win = sorted.filter((p) => dayNumber(p.date) > last - days);
  if (win.length < 4) return null;
  const xs = win.map((p) => dayNumber(p.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = win.reduce((a, p) => a + p.value, 0) / win.length;
  let num = 0;
  let den = 0;
  win.forEach((p, i) => {
    num += (xs[i]! - mx) * (p.value - my);
    den += (xs[i]! - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}

/** The ISO-8601 week of a date as `YYYY-Www` (weeks start Monday; week 1 holds the year's first Thursday). */
export function isoWeekKey(date: string): string {
  const t = utc(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  const thursday = t - dow * DAY_MS + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The Monday of the ISO week holding `date`. */
export function weekStart(date: string): string {
  const t = utc(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

export type WeeklySummary = { avgKcal: number | null; daysLogged: number; sessions: number; volumeKg: number; weightChangeKg: number | null };

/** What one ISO week held; volume is the sum of reps x kg. */
export function weeklySummary(months: HealthMonthLog[], weekKey: string): WeeklySummary {
  const days = months
    .flatMap((m) => Object.entries(m.days))
    .filter(([date]) => isoWeekKey(date) === weekKey)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const kcalDays = days.filter(([, d]) => d.meals.length > 0).map(([, d]) => d.meals.reduce((a, m) => a + m.kcal, 0));
  const weights = days.filter(([, d]) => d.weightKg !== undefined).map(([, d]) => d.weightKg!);
  return {
    avgKcal: kcalDays.length === 0 ? null : Math.round(kcalDays.reduce((a, b) => a + b, 0) / kcalDays.length),
    daysLogged: kcalDays.length,
    sessions: days.reduce((a, [, d]) => a + d.sessions.length, 0),
    volumeKg: days.reduce((a, [, d]) => a + d.sessions.reduce((b, s) => b + s.exercises.reduce((c, e) => c + e.sets.reduce((v, st) => v + st.reps * st.kg, 0), 0), 0), 0),
    weightChangeKg: weights.length < 2 ? null : Math.round((weights[weights.length - 1]! - weights[0]!) * 100) / 100,
  };
}
