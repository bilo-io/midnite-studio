# Phase 5 — Commit graph, read-only (virtualized SVG)

The centerpiece: full `--all` graph with colored lanes and ref badges, virtualized to 100k commits.

## Deliverables

- [ ] `desktop/src/main/log-service.ts` — streaming: `git log --all --topo-order -z`, parse + lane-layout incrementally in main, emit `mgit:log:batch {requestId, rows}` (~500 rows/batch) then `mgit:log:done`; cancellation via requestId map; initial cap `-n 50000` + "load more"
- [ ] `app/src/features/graph/graph-store.ts` — per-repo Zustand store (`rows`, `loading`, `requestId`); stale-requestId batches discarded
- [ ] `app/src/features/graph/use-graph-stream.ts` — start/cancel + batch reducer
- [ ] `app/src/features/graph/{graph-view.tsx,graph-row.tsx,graph-svg.tsx}` — `@tanstack/react-virtual` list; fixed-height per-row `<svg>` drawing node + edges from `GraphRow.edges`; subject/author/date columns
- [ ] `app/src/features/graph/ref-badge.tsx` — branch/tag/HEAD badges joined by sha from the `refs` query
- [ ] `app/src/features/commit/commit-detail.tsx` — detail pane stub via `mgit:commit:detail` (`git show --stat`) + `git-engine/src/commands/show.ts`

## Verification

- [ ] Unit tests for the stream reducer (stale requestId discard, batch append order)
- [ ] `~/Dev/midnite`'s full history loads and scrolls at 60fps
- [ ] Lane topology visually matches `git log --graph --oneline --all` on a couple of repos
- [ ] Switching repos mid-stream never mixes rows
- [ ] Screenshot captured
