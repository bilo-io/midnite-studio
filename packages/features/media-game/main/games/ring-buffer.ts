import { GAME_LOG_CAPACITY, GAME_LOG_TEXT_MAX, type GameLogEntry } from '@midnite/studio-shared';

export type GameLogInput = Omit<GameLogEntry, 'seq' | 'at'> & { at?: number };

/** Truncate to the entry cap with an ellipsis. */
export function clipLogText(text: string): string {
  return text.length <= GAME_LOG_TEXT_MAX ? text : `${text.slice(0, GAME_LOG_TEXT_MAX - 1)}…`;
}

/**
 * A capped log of one run's console entries. `seq` is monotonic across the
 * run — it keeps counting past evictions — so `entriesSince(cursor)` is a
 * cursor an MCP tool can poll with, not an index into whatever is retained.
 */
export class LogRingBuffer {
  private entries: GameLogEntry[] = [];
  private nextSeq = 1;

  constructor(private readonly capacity: number = GAME_LOG_CAPACITY) {}

  push(input: GameLogInput, now: number = Date.now()): GameLogEntry {
    const entry: GameLogEntry = { ...input, text: clipLogText(input.text), seq: this.nextSeq++, at: input.at ?? now };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    return entry;
  }

  /** Entries with `seq` greater than `since` (all retained entries when omitted). */
  entriesSince(since = 0): GameLogEntry[] {
    return this.entries.filter((entry) => entry.seq > since);
  }

  get size(): number {
    return this.entries.length;
  }

  /** The newest `seq` handed out, or 0 when nothing was ever pushed. */
  get lastSeq(): number {
    return this.nextSeq - 1;
  }
}
