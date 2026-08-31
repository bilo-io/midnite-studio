# Kilo Performance & Memory Scan — midnite-studio

Date: 2026-08-31

## Memory Leaks

### 1. Module-level global listener never removed — ✅ fixed
- File: `packages/app/src/features/repos/repos-panel.tsx`
- Lines: 1255-1264
- Issue: A `window.addEventListener('pointerdown', ...)` is registered at module scope (outside any `useEffect`). It is never removed. In a hot-reload or test environment this accumulates. Every other listener in the codebase follows the `useEffect` + cleanup pattern; this one does not.

### 2. write-queue.ts never evicts finished repo chains — ✅ fixed
- File: `packages/git-engine/src/exec/write-queue.ts`
- Lines: 23, 58-61
- Issue: `this.chains` is a `Map<string, Promise<unknown>>` that stores the tail promise per repo key. `run()` updates the tail but never removes the entry when the chain fully settles. In a long session that opens and closes many repositories, this map grows without bound.

---

## Performance Issues

### 3. use-tests-stream.ts scans every repo on every output chunk
- File: `packages/app/src/features/tests/use-tests-stream.ts`
- Lines: 17-31
- Issue: Both `onOutput` and `onResult` callbacks run `Object.keys(useTestsStore.getState().runs)` and call `getState()` multiple times per iteration for every single test output chunk. With N repos and M chunks this is O(N×M) store lookups; the store should index runs by `runId` directly instead of linear-scanning.

### 4. O(n²) deduplication in status and changes panels — ✅ fixed
- File: `packages/app/src/services/use-status.ts`
- Lines: 135-137
- Issue: `filter((entry, index, all) => all.findIndex((e) => e.path === entry.path) === index)` runs in quadratic time for a checkout with thousands of entries.

- File: `packages/app/src/features/changes/changes-accordion.tsx`
- Lines: 64-65
- Issue: Same `filter(...findIndex...)` pattern, same O(n²) cost.

### 5. Graph store appends via repeated concat
- File: `packages/app/src/features/graph/graph-store.ts`
- Line: 67
- Issue: `appendBatch` does `state.rows.concat(rows)` on every 500-row batch. For 50,000 rows across ~100 batches this allocates ~100 new arrays of growing size, producing ~2.5M row copies of GC pressure. A single mutable buffer with a render-time slice, or `push` inside an `unstable_batchedUpdates`, would avoid the churn.

### 6. Lane layout emits O(lanes) pass-through edges per row
- File: `packages/git-engine/src/layout/lane-layout.ts`
- Lines: 131-143
- Issue: For every commit the layout iterates `before` (all active lanes) and emits a `straight` edge for each untouched lane. On a repo with thousands of visible lanes this dominates the batch. The file itself flags this as the known bottleneck past a few thousand lanes.

### 7. Palette re-attaches global keydown on every scored result change — ✅ fixed
- File: `packages/app/src/components/palette.tsx`
- Lines: 255-257
- Issue: The `keydown` listener is re-registered whenever `scoredResults.length`, `selectedIndex`, `setSelectedIndex`, `close`, or `runSelectedItem` change. Because `scoredResults.length` changes on every keystroke, this removes and re-adds a capture-phase listener on every render of the open palette.

### 8. use-browser-tabs.ts calls bridge() three times per effect run — ✅ fixed
- File: `packages/app/src/features/browser/use-browser-tabs.ts`
- Lines: 80, 86, 98-101
- Issue: Each `bridge()` call traverses the preload bridge. The result should be cached once per effect; instead the same IPC round-trip is paid repeatedly inside a single render cycle.

---

## Minor / Design Concerns

### 9. metrics-store.ts allocates fresh arrays per sample
- File: `packages/app/src/store/metrics-store.ts`
- Lines: 82-104
- Issue: `appendSample` spreads the series object and filters each series on every tick. At 2s cadence this is fine, but it is still unnecessary allocation; a ring buffer or timestamped linked list would be cheaper.

### 10. lane-layout.ts sorts edges per row
- File: `packages/git-engine/src/layout/lane-layout.ts`
- Line: 153
- Issue: `edges.sort(compareEdges)` runs for every commit. Edge counts are small per row, so this is minor, but it is redundant work if the insertion order is already deterministic.
