/**
 * Peel whole NUL-delimited records off a `-z --pretty=format:...`-style
 * payload, returning the unconsumed tail so a streaming caller can prepend it
 * to the next chunk.
 *
 * Shared by every reader built on this framing (`git log`, `git stash list`):
 * the fields *inside* a record and the separator *between* records are the
 * SAME byte, so a record is defined as "the text up to its `fieldCount`-th
 * NUL" — that NUL is the separator before the next record and is consumed
 * here.
 *
 * The separator has to be consumed *explicitly* — counting tokens from
 * `payload.split('\x00')` looks equivalent and is not. When a chunk boundary
 * lands exactly between a record's last field and the following separator,
 * the split approach leaves an empty remainder and the next chunk then begins
 * with a leading NUL, producing a phantom empty first field. Every subsequent
 * field shifts by one and the rest of the stream is silently misparsed — a
 * real hazard at 64KB chunk boundaries over tens of thousands of records, and
 * invisible because the corrupted records fail their own shape check and are
 * dropped. See `log-parser.test.ts`'s `chunkRecords` suite for the case this
 * guards, verified against real git.
 */
export function chunkNulRecords(
  payload: string,
  fieldCount: number,
): { records: string[]; remainder: string } {
  const records: string[] = [];
  let start = 0;

  for (;;) {
    // Walk forward to the fieldCount-th NUL at or after `start`.
    let cursor = start;
    let found = -1;
    for (let n = 0; n < fieldCount; n += 1) {
      const next = payload.indexOf('\x00', cursor);
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
