# Phase 2 — Lane layout engine

`layoutGraph(commits) → GraphRow[]`, incremental, pure TS, unit-tested.

**Licensing guardrail:** implement from pvigier's algorithm writeup + SourceGit (MIT) +
indigane/git-graph-drawing (Unlicense) as references. **Never read or copy
mhutchie/vscode-git-graph** — its license forbids derivatives.

## Deliverables

- [ ] `git-engine/src/layout/lane-layout.ts` — single forward pass over `--topo-order` commits; straight-branch lane assignment with lane recycling (freed lanes → nil slots, reused)
- [ ] `git-engine/src/layout/lane-registry.ts` — active-lane bookkeeping
- [ ] `git-engine/src/layout/colors.ts` — `colorIdx = hash(originating branch tip sha) % palette` recorded when a lane opens (stable across refreshes)
- [ ] `LaneLayoutSession` class with `push(commits: Commit[]): GraphRow[]` so main can stream batches without re-laying-out
- [ ] Code note: interval-tree edge culling deliberately deferred (see outstanding.md)
- [ ] Extend `smoke.ts` with an ASCII lane rendering

## Verification

- [ ] Unit tests: linear history, single merge, octopus merge, criss-cross, orphan branches
- [ ] Invariant test: no two active lanes ever share an index
- [ ] Snapshot tests of small synthetic DAGs
- [ ] ASCII rendering of a real repo visually matches `git log --graph --oneline --all`
