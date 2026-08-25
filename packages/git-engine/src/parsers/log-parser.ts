import type { Commit } from '@midnite-git/shared';

/**
 * Field separator inside a record. NUL, never whitespace: commit subjects
 * contain literally anything, and author names contain spaces.
 */
const FIELD = '\x00';

/**
 * The pretty format the log command must use, matched field-for-field by
 * `parseLogRecord` below. Exported so the command and the parser can never
 * disagree about field order — the classic way this breaks is someone adding
 * `%ce` to the format and every later field silently shifting by one.
 *
 * Order: sha, parents, author name, author email, author date, committer date,
 * decorations, subject.
 */
export const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s';

const FIELD_COUNT = 8;

/**
 * Parse one record of `git log --pretty=format:LOG_FORMAT -z`.
 *
 * Returns null for a record that doesn't have the expected field count, which
 * in practice means a truncated final chunk mid-stream — the streaming reader
 * keeps such a remainder and retries once more bytes arrive.
 */
export function parseLogRecord(record: string): Commit | null {
  if (record.length === 0) return null;

  const fields = record.split(FIELD);
  if (fields.length < FIELD_COUNT) return null;

  const [sha, parents, authorName, authorEmail, authorDate, committerDate, decorations] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    ...string[],
  ];

  // The subject is the LAST field, and `%s` can itself contain NULs only in
  // pathological cases; joining the tail keeps those intact rather than
  // truncating at the first one.
  const subject = fields.slice(FIELD_COUNT - 1).join(FIELD);

  if (!/^[0-9a-f]{40}$/.test(sha)) return null;

  return {
    sha,
    // `%P` is space-separated shas — the one place splitting on space is safe.
    parents: parents.length > 0 ? parents.split(' ') : [],
    authorName,
    authorEmail,
    authorDate: Number.parseInt(authorDate, 10) || 0,
    committerDate: Number.parseInt(committerDate, 10) || 0,
    subject,
    refs: parseDecorations(decorations),
  };
}

/**
 * Parse `%D` — git's decoration list, e.g.
 *
 *   `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0`
 *
 * Normalised to plain fully-qualified ref names: the `HEAD -> ` prefix and the
 * `tag: ` marker are stripped, and a bare `HEAD` (detached) is kept as-is so the
 * graph can badge the detached position.
 *
 * The command asks for `--decorate=full`, so names arrive fully qualified and
 * `origin/main` (a remote branch) can't be confused with a local branch of the
 * same name.
 */
export function parseDecorations(decorations: string): string[] {
  if (!decorations) return [];

  return decorations
    .split(', ')
    .map((entry) => {
      const trimmed = entry.trim();
      if (trimmed.startsWith('HEAD -> ')) return trimmed.slice('HEAD -> '.length);
      if (trimmed.startsWith('tag: ')) return trimmed.slice('tag: '.length);
      return trimmed;
    })
    .filter((name) => name.length > 0);
}

/**
 * Split a `-z` log payload into whole records and parse each one.
 *
 * The trailing partial record is parsed too: with `--pretty=format:` git
 * SEPARATES records rather than terminating them (verified against real git —
 * two commits produce 15 NULs, not 16), so a complete payload always ends with
 * an unterminated record.
 */
export function parseLog(payload: string): Commit[] {
  const { records, remainder } = chunkRecords(payload);
  return [...records, remainder]
    .map(parseLogRecord)
    .filter((c): c is Commit => c !== null);
}

/**
 * Peel whole records off a chunk, returning the unconsumed tail so a streaming
 * caller can prepend it to the next chunk.
 *
 * A record is the text up to its 8th NUL; that 8th NUL is the separator before
 * the next record and is consumed here.
 *
 * The separator has to be consumed *explicitly* — counting tokens from
 * `split('\x00')` looks equivalent and is not. When a chunk boundary lands
 * exactly between a record's last field and the following separator, the split
 * approach leaves an empty remainder and the next chunk then begins with a
 * leading NUL, producing a phantom empty first field. Every subsequent field
 * shifts by one and the rest of the stream is silently misparsed — a real
 * hazard at 64KB chunk boundaries over tens of thousands of commits, and
 * invisible because the corrupted records fail the sha check and are dropped.
 */
export function chunkRecords(payload: string): { records: string[]; remainder: string } {
  const records: string[] = [];
  let start = 0;

  for (;;) {
    // Walk forward to the FIELD_COUNT-th NUL at or after `start`.
    let cursor = start;
    let found = -1;
    for (let n = 0; n < FIELD_COUNT; n += 1) {
      const next = payload.indexOf(FIELD, cursor);
      if (next < 0) {
        found = -1;
        break;
      }
      cursor = next + 1;
      found = next;
    }

    if (found < 0) break;

    records.push(payload.slice(start, found));
    start = found + 1;
  }

  return { records, remainder: payload.slice(start) };
}
