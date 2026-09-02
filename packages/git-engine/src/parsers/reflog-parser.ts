import type { ReflogAction, ReflogEntry } from '@midnite/studio-shared';

import { chunkNulRecords } from './nul-record-chunker';

const FIELD = '\x00';

/**
 * The format `readReflog` asks for, matched field-for-field by
 * `parseReflogRecord` — the parser owns the format string, same rule as
 * `STASH_FORMAT`.
 *
 * Order: short selector, full selector, sha, subject, author identity.
 * `readReflog` MUST pass `--date=unix` alongside this format: `%gd`/`%gD`
 * only carry a timestamp at all when a `--date=` is in effect, and unix is
 * the one form this parser round-trips without a locale-dependent format to
 * fight. There is no reflog-entry-timestamp placeholder otherwise — see
 * `ReflogEntrySchema`'s own doc for why `%at`/`%ct` are the wrong field.
 */
export const REFLOG_FORMAT = '%gd%x00%gD%x00%H%x00%gs%x00%gn';

const FIELD_COUNT = 5;

/**
 * `HEAD@{1788383371}` → `1788383371`.
 *
 * Indistinguishable, by shape alone, from git's DEFAULT numeric index form
 * (`HEAD@{0}`) when no `--date=` was requested — both are just digits inside
 * `@{...}`. `readReflog` always passes `--date=unix`, so in practice this
 * reads a real unix second count every time; a caller that skips `--date=`
 * would silently get an index misread as a timestamp, which is exactly why
 * `readReflog` is the one place this module means to be called from.
 */
function parseEmbeddedTimestamp(selector: string): number | null {
  const match = /@\{(\d+)\}$/.exec(selector);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

const ACTION_RULES: [RegExp, ReflogAction][] = [
  [/^commit \(amend\)/i, 'amend'],
  [/^commit/i, 'commit'],
  [/^checkout/i, 'checkout'],
  [/^reset/i, 'reset'],
  [/^merge/i, 'merge'],
  [/^rebase/i, 'rebase'],
  [/^cherry-pick/i, 'cherryPick'],
  [/^revert/i, 'revert'],
  [/^pull/i, 'pull'],
  [/^branch/i, 'branch'],
];

/**
 * Best-effort classification of `%gs` — never authoritative. A subject this
 * does not recognise (a future git version, a custom reflog writer) falls
 * through to `'other'` rather than guessing, per the phase doc's "must
 * degrade to a plain row, never a wrong verb."
 */
export function parseReflogAction(subject: string): ReflogAction {
  for (const [pattern, action] of ACTION_RULES) {
    if (pattern.test(subject)) return action;
  }
  return 'other';
}

/**
 * Parse one record of `git reflog show --date=unix -z --format=REFLOG_FORMAT`.
 *
 * `oldSha` is never set here — a single record carries no information about
 * the entry before it. `parseReflogList` fills it in once it has every
 * record in the page, by pairing each with the next OLDER one.
 */
export function parseReflogRecord(record: string): Omit<ReflogEntry, 'oldSha'> | null {
  if (record.length === 0) return null;

  const fields = record.split(FIELD);
  if (fields.length < FIELD_COUNT) return null;

  const [selector, fullSelector, sha, subject] = fields as [string, string, string, string, ...string[]];
  // The author identity is the LAST field — joining the tail keeps a
  // pathological embedded NUL intact rather than truncating at the first
  // one, same reasoning as `stash-parser.ts`'s author email.
  const author = fields.slice(FIELD_COUNT - 1).join(FIELD);

  if (!/^[0-9a-f]{40}$/.test(sha)) return null;

  const at = parseEmbeddedTimestamp(selector);
  if (at === null) return null;

  return {
    selector,
    fullSelector,
    sha,
    subject,
    action: parseReflogAction(subject),
    at,
    author,
  };
}

/**
 * Split a `-z` `git reflog show` payload into records, parse each, and pair
 * every entry with the one immediately after it in the list (reflog order is
 * newest-first, so that neighbour is the state the entry moved FROM). The
 * last record in whatever payload is passed in therefore always has
 * `oldSha: null` — `readReflog` fetches one extra record past its own
 * `limit` specifically so the last entry it RETURNS still has a real one.
 */
export function parseReflogList(payload: string): ReflogEntry[] {
  if (payload.length === 0) return [];

  const { records, remainder } = chunkNulRecords(payload, FIELD_COUNT);
  const parsed = [...records, remainder]
    .map(parseReflogRecord)
    .filter((entry): entry is Omit<ReflogEntry, 'oldSha'> => entry !== null);

  return parsed.map((entry, index) => ({
    ...entry,
    oldSha: parsed[index + 1]?.sha ?? null,
  }));
}
