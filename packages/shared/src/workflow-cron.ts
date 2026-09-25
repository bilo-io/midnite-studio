/**
 * A tiny 5-field cron parser and "next fire time" calculator (Phase 97 Theme H).
 *
 * `shared/package.json` carries zod only — no `node-cron`/`cron-parser` — so this is
 * hand-rolled rather than a new dependency, per the phase doc's own instruction to
 * prefer a small tested parser over adding one. It covers the standard vixie-cron
 * subset any of these fields needs: `*`, `*` with `/step`, `a-b`, `a-b/step`, and comma lists
 * of any of those, over five whitespace-separated fields — minute, hour,
 * day-of-month, month, day-of-week.
 *
 * **Timezone**: this operates on the *host's local wall clock* (native `Date`
 * get/set), the same as any other "run this at 9am" desktop scheduler would — there
 * is no per-workflow timezone field in {@link WorkflowTriggerConfigSchema}. DST
 * transitions and month-length rollovers fall out of `Date`'s own local calendar
 * arithmetic for free (see {@link nextCronFireTimes}'s stepping algorithm).
 */

const CRON_FIELD_COUNT = 5;

export type CronField = { kind: 'every' } | { kind: 'set'; values: ReadonlySet<number> };

export type CronSchedule = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

const FIELD_BOUNDS = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
} as const;

type FieldName = keyof typeof FIELD_BOUNDS;

/** One comma-separated segment: `a-b`, `a-b/step`, a bare `a`, `*`, or `*` with `/step`. */
function parseSegment(segment: string, [min, max]: readonly [number, number]): number[] | null {
  const stepMatch = segment.match(/^(.+)\/(\d+)$/);
  const base = stepMatch ? stepMatch[1]! : segment;
  const step = stepMatch ? Number.parseInt(stepMatch[2]!, 10) : 1;
  if (step <= 0 || !Number.isInteger(step)) return null;

  let lo: number;
  let hi: number;
  if (base === '*') {
    lo = min;
    hi = max;
  } else {
    const rangeMatch = base.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      lo = Number.parseInt(rangeMatch[1]!, 10);
      hi = Number.parseInt(rangeMatch[2]!, 10);
    } else if (/^\d+$/.test(base)) {
      lo = Number.parseInt(base, 10);
      hi = lo;
    } else {
      return null;
    }
  }
  if (lo > hi || lo < min || hi > max) return null;

  const values: number[] = [];
  for (let v = lo; v <= hi; v += step) values.push(v);
  return values;
}

function parseField(raw: string, name: FieldName): CronField | null {
  const trimmed = raw.trim();
  if (trimmed === '*') return { kind: 'every' };

  const values = new Set<number>();
  for (const part of trimmed.split(',')) {
    if (part.trim() === '') return null;
    const parsed = parseSegment(part.trim(), FIELD_BOUNDS[name]);
    if (parsed === null) return null;
    for (const v of parsed) values.add(v);
  }
  if (values.size === 0) return null;
  return { kind: 'set', values };
}

/** `null` on anything that isn't exactly five valid fields. */
export function parseCronExpression(cron: string): CronSchedule | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== CRON_FIELD_COUNT) return null;

  const minute = parseField(fields[0]!, 'minute');
  const hour = parseField(fields[1]!, 'hour');
  const dayOfMonth = parseField(fields[2]!, 'dayOfMonth');
  const month = parseField(fields[3]!, 'month');
  const dayOfWeek = parseField(fields[4]!, 'dayOfWeek');
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function isValidCronExpression(cron: string): boolean {
  return parseCronExpression(cron) !== null;
}

function fieldMatches(field: CronField, value: number): boolean {
  return field.kind === 'every' || field.values.has(value);
}

/**
 * POSIX cron's day rule: when EITHER day-of-month or day-of-week is restricted
 * (not `*`), while the other is also restricted, a day matches if either one
 * does (OR) — not both (AND). When only one is restricted, that one alone decides.
 */
function dayMatches(schedule: CronSchedule, dayOfMonth: number, dayOfWeek: number): boolean {
  const domRestricted = schedule.dayOfMonth.kind === 'set';
  const dowRestricted = schedule.dayOfWeek.kind === 'set';
  if (domRestricted && dowRestricted) {
    return fieldMatches(schedule.dayOfMonth, dayOfMonth) || fieldMatches(schedule.dayOfWeek, dayOfWeek);
  }
  if (domRestricted) return fieldMatches(schedule.dayOfMonth, dayOfMonth);
  if (dowRestricted) return fieldMatches(schedule.dayOfWeek, dayOfWeek);
  return true;
}

/**
 * A hard ceiling on how far into the future this searches before giving up —
 * an impossible schedule (`0 0 30 2 *`, February 30th) must terminate rather than
 * loop forever. Five years comfortably covers every real cron a workflow would use.
 */
const MAX_SEARCH_YEARS = 5;

/**
 * The next `count` times `cron` fires strictly after `from`, as epoch milliseconds —
 * pure, and what the trigger form's "next 3 fire times" preview calls directly.
 *
 * Stepping is calendar-aware rather than a minute-by-minute scan: a month
 * mismatch jumps to the 1st of the next month, a day mismatch jumps to
 * midnight the next day, an hour mismatch jumps to the top of the next hour —
 * so an impossible combination (Feb 30th) exhausts the search bound in dozens
 * of jumps, not millions of per-minute checks. Every jump is a native `Date`
 * local set — `setMonth`/`setDate`/`setHours` all normalise overflow and
 * DST-shift correctly on their own, which is what makes month rollover and DST
 * transitions fall out of this for free rather than needing special-casing.
 */
export function nextCronFireTimes(cron: string, from: number | Date, count: number): number[] {
  const schedule = parseCronExpression(cron);
  if (!schedule) return [];
  if (count <= 0) return [];

  const fromDate = typeof from === 'number' ? new Date(from) : new Date(from.getTime());
  const searchLimit = fromDate.getFullYear() + MAX_SEARCH_YEARS;

  const candidate = new Date(fromDate.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const results: number[] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 200_000;

  while (results.length < count && iterations < MAX_ITERATIONS) {
    iterations += 1;
    if (candidate.getFullYear() > searchLimit) break;

    if (!fieldMatches(schedule.month, candidate.getMonth() + 1)) {
      candidate.setMonth(candidate.getMonth() + 1, 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(schedule, candidate.getDate(), candidate.getDay())) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }
    if (!fieldMatches(schedule.hour, candidate.getHours())) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!fieldMatches(schedule.minute, candidate.getMinutes())) {
      candidate.setMinutes(candidate.getMinutes() + 1);
      continue;
    }

    results.push(candidate.getTime());
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return results;
}
