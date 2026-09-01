import { colorForSha } from './colors';

/**
 * One occupied lane: the commit it is waiting for, and the colour it was born
 * with.
 *
 * "Expected" is the whole model. A lane is not "branch X" — git has no such
 * concept in a commit walk — it's a claim that some already-drawn commit has
 * this sha as a parent, so when that sha comes round it belongs in this column.
 */
export type LaneSlot = {
  /** Sha this lane is waiting to draw. */
  expected: string;
  colorIdx: number;
};

/**
 * The active-lane bookkeeping for a layout pass.
 *
 * Lanes are a sparse array: a closed lane leaves a `null` hole rather than
 * shifting everything left, because shifting would move every branch's column
 * the moment an unrelated branch ends — the graph would visibly slide sideways
 * as you scroll. Holes are refilled left-first, which keeps the graph narrow
 * without ever moving a live lane.
 */
export class LaneRegistry {
  private lanes: (LaneSlot | null)[] = [];

  /**
   * Indices currently occupied, ascending.
   *
   * `lane-layout.ts` relies on this order (via `snapshot()`) to build its
   * pass-through edges pre-sorted rather than sorting them — changing the
   * iteration order here would silently reorder a row's painted edges.
   */
  occupied(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.lanes.length; i += 1) {
      if (this.lanes[i]) result.push(i);
    }
    return result;
  }

  get(index: number): LaneSlot | null {
    return this.lanes[index] ?? null;
  }

  /**
   * Lanes waiting for `sha`, ascending. Several means several children.
   *
   * `lane-layout.ts` relies on ascending order here too: it takes the first
   * result as `primary` (guaranteed the smallest) to decide where the own-lane
   * edge sorts relative to the rest.
   */
  findExpecting(sha: string): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.lanes.length; i += 1) {
      if (this.lanes[i]?.expected === sha) result.push(i);
    }
    return result;
  }

  /**
   * Claim the leftmost free slot for `sha`, appending a column only when every
   * existing one is busy.
   */
  open(sha: string, colorIdx = colorForSha(sha)): number {
    const slot: LaneSlot = { expected: sha, colorIdx };

    for (let i = 0; i < this.lanes.length; i += 1) {
      if (!this.lanes[i]) {
        this.lanes[i] = slot;
        return i;
      }
    }

    this.lanes.push(slot);
    return this.lanes.length - 1;
  }

  /** Point an existing lane at its next commit, keeping its colour. */
  advance(index: number, sha: string): void {
    const lane = this.lanes[index];
    if (lane) lane.expected = sha;
  }

  close(index: number): void {
    this.lanes[index] = null;
  }

  /**
   * Drop trailing holes so `width()` reflects the graph's real extent.
   *
   * Without this the gutter stays as wide as the widest point in history for
   * every row below it — scroll past a busy merge on a big repo and the commit
   * subjects stay indented behind 30 columns of empty space.
   */
  trim(): void {
    while (this.lanes.length > 0 && !this.lanes[this.lanes.length - 1]) this.lanes.pop();
  }

  /** Number of columns currently spanned, holes included. */
  width(): number {
    return this.lanes.length;
  }

  /** Snapshot of which indices are occupied — used to diff before/after a row. */
  snapshot(): Set<number> {
    return new Set(this.occupied());
  }
}
