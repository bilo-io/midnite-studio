import type { Commit, GraphEdge, GraphRow } from '@midnite-git/shared';

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
 * Deliberately deferred: interval-tree edge culling. On very large repos the
 * naive path re-emits pass-through edges for every lane on every row, which
 * profiles as the bottleneck past a few thousand visible lanes. Virtualisation
 * already caps how many rows exist at once, so this only matters if a real repo
 * shows it — see todo/outstanding.md.
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
    const before = registry.snapshot();
    const widthBefore = registry.width();

    // 1 — lanes converging on this commit.
    const arriving = registry.findExpecting(commit.sha);
    const [primary, ...converging] = arriving;

    // 2 — a commit nobody was waiting for is a branch tip: open a lane for it.
    const lane = primary ?? registry.open(commit.sha);
    const colorIdx = registry.get(lane)?.colorIdx ?? colorForSha(commit.sha);

    const edges: GraphEdge[] = [];
    // Freeing is deferred to the end of the row: releasing a slot mid-row lets
    // the same row's merge allocate it, and the closing line then meets the new
    // line at the node, reading as one continuous branch when they're unrelated.
    const toClose: number[] = [];

    // Converging lanes end at the node.
    for (const index of converging) {
      edges.push({
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

    // The commit's own lane: which halves of the row does it occupy?
    const arrived = primary !== undefined;
    if (arrived && continues) {
      edges.push({ fromLane: lane, toLane: lane, type: 'straight', colorIdx });
    } else if (arrived) {
      edges.push({ fromLane: lane, toLane: lane, type: 'branch', colorIdx });
    } else if (continues) {
      edges.push({ fromLane: lane, toLane: lane, type: 'merge', colorIdx });
    }
    // Neither: a standalone commit with no children and no parents. Node only.

    // 4 — merge edges to the remaining parents.
    const seen = new Set<string>(firstParent === undefined ? [] : [firstParent]);
    for (const parent of otherParents) {
      // An octopus merge listing the same parent twice would otherwise open two
      // lanes waiting for one commit, and the second would never close.
      if (seen.has(parent)) continue;
      seen.add(parent);

      const existing = registry.findExpecting(parent);
      const target = existing[0] ?? registry.open(parent);

      edges.push({
        fromLane: lane,
        toLane: target,
        type: 'merge',
        colorIdx: registry.get(target)?.colorIdx ?? colorForSha(parent),
      });
    }

    for (const index of toClose) registry.close(index);
    registry.trim();

    // 5 — lanes this commit never touched, drawn straight through.
    const after = registry.snapshot();
    for (const index of before) {
      if (index === lane) continue;
      if (!after.has(index)) continue; // converged and closed above
      if (edges.some((e) => e.type === 'straight' && e.fromLane === index)) continue;
      edges.push({
        fromLane: index,
        toLane: index,
        type: 'straight',
        colorIdx: registry.get(index)?.colorIdx ?? 0,
      });
    }

    const row: GraphRow = {
      row: this.nextRow,
      commit,
      lane,
      colorIdx,
      // Sorted so the renderer draws in a deterministic order — otherwise two
      // runs can paint overlapping edges in a different z-order and snapshot
      // tests flap.
      edges: edges.sort(compareEdges),
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
