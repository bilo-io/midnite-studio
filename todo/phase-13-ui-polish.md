# Phase 13 — UI polish: resizable panels, a real ref tree, motion

Every panel was a hard-coded Tailwind width, every icon a Unicode glyph, nothing persisted,
and the sidebar listed only worktrees. This phase makes the app feel deliberate.

## Deliverables

### A — Foundations

- [x] `lucide-react@^1.34.0` added to `packages/app` (already in the store via `@bilo-io/ui`
      and `@bilo-io/shell`; pnpm's strict layout meant the renderer could not import it)
- [x] `fade-in` / `fade-in-up` keyframes + `ease-in-out` timing in `tailwind.config.ts`
- [x] `applyMotion()` called at boot, resolved from `prefers-reduced-motion` — the shell's
      universal reduced-motion reset was inert because nothing set `html[data-motion]`
- [x] `components/tooltip.tsx` — clones its child rather than wrapping it; delay on open,
      never on close
- [x] `components/icon-button.tsx` — one `label` prop is both tooltip and `aria-label`
- [x] `lib/cascade.ts` — `cascadeStyle(i)`, capped at 12 steps

### B — Resizable panels + persisted layout

- [x] `components/resizable/{use-resizable.ts,resize-handle.tsx}` — pointer capture, `edge`
      inversion, keyboard nudge, double-click reset, `role="separator"`
- [x] `ui-store` wrapped in `persist` (`midnite-git.ui`) with a field-wise `merge`
- [x] Four panes resizable: repos sidebar, terminal, commit detail, changes file list

### C — Sidebar

- [x] `components/tree-section.tsx` promoted out of `status-panel`, backed by `<Collapse>`
- [x] Per-repo **Branches · Remotes · Tags · Worktrees**, refs fetched only while expanded
- [x] Delimiters between repos; worktrees get `FolderGit2`, branches `GitBranch`
- [x] Every remaining Unicode glyph replaced with a lucide icon

### D — Lockable nav rail

- [x] `navMode` + `collapsedNavSections` persisted; pin in the rail's `brand` slot

### E — Title bar

- [x] `<ThemeToggle>` moved from the rail footer to the title bar's `right` slot
- [x] `SyncActions` replaces `SyncBar` — icon buttons, tooltips, per-button spinner
- [x] Framed-window fallback strip (`<TitleBar>` renders nothing when not frameless)
- [x] `sync.fetch` / `sync.pull` / `sync.push` CommandIds finally given handlers

### F — Graph table

- [x] `graph-header.tsx` — `columnheader` row, widths as CSS custom properties
- [x] Resizable Author / Date / SHA columns, resizables owned by `GraphView`
- [x] `ref-filter.tsx` — multi-select branch filter, empty set means every ref
- [x] `revisions` on `LogStartRequest` → `logOptionsFor` → `streamLog`

### G — Motion

- [x] Cascading fade-in on the repo tree and the filter list
- [x] View cross-fade; graph fades once per stream (keyed on `requestId`)

## Verification

- [x] `moon run :typecheck :lint :test` green — 304 tests
- [x] New tests: `use-resizable` (9), `partitionRefs` (6), `logOptionsFor` (3),
      `LogStartRequest.revisions` (2), store persistence (3)
- [ ] Manual smoke via `moon run desktop:start` — **not run**; Electron cannot reach the
      macOS window server from the agent's shell, so every visual claim here rests on the
      static gate alone
- [ ] Screenshot

## Findings while landing this phase

- **The engine already supported ref filtering.** `LogOptions.revisions` has been in
  `git-engine/src/commands/log.ts` since Phase 1 and `buildLogArgs` appends it; only
  `log-service.ts` hard-coded `{ all: true }`. The "feature" was a schema field and a
  passthrough.
- **`--all` and `revisions` are alternatives, not additions.** git walks the union, so
  passing both reaches every ref and silently ignores the filter — a filter that appears to
  do nothing, with no error anywhere.
- **Column widths must not be props.** `CommitGraphRow` is memoised because a streaming log
  re-renders the list ~100 times; a width prop busts that memo on every pointermove of a drag.
  CSS custom properties on an ancestor repaint without React touching the rows.
- **One live width, not two.** The header's resizables are owned by `GraphView`, because a
  header tracking the pointer while the rows sat on the last committed width makes the table
  come apart mid-drag.
- **Virtualized rows cannot cascade.** A per-row entrance animation re-fires every time the
  virtualizer recycles a row — i.e. on every scroll. The list fades once per stream instead.
- **`animation-fill-mode: both` is load-bearing** for a staggered entrance: without a
  backwards fill, an item paints opaque for the length of its own delay, then blinks to
  transparent and fades.
- **`<TitleBar>` renders nothing on a framed window.** Moving app-level controls into it
  would have deleted them on every non-macOS platform and under jsdom.
- **`NavMode` is not importable.** `@bilo-io/shell` exports it from `contracts` but its
  `exports` map exposes only `.` and `./appearance.css`, so there is no legal deep import.
- **zustand's default persist merge is a shallow spread.** A stored `layout` written before a
  pane existed replaces the whole object, leaving the new pane `undefined` — which reaches the
  DOM as a collapsed panel. A field-wise `merge` fixes it.
- **Three CommandIds were dead.** `sync.fetch/pull/push` had chords and native menu items
  since Phase 9 but no handler, so the menu items were inert.
