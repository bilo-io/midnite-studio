/**
 * When each turn was said — the Phase 79 follow-up's third fix.
 *
 * The user asked for "timestamps on the right to indicate when each message
 * was sent". `CompanionTurn.at` has carried epoch milliseconds since Theme A;
 * nothing rendered it.
 *
 * Pure functions in their own module rather than helpers inside
 * `companion-thread.tsx`, for the one reason that matters here: every one of
 * them is a *clock* decision — what counts as today, what a day boundary is,
 * how a time reads in the user's locale — and a clock decision is only
 * testable if the clock is an argument. `now` is therefore always passed in,
 * never read from `Date.now()` inside, and `turn-time.test.ts` pins it.
 *
 * Locale is deliberately left to the platform (`undefined` locale, so
 * `toLocaleTimeString` uses the user's own). The app does not carry a locale
 * preference and inventing one here would make a Sunday-first reader read
 * Monday-first times.
 */

/** Options every formatter here takes, so a test can pin both axes. */
export type TurnClock = {
  /** "Now", in epoch milliseconds — what `Today` and `Yesterday` are relative to. */
  now: number;
  /**
   * BCP-47 tag, or `undefined` for the platform's own.
   *
   * Only the tests pass this. Production passes nothing, because the whole
   * point of `toLocale*String` is that the platform already knows.
   */
  locale?: string | undefined;
};

/** Midnight-local for an instant, as epoch ms — the only thing "same day" can mean. */
function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * `14:32` — the short time shown against every bubble.
 *
 * `hour`/`minute` only, with `hour12` left to the locale: a 12-hour reader
 * gets `2:32 PM` and a 24-hour reader `14:32`, and forcing either would be
 * this app deciding something the OS already decided. Seconds are omitted
 * because a chat log is not a trace — the exact instant is one hover away in
 * {@link formatTurnTitle}.
 */
export function formatTurnTime(at: number, locale?: string | undefined): string {
  if (!Number.isFinite(at)) return '';
  return new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The whole instant, for the `title` tooltip.
 *
 * Where the seconds and the date live. A bubble showing `14:32` two days into
 * a transcript is ambiguous by design — the day separator above it resolves
 * that while scrolling, and this resolves it on hover without one.
 */
export function formatTurnTitle(at: number, locale?: string | undefined): string {
  if (!Number.isFinite(at)) return '';
  return new Date(at).toLocaleString(locale, {
    dateStyle: 'full',
    timeStyle: 'medium',
  });
}

/**
 * `Today`, `Yesterday`, or the date — the separator's own label.
 *
 * Named days for the two a person actually thinks in, and a plain date beyond
 * them: "Wednesday" for something eight days old is worse than useless,
 * because it reads as *this* Wednesday. The weekday is kept alongside the date
 * inside a week, which is the window where it disambiguates rather than
 * misleads.
 */
export function daySeparatorLabel(at: number, clock: TurnClock): string {
  const { now, locale } = clock;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) {
    return new Date(at).toLocaleDateString(locale, { weekday: 'long' });
  }
  return new Date(at).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Whether a separator belongs above this turn.
 *
 * `true` for the very first turn as well as for a genuine crossing, which is
 * the honest answer to "what day is this transcript's first message from?" —
 * a persisted transcript (200 turns, `COMPANION_TRANSCRIPT_CAP`) survives
 * relaunches, so the top of the thread is routinely from another day.
 *
 * Compared on local midnight rather than on elapsed time: two turns
 * fourteen hours apart can be the same day or two days apart depending on
 * where they fall, and a `> 24h` test gets both cases wrong.
 */
export function startsNewDay(at: number, previousAt: number | undefined): boolean {
  if (previousAt === undefined) return true;
  if (!Number.isFinite(at) || !Number.isFinite(previousAt)) return false;
  return startOfDay(at) !== startOfDay(previousAt);
}
