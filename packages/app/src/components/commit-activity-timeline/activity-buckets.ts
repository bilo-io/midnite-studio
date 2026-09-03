/**
 * The timeline's bucketing, as pure functions — the `metric-path.ts` split:
 * arithmetic that can be wrong lives where it is testable without mounting
 * anything, and the component stays a thin renderer over the result.
 */

/** One commit, as the timeline consumes it. */
export interface CommitActivity {
  sha: string;
  /** Unix epoch **seconds**, as git's `%at` gives it. */
  timestamp: number;
  additions: number;
  deletions: number;
}

/** `day` = the last 24 hours, `week` = the last 7 days, `month` = the last 30. */
export type ActivityTimeframe = 'day' | 'week' | 'month';

/** Bucket count per timeframe: hours for a day, days otherwise. */
export const TIMEFRAME_BUCKETS: Record<ActivityTimeframe, number> = {
  day: 24,
  week: 7,
  month: 30,
};

export interface ActivityBucket {
  /** Unix **milliseconds** the bucket opens. */
  start: number;
  count: number;
  additions: number;
  deletions: number;
}

const HOUR_MS = 3_600_000;

/**
 * Fold commits into time buckets, oldest first, **including empty buckets** —
 * the gaps are the information, same rule as the dashboard calendar.
 *
 * Day buckets are aligned to **local midnight** via the `Date` constructor, so
 * "yesterday" is the reader's yesterday and a 23-hour DST day cannot be
 * miscounted. Hour buckets are aligned to the epoch hour instead: a rolling
 * 24-hour view has no "day in the life" semantics to protect, and epoch
 * alignment keeps the maths free of the half-hour timezones.
 *
 * Commits outside the window (or in the future) are dropped, not clamped —
 * a clamped commit would light a bucket for a time it did not happen in.
 */
export function bucketCommits(
  commits: readonly CommitActivity[],
  timeframe: ActivityTimeframe,
  nowMs: number = Date.now(),
): ActivityBucket[] {
  const { starts, end } = bucketBounds(timeframe, nowMs);
  const buckets: ActivityBucket[] = starts.map((start) => ({
    start,
    count: 0,
    additions: 0,
    deletions: 0,
  }));

  for (const commit of commits) {
    const at = commit.timestamp * 1000;
    if (at < starts[0]! || at >= end) continue;
    const bucket = buckets[bucketIndex(starts, at)]!;
    bucket.count += 1;
    bucket.additions += commit.additions;
    bucket.deletions += commit.deletions;
  }

  return buckets;
}

/** Bucket opening times (ascending) and the exclusive end of the last one. */
function bucketBounds(timeframe: ActivityTimeframe, nowMs: number): { starts: number[]; end: number } {
  const count = TIMEFRAME_BUCKETS[timeframe];

  if (timeframe === 'day') {
    const lastStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
    return {
      starts: Array.from({ length: count }, (_, i) => lastStart - (count - 1 - i) * HOUR_MS),
      end: lastStart + HOUR_MS,
    };
  }

  const now = new Date(nowMs);
  const [year, month, date] = [now.getFullYear(), now.getMonth(), now.getDate()];
  return {
    // Local-midnight arithmetic through the constructor, not `± 86_400_000`:
    // the constructor normalises across month ends and DST for us.
    starts: Array.from({ length: count }, (_, i) =>
      new Date(year, month, date - (count - 1 - i)).getTime(),
    ),
    end: new Date(year, month, date + 1).getTime(),
  };
}

/** Index of the last start ≤ `at`. Binary, because month × 5,000 commits is a loop. */
function bucketIndex(starts: readonly number[], at: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid]! <= at) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * How dense the time-axis rules are, per timeframe — the reader's own words for
 * it, so the gridline toggle's tooltip can say what turning it on will draw.
 */
export const GRIDLINE_CADENCE: Record<ActivityTimeframe, string> = {
  day: 'every 2 hours',
  week: 'every day',
  month: 'every week',
};

/** Local weekday a month's week-rules land on. Monday, as the ISO week opens. */
const WEEK_RULE_DAY = 1;

/**
 * Indices of the buckets whose **leading edge** gets a rule, at the cadence
 * `GRIDLINE_CADENCE` names.
 *
 * Derived from each bucket's own `start` rather than from `index % n`, for two
 * reasons — one about phase and one about arithmetic.
 *
 * *Phase*: a day window is a rolling 24 hours, so `index % 2` rules whichever
 * parity index 0 happens to be — odd local hours half the time. "Every 2 hours"
 * has to mean the even ones, or the rules move under the reader every hour.
 * (In a half-hour timezone every rule sits at `HH:30` either way; epoch-hour
 * bucket starts cannot land on a clock hour there, and that is fine — what
 * matters is that consecutive runs agree.) Same story for a month, whose
 * Mondays are 7 apart at an offset that depends on the day the window opened.
 *
 * *Arithmetic*: across a DST transition a local hour repeats or vanishes, so
 * the local-hour sequence is no longer `index + k`. `index % 2` would keep
 * ruling every other bucket straight through a fall-back's doubled hour;
 * reading `getHours()` puts the rules back on the clock the reader sees.
 *
 * Index 0 never gets one: it is the axis's own edge, already drawn by the
 * panel's border, and a rule flush against it reads as a rendering seam.
 */
export function gridlineIndices(
  buckets: readonly ActivityBucket[],
  timeframe: ActivityTimeframe,
): number[] {
  const marks: number[] = [];
  for (let i = 1; i < buckets.length; i += 1) {
    const at = new Date(buckets[i]!.start);
    const ruled =
      timeframe === 'day'
        ? at.getHours() % 2 === 0
        : timeframe === 'week'
          ? true
          : at.getDay() === WEEK_RULE_DAY;
    if (ruled) marks.push(i);
  }
  return marks;
}

/**
 * The bucket's own span, as the hover tooltip's heading.
 *
 * An hour bucket needs the clock range (and the date, since a rolling 24-hour
 * window straddles midnight); a day bucket needs the weekday, which is the part
 * a reader actually navigates by. Locale-formatted through `undefined`, like
 * every other date in the renderer.
 */
export function bucketLabel(bucket: ActivityBucket, timeframe: ActivityTimeframe): string {
  const at = new Date(bucket.start);
  if (timeframe !== 'day') {
    return at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const clock = (date: Date): string =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${date}, ${clock(at)}–${clock(new Date(bucket.start + HOUR_MS))}`;
}
