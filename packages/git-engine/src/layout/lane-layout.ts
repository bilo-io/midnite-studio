import type { Commit, GraphEdge, GraphRow } from '@midnite/studio-shared';

import { colorForSha } from './colors';
import { LaneRegistry } from './lane-registry';

/**
 * Straight-lane commit-graph layout.
 *
 * A single forward pass over `git log --topo-order` output. Topo order
 * guarantees every commit is emitted before any of its parents, which is what
 * makes one pass sufficient: by the time a commit comes round, every child that
 * points at it has already been placed and has already claimed a lane for it.
 *
 * Provenance note (docs/INITIAL_PLAN.md → research findings): implemented from
 * pvigier's algorithm writeup, with SourceGit (MIT) and
 * indigane/git-graph-drawing (Unlicense) as reference implementations.
 * mhutchie/vscode-git-graph was deliberately NOT consulted — its licence forbids
 * derivative works.
 *
 * Per commit:
 *   1. Lanes waiting for this sha converge on it. The leftmost becomes the
 *      commit's lane (leftmost, so the mainline drifts left rather than
 *      wandering); the rest close with an upper-half `branch` edge.
 *   2. A commit nothing was waiting for is a branch tip and opens a new lane.
 *   3. The first parent inherits the commit's lane — this is what makes a
 *      branch draw as one straight column instead of a staircase.
 *   4. Every additional parent (a merge) gets a lower-half `merge` edge, either
 *      into the lane already waiting for it or into a freshly opened one.
 *   5. Lanes untouched by the commit pass straight through.
 *
 * Pass-through lanes are a dense `through` column on the row (lane index to colorIdx, -1 for
 * none), not one edge object per lane per row (Phase 77 Theme B). Deliberately still deferred:
 * interval-tree edge culling — `through` makes it moot for pass-throughs.
 */
export class LaneLayoutSession {
  private readonly registry = new LaneRegistry();
  private nextRow = 0;

  /**
   * Lay out the next slice of commits.
   *
   * Stateful across calls by design: the log arrives in batches from a streaming
   * `git log`, and lane state has to carry over or every batch would restart the
   * graph from a blank slate.
   */
  push(commits: readonly Commit[]): GraphRow[] {
    return commits.map((commit) => this.layoutOne(commit));
  }

  /** Total rows laid out so far. */
  get rowCount(): number {
    return this.nextRow;
  }

  private layoutOne(commit: Commit): GraphRow {
    const registry = this.registry;
    const widthBefore = registry.width();

    // 1 — lanes converging on this commit.
    const arriving = registry.findExpecting(commit.sha);
    const [primary, ...converging] = arriving;

    // 2 — a commit nobody was waiting for is a branch tip: open a lane for it.
    // Lanes opened during this row (the commit's own tip lane, fresh merge targets): they did
    // not exist in the band above, so they are not pass-through lanes.
    const opened: number[] = [];
    const lane = primary ?? registry.open(commit.sha);
    if (primary === undefined) opened.push(lane);
    const colorIdx = registry.get(lane)?.colorIdx ?? colorForSha(commit.sha);

    // Bucketed by type and built in the order a final sort would produce, so
    // a row's edges come out already ordered without paying for one.
    const straightEdges: GraphEdge[] = [];
    const branchEdges: GraphEdge[] = [];
    const mergeEdges: GraphEdge[] = [];
    // Freeing is deferred to the end of the row: releasing a slot mid-row lets
    // the same row's merge allocate it, and the closing line then meets the new
    // line at the node, reading as one continuous branch when they're unrelated.
    const toClose: number[] = [];

    // Converging lanes end at the node. `converging` is ascending (it's
    // `arriving` with its smallest element removed), so these already land in
    // their final order.
    for (const index of converging) {
      branchEdges.push({
        fromLane: index,
        toLane: lane,
        type: 'branch',
        colorIdx: registry.get(index)?.colorIdx ?? colorIdx,
      });
      toClose.push(index);
    }

    // 3 — the first parent inherits this lane, keeping the branch a straight column.
    const [firstParent, ...otherParents] = commit.parents;
    const continues = firstParent !== undefined;

    if (firstParent !== undefined) {
      registry.advance(lane, firstParent);
    } else {
      // A root commit: nothing below it in this lane.
      toClose.push(lane);
    }

    // The commit's own lane: which halves of the row does it occupy? `lane`
    // is `primary`, the smallest index in `arriving`, so a branch-type own
    // edge sorts ahead of every `converging` edge above it — it goes at the
    // front rather than appended after them. A straight-type own edge is
    // the only member of `straightEdges` and is pushed in step 5.
    const arrived = primary !== undefined;
    let straightOwnEdge: GraphEdge | null = null;
    if (arrived && continues) {
      straightOwnEdge = { fromLane: lane, toLane: lane, type: 'straight', colorIdx };
    } else if (arrived) {
      branchEdges.unshift({ fromLane: lane, toLane: lane, type: 'branch', colorIdx });
    } else if (continues) {
      mergeEdges.push({ fromLane: lane, toLane: lane, type: 'merge', colorIdx });
    }
    // Neither: a standalone commit with no children and no parents. Node only.

    // 4 — merge edges to the remaining parents. Every one shares `fromLane`
    // with the own-lane merge edge above (both are `lane`), so this group —
    // bounded by parent count, never by lane count — is the only one that
    // still needs an actual sort.
    const seen = new Set<string>(firstParent === undefined ? [] : [firstParent]);
    for (const parent of otherParents) {
      // An octopus merge listing the same parent twice would otherwise open two
      // lanes waiting for one commit, and the second would never close.
      if (seen.has(parent)) continue;
      seen.add(parent);

      const existing = registry.findExpecting(parent);
      const target = existing[0] ?? registry.open(parent);
      if (existing[0] === undefined) opened.push(target);

      mergeEdges.push({
        fromLane: lane,
        toLane: target,
        type: 'merge',
        colorIdx: registry.get(target)?.colorIdx ?? colorForSha(parent),
      });
    }
    if (mergeEdges.length > 1) mergeEdges.sort(compareEdges);

    for (const index of toClose) registry.close(index);
    registry.trim();

    // 5 — lanes this commit never touched, drawn straight through. They leave `edges` for a
    // dense `through` column (Phase 77 Theme B): filling it by index walks the registry in
    // ascending order, which is the order the old pass-through edges were built in pre-sorted, so
    // no sort appears. A lane is a pass-through lane when it is occupied after this row, is not the
    // commit's own lane, and was not opened by this row; converged lanes closed above are holes.
    // The own lane's straight edge (one per row) stays in `edges`.
    const through: number[] = [];
    const width = registry.width();
    for (let index = 0; index < width; index += 1) {
      const slot = registry.get(index);
      through.push(slot === null || index === lane || opened.includes(index) ? -1 : slot.colorIdx);
    }
    while (through.length > 0 && through[through.length - 1] === -1) through.pop();
    if (straightOwnEdge) straightEdges.push(straightOwnEdge);

    const row: GraphRow = {
      row: this.nextRow,
      commit,
      lane,
      colorIdx,
      through,
      edges: straightEdges.concat(branchEdges, mergeEdges),
      laneCount: Math.max(widthBefore, registry.width()),
    };

    this.nextRow += 1;
    return row;
  }
}

/** Straight lanes first (drawn underneath), then by lane, for stable painting. */
const TYPE_ORDER: Record<GraphEdge['type'], number> = { straight: 0, branch: 1, merge: 2 };

const compareEdges = (a: GraphEdge, b: GraphEdge): number =>
  TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.fromLane - b.fromLane || a.toLane - b.toLane;

/** One-shot layout of a complete commit list. */
export function layoutGraph(commits: readonly Commit[]): GraphRow[] {
  return new LaneLayoutSession().push(commits);
}
