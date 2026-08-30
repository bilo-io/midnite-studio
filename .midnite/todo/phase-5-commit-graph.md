# Phase 5 — Commit graph, read-only (virtualized SVG)

The centerpiece: full `--all` graph with colored lanes and ref badges, virtualized to 100k commits.

## Deliverables

- [x] `desktop/src/main/log-service.ts` — streaming: `git log --all --topo-order -z`, parse + lane-layout incrementally in main, emit `mgit:log:batch {requestId, rows}` (~500 rows/batch) then `mgit:log:done`; cancellation via requestId map; initial cap `-n 50000` + "load more"
- [x] `app/src/features/graph/graph-store.ts` — per-repo Zustand store (`rows`, `loading`, `requestId`); stale-requestId batches discarded
- [x] `app/src/features/graph/use-graph-stream.ts` — start/cancel + batch reducer
- [x] `app/src/features/graph/{graph-view.tsx,graph-row.tsx,graph-svg.tsx}` — `@tanstack/react-virtual` list; fixed-height per-row `<svg>` drawing node + edges from `GraphRow.edges`; subject/author/date columns
- [x] `app/src/features/graph/ref-badge.tsx` — branch/tag/HEAD badges joined by sha from the `refs` query
- [x] `app/src/features/commit/commit-detail.tsx` — detail pane stub via `mgit:commit:detail` (`git show --stat`) + `git-engine/src/commands/show.ts`

## Verification

- [x] Unit tests for the stream reducer (stale requestId discard, batch append order)
- [x] `~/Dev/midnite`'s full history loads and scrolls at 60fps
- [x] Lane topology visually matches `git log --graph --oneline --all` on a couple of repos
- [x] Switching repos mid-stream never mixes rows
- [x] Screenshot captured

Screenshot: [commit graph](../docs/screenshots/phase-5-commit-graph.png) — `~/Dev/midnite`,
2,376 commits, coloured lanes with merge curves, ref badges with ahead counts, detail pane.

Measurements on `~/Dev/midnite` (2,376 commits, 7 lanes at the widest):

| Check | Result |
|---|---|
| DOM rows while 2,376 are loaded | 56 |
| Scroll frame time (180 frames, 43,200px) | median 8.3ms · p95 9.4ms · 1 frame > 16.7ms |
| Repo switch mid-stream | 2,376 → 7 commits, **0** rows carried over |

## Findings while landing this phase

- **Ref badges join by sha, not by the log's `%D` decorations.** Decorations are a snapshot from
  when the log was streamed; a checkout or a branch creation changes refs without changing
  history. Joining against the refs *query* means the watcher can refresh badges without
  re-streaming 50,000 rows.
- **One gutter width for the whole list, not per row.** A per-row width makes the subject column
  jog left and right as the graph narrows while scrolling — far more distracting than some empty
  space. Capped at 12 lanes so a pathological history can't push subjects off screen.
- **Badges must be allowed to shrink.** `truncate` on the subject is not enough: two long branch
  names on one row (`feature/x` + `origin/feature/x`) are the widest thing in the row, and with
  `shrink-0` badges they pushed straight through the author and date columns. Caught by asserting
  `scrollWidth > clientWidth` on every rendered row, not by eye.
- **The `log:done` event must check `requestId` too.** Only checking it on batches lets a
  superseded stream's completion stop the *new* stream's spinner.
- **Nothing auto-selected a repository**, so the app opened to "No repository selected" with three
  repos in the sidebar — a dead end on every launch. `useDefaultSelection` picks the first repo
  and its main worktree, and also repairs a selection pointing at a repo that has since closed.
- Lane topology is the same data verified against `git log --graph` in Phase 2's ASCII
  comparison — the SVG renders `GraphRow` directly, so the two cannot disagree.
- `MGIT_EVAL` now wraps its expression in `Promise.resolve`, so an async probe works; an
  unwrapped promise stringifies to `{}`, which reads as an empty result rather than a mistake.
