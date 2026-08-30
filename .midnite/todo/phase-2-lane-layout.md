# Phase 2 — Lane layout engine

`layoutGraph(commits) → GraphRow[]`, incremental, pure TS, unit-tested.

**Licensing guardrail:** implement from pvigier's algorithm writeup + SourceGit (MIT) +
indigane/git-graph-drawing (Unlicense) as references. **Never read or copy
mhutchie/vscode-git-graph** — its license forbids derivatives.

## Deliverables

- [x] `git-engine/src/layout/lane-layout.ts` — single forward pass over `--topo-order` commits; straight-branch lane assignment with lane recycling (freed lanes → nil slots, reused)
- [x] `git-engine/src/layout/lane-registry.ts` — active-lane bookkeeping
- [x] `git-engine/src/layout/colors.ts` — `colorIdx = hash(originating branch tip sha) % palette` recorded when a lane opens (stable across refreshes)
- [x] `LaneLayoutSession` class with `push(commits: Commit[]): GraphRow[]` so main can stream batches without re-laying-out
- [x] Code note: interval-tree edge culling deliberately deferred (see outstanding.md)
- [x] Extend `smoke.ts` with an ASCII lane rendering

## Verification

- [x] Unit tests: linear history, single merge, octopus merge, criss-cross, orphan branches
- [x] Invariant test: no two active lanes ever share an index
- [x] Snapshot tests of small synthetic DAGs
- [x] ASCII rendering of a real repo visually matches `git log --graph --oneline --all`

## Findings while landing this phase

- **Edge types now carry which half of the row they occupy**, not just their lane endpoints:
  `straight` = full height, `branch` = upper half ending at the node, `merge` = lower half leaving
  the node. Without that the renderer has to infer geometry from lane indices and gets branch tips
  and root commits wrong — both need exactly one half drawn.
- **"No two lanes share a column" is not "no two edges share an index."** A `merge` edge landing
  on a lane that also passes straight through is a *join* — the ordinary picture of a branch line
  meeting the mainline. The invariant test asserts uniqueness per channel (one straight per lane,
  one branch per source, one merge per target) and that a lane never both passes through and
  terminates.
- **Lane frees are deferred to the end of the row.** Releasing a slot mid-row lets the same row's
  merge re-allocate it, and the closing line then meets the new line at the node — reading as one
  continuous branch when the two are unrelated.
- **Duplicate parents are guarded.** An octopus merge listing a parent twice would open two lanes
  waiting for one commit, and the second could never close.
- Verified against reality, not just against itself: `smoke.ts` prints our ASCII lanes beside
  `git log --graph --oneline --all` for the same commits. On ~/Dev/midnite (2000 rows, 7 lanes at
  the widest) the two agree row for row, convergence lines included.
