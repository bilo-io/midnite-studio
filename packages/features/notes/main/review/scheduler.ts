import type { ReviewGrade } from '@midnite/studio-shared';

/**
 * SM-2 flavoured scheduling for review cards (Phase 113 Theme M).
 *
 * Pure: `now` is injected, nothing reads the clock. A card is `ease`
 * (starts 2.5, floor 1.3), `intervalDays` and `reps` (consecutive passes), plus a
 * `lapses` count and the epoch-ms it is `due`. Grades:
 *
 * - again: back to the start, due in {@link AGAIN_MS}; ease -0.2; a lapse.
 * - hard:  interval x1.2 (at least 1 day), ease -0.15; still a pass.
 * - good:  1 day, then 6 days, then interval x ease.
 * - easy:  4 days on the first pass, then interval x ease x 1.3; ease +0.15.
 */
export type CardState = {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  due: number;
  lastReviewed: number;
};

export const DAY_MS = 86_400_000;
export const AGAIN_MS = 10 * 60_000;
export const START_EASE = 2.5;
export const MIN_EASE = 1.3;

const clampEase = (ease: number): number => Math.max(MIN_EASE, Math.round(ease * 100) / 100);

export function schedule(prev: CardState | undefined, grade: ReviewGrade, now: number): CardState {
  const ease = prev?.ease ?? START_EASE;
  const interval = prev?.intervalDays ?? 0;
  const reps = prev?.reps ?? 0;
  const lapses = prev?.lapses ?? 0;
  const done = (e: number, days: number, r: number, l: number, dueAt: number): CardState => ({
    ease: clampEase(e),
    intervalDays: days,
    reps: r,
    lapses: l,
    due: dueAt,
    lastReviewed: now,
  });

  switch (grade) {
    case 'again':
      return done(ease - 0.2, 0, 0, lapses + 1, now + AGAIN_MS);
    case 'hard': {
      const days = Math.max(1, Math.round(Math.max(interval, 1) * 1.2));
      return done(ease - 0.15, days, reps + 1, lapses, now + days * DAY_MS);
    }
    case 'good': {
      const days = reps === 0 ? 1 : reps === 1 ? 6 : Math.max(1, Math.round(interval * ease));
      return done(ease, days, reps + 1, lapses, now + days * DAY_MS);
    }
    case 'easy': {
      const days = reps === 0 ? 4 : Math.max(1, Math.round(interval * ease * 1.3));
      return done(ease + 0.15, days, reps + 1, lapses, now + days * DAY_MS);
    }
  }
}

/** New cards (no state) and cards whose due time has come are due. */
export function isDue(state: CardState | undefined, now: number): boolean {
  return state === undefined || state.due <= now;
}
