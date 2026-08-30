import type { StashEntry } from '@midnite/studio-shared';

import { chunkNulRecords } from './nul-record-chunker';

/**
 * Field separator, matching log-parser.ts: NUL, never whitespace — a stash
 * message is a `git commit` subject line and inherits everything that can go
 * wrong with one.
 */
const FIELD = '\x00';

/**
 * The format `listStashes` asks for, matched field-for-field by
 * `parseStashRecord` — the parser owns the format string, same rule as
 * `LOG_FORMAT`.
 *
 * Order: selector (`stash@{n}`), sha, parents, message, authored date, author
 * name, author email.
 */
export const STASH_FORMAT = '%gd%x00%H%x00%P%x00%gs%x00%at%x00%an%x00%ae';

const FIELD_COUNT = 7;

/** Parse one record of `git stash list -z --format=STASH_FORMAT`. */
export function parseStashRecord(record: string): StashEntry | null {
  if (record.length === 0) return null;

  const fields = record.split(FIELD);
  if (fields.length < FIELD_COUNT) return null;

  const [selector, sha, parents, message, authoredAt, authorName] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    ...string[],
  ];

  // The email is the LAST field — joining the tail keeps a pathological
  // embedded NUL intact rather than truncating at the first one, same
  // reasoning as the subject field in log-parser.ts.
  const authorEmail = fields.slice(FIELD_COUNT - 1).join(FIELD);

  if (!/^[0-9a-f]{40}$/.test(sha)) return null;

  return {
    selector,
    sha,
    // `%P` is space-separated shas, same as LOG_FORMAT's parents field.
    parents: parents.length > 0 ? parents.split(' ') : [],
    message,
    authoredAt: Number.parseInt(authoredAt, 10) || 0,
    author: { name: authorName, email: authorEmail },
  };
}

/**
 * Split a `-z` `git stash list` payload into records and parse each one.
 *
 * Unlike `readLog`, this is never streamed — a repo's stash list is bounded
 * by how much a human can stash by hand — but the framing is identical to
 * `git log`'s (fields and the inter-record separator are the same NUL byte),
 * so it peels records off with the same `chunkNulRecords` walk `chunkRecords`
 * uses, rather than a `split('\x00')` that would silently misparse a message
 * containing an embedded NUL. The trailing remainder is the last record with
 * no trailing NUL (`-z` SEPARATES records rather than terminating them), so
 * it is parsed alongside the rest rather than dropped.
 */
export function parseStashList(payload: string): StashEntry[] {
  if (payload.length === 0) return [];

  const { records, remainder } = chunkNulRecords(payload, FIELD_COUNT);
  return [...records, remainder]
    .map(parseStashRecord)
    .filter((entry): entry is StashEntry => entry !== null);
}
