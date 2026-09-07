# Phase 77 — Thirteen megabytes of editor, and the lanes that never move

**Written directly** (no human in the loop — see Decisions) · 2026-09-08 · from a surface-layer
performance audit of the built renderer, the graph pipeline and the persisted stores.

[Phase 36](phase-36-performance-diet.md) gave this app its measurement discipline —
[`scripts/perf/`](../../../scripts/perf/README.md), packaged-equivalent or nothing, medians never
single runs, and [`budgets.json`](../../../scripts/perf/budgets.json) as the one place a number is
allowed to live. [Phase 45](phase-45-leak-audit.md) added the retention slope. Those phases are
91% done and their remaining items are human passes. This phase is what the numbers they produce
say *now*, read back against the code.

> **Four findings. The first is the headline; the second is the one the codebase has been
> pointing at since Phase 2.**
>
> **1. Total JS is 35.4 MB against a 15.95 MB budget, and the budget file already knows.**
> [`budgets.json`](../../../scripts/perf/budgets.json)'s `_measured` block (2026-09-06, Phase 64
> Theme G) records `totalJsKb: 35405.7` against `totalJsKb: 15950` and says, in its own words,
> "**Disclosure, not fixed here**". The breach is 2.2×. `bundle-budget.spec.ts` lives outside the
> gate by design, so nothing red is showing. The current `packages/app/dist/assets/` says where it
> went: `monaco-loader-*.js` **13,199 KB**, `ts.worker-*.js` **6,843 KB**, `css.worker` 1,028 KB,
> `html.worker` 699 KB, and then a long tail of Monaco *basic-languages* the app never shows a file
> in — `emacs-lisp-*.js` 771 KB, `cpp-*.js` 767 KB, `wasm-*.js` 607 KB. The entry chunk is fine
> (1,435 KB against 1,520). The problem is everything Monaco drags in behind it.
>
> **2. `import * as monaco from 'monaco-editor'` is the whole editor.**
> [`lib/monaco/monaco-loader.ts:2`](../../../packages/app/src/lib/monaco/monaco-loader.ts) imports
> the package root, which resolves to `editor.main` — the editor **plus every bundled language
> contribution**. The file's own comment says "zero eager languages … Monaco registers its bundled
> languages internally on import", which is exactly the cost: registering them means shipping them.
> `monaco-editor/esm/vs/editor/editor.api` is the editor alone; each language is one explicit
> `basic-languages/<lang>/<lang>.contribution` import away. The five workers are wired at `:15–19`
> with `?worker&inline` ([`vite.config.ts:57–73`](../../../packages/app/vite.config.ts) explains
> why: an opaque `file://` origin cannot construct a worker from a relative URL), which is a second,
> separate cost — an inlined worker is base64, and base64 is 4/3 the bytes.
>
> **3. The lane layout emits one edge object per untouched lane per row, and its own class doc
> calls that the bottleneck.** [`lane-layout.ts:33`](../../../packages/git-engine/src/layout/lane-layout.ts):
> "profiles as the bottleneck past a few thousand visible lanes". The loop at `:154–165` walks
> `before` (every active lane), skips the ones this commit touched, and pushes a `straight`
> `GraphEdge` for each survivor; `:59` and `:154` each take a full `registry.snapshot()`. Every one
> of those objects then crosses IPC in a 500-row batch
> ([`log.ts:124`](../../../packages/git-engine/src/commands/log.ts)), is zod-parsed against
> [`GraphEdgeSchema`](../../../packages/shared/src/domain/commit.ts), and becomes its own `<path>`
> in [`graph-svg.tsx:249,277`](../../../packages/app/src/features/graph/graph-svg.tsx)'s
> `row.edges.map`. The 2026-08-31 Kilo scan listed it as finding #6; every other finding in that
> scan is marked fixed. This one is not.
>
> **4. The UI store is a 2,252-line file whose persisted slice is written whole on every `set`.**
> [`ui-store.ts:1993–2086`](../../../packages/app/src/store/ui-store.ts): `name:
> 'midnite-studio.ui'`, `version: 11`, a `partialize` spanning ninety lines of keys. Zustand's
> default storage `JSON.stringify`s that slice and calls `localStorage.setItem` synchronously on
> **every** state change — including ones that fire per pointer-move. The repo already has a custom
> `PersistStorage` ([`shared-settings-storage.ts`](../../../packages/app/src/store/shared-settings-storage.ts))
> for a different reason; there is none for write frequency. Whether this costs frames is exactly
> what this phase's first item under Theme C measures before anything is changed.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Scope guardrails.** Every theme lands with a number from `scripts/perf/`, before and after, in
the PR body — Phase 36's rule, restated. No budget in `budgets.json` is edited except through the
README's rebaseline procedure, and only in Theme D. Nothing visual changes: the graph draws the
same picture, Monaco opens the same files, the app remembers the same things. Idle CPU and startup
are not touched — they are inside budget today (`readyToShowMs` 570 vs 1425) and Phases 36/37 own
their gates.

## Deliverables

### A — Monaco: the editor, not the catalogue (L)

- [ ] **Measure first.** `MSTUDIO_BUNDLE_STATS=1 moon run app:build` and read `dist/stats.html`:
      record, in the PR body, what the 13.2 MB `monaco-loader` chunk is made of — how much is
      `editor.main`'s language contributions, how much is inlined worker base64, how much is the
      editor itself. Every later item's before/after cites this table.
- [ ] Replace `import * as monaco from 'monaco-editor'` at
      [`monaco-loader.ts:2`](../../../packages/app/src/lib/monaco/monaco-loader.ts) with
      `import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'` and register the
      **editor features** the app relies on explicitly (find widget — Phase 64 Theme E depends on it;
      bracket matching; folding; hover; suggest for the API client's Monaco fields). The list is
      derived by grepping `features/**` for every `editor.create` option and `monaco.languages.*`
      call, and it goes in a comment above the imports so the next reader knows why each is there.
- [ ] A **language contribution registry**: `lib/monaco/languages.ts` mapping a language id to a
      dynamic `import('monaco-editor/esm/vs/basic-languages/<x>/<x>.contribution')`, invoked on
      first open of a model in that language (the same lazy shape
      [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) already uses for shiki
      grammars). Eagerly registered: none. The `?worker&inline` language *services* (ts/json/css/html)
      stay wired as today — this item is about the grammar-only contributions.
- [ ] Every Monaco-hosting surface — [`files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx),
      [`database/query-editor.tsx`](../../../packages/app/src/features/database/query-editor.tsx),
      [`api-client/monaco-field.tsx`](../../../packages/app/src/features/api-client/monaco-field.tsx),
      [`api-client/body-tab.tsx`](../../../packages/app/src/features/api-client/body-tab.tsx) — calls
      `ensureLanguage(id)` before `editor.create`/`setModelLanguage`, and the theme importer
      ([`themes/importers/vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts))
      keeps working with `editor.api` (it only needs `editor.defineTheme`).
- [ ] **Lazy `ts.worker`.** The TypeScript service is 6.8 MB and only matters when a `.ts`/`.js`
      model is open. Move its `?worker&inline` import behind the same first-open gate as the
      grammar, so the `getWorker` hook in `monaco-loader.ts` returns the JSON/CSS/HTML/editor
      workers eagerly and resolves the TS worker on demand. Acceptance: opening a `.md` preview
      never loads `ts.worker-*.js` (asserted with `page.on('request')` / `performance.getEntries()`
      in e2e).
- [ ] Re-run `node scripts/perf/bundle-report.mjs` on the packaged-equivalent build. **Target:**
      `totalJsKb` back under the existing 15,950 budget *without* touching the budget. If it lands
      above, Theme D rebaselines with the number and the reason; the target is written here so a
      miss is visible.
- [ ] *Acceptance:* Phase 64's own verification list still holds — offline packaged launch, no
      `cdn.jsdelivr` in `dist`, five workers from blob URLs, the five-surface theme change in one
      frame, and Escape-in-find-widget semantics — re-run, not assumed.

### B — Pass-through lanes as a column, not a thousand edges (L)

The layout keeps emitting *what changed* per row; what did **not** change stops being edges.

- [ ] Add `through: number[]` to [`GraphRowSchema`](../../../packages/shared/src/domain/commit.ts):
      indexed by lane, the `colorIdx` of a lane that passes straight through this row's band
      untouched, `-1` for an empty or touched lane. `edges` keeps `branch`, `merge`, and the *own-lane*
      `straight` edge for the commit's own continuation (the `straightOwnEdge` at
      [`lane-layout.ts:116`](../../../packages/git-engine/src/layout/lane-layout.ts)) — it is one per
      row and it is what `graph-svg.tsx`'s node logic keys on. Only the `:154–165` loop's output moves.
- [ ] In `lane-layout.ts`, replace that loop with a single pass that fills `through` from the
      post-`trim()` registry state, and drop the first of the two `registry.snapshot()` calls
      (`:59`) in favour of tracking the touched-lane set the loop already computes. Layout stays a
      pure function; `lane-layout.test.ts` gains fixtures asserting `through` for a 3-lane merge,
      an octopus, and a root commit, and that every lane appears in exactly one of `through`/`edges`.
- [ ] [`graph-svg.tsx`](../../../packages/app/src/features/graph/graph-svg.tsx): draw `through`
      as **runs** — for the visible window, one `<path>` per (lane, colorIdx) run of consecutive
      rows, not one per row. The virtualizer already knows the visible row range; the run builder
      is a pure function in a new `graph-runs.ts` (+ test) that takes `rows[start..end].through`
      and returns `{lane, colorIdx, fromRow, toRow}[]`. Edge styling (`theme.edge`, straight vs
      curved) applies to the run path exactly as to a straight edge today, so the picture is
      pixel-identical.
- [ ] Every consumer of `row.edges` that assumed pass-throughs were in it is found and moved to
      `through`/runs: `grep -rn "edges" packages/app/src/features/graph` — the audit found
      `graph-svg.tsx` and the row's `laneCount` gutter sizing; the grep is the acceptance test.
- [ ] `scripts/perf/make-big-repo.sh` (the ~50k-commit fixture) before/after: **layout time** for
      the full stream (a `MSTUDIO_PERF=1` mark around `layoutRows` in main), **IPC bytes** for the
      first 500-row batch (`JSON.stringify(batch).length`), and a new
      `packages/app/e2e/perf/graph-scroll.spec.ts` modelled on `diff-scroll.spec.ts` — median frame
      gap over a 60-frame scroll of the 50k graph — with its budget added to `budgets.json` per the
      README's rule (2.5× the measured median).
- [ ] *Acceptance:* the `MSTUDIO_SHOTS` graph screenshots are byte-stable before/after on the
      standard fixture (the drawing did not change), and the three numbers above each improve, with
      the table in the PR body.

### C — The UI store writes when it has something to say (S)

- [ ] **Measure first.** A vitest around `useUiStore` with a spy on `localStorage.setItem`: count
      writes across a synthetic pane drag (`useResizable`'s per-pointer-move `set`) and across a
      typical view switch. Record the counts in the PR body. If a drag produces one write per
      move, the next items are justified; if `useResizable` already commits once on pointer-up,
      write that down and skip to the last item.
- [ ] A `debouncedStorage(ms)` `PersistStorage` in `store/`, sibling of
      [`shared-settings-storage.ts`](../../../packages/app/src/store/shared-settings-storage.ts):
      trailing-edge coalescing (250 ms), an immediate flush on `pagehide`/`beforeunload` and on
      `visibilitychange → hidden`, and a `flushNow()` export for the tests. Applied to
      `midnite-studio.ui` only; `midnite.settings`' merge-storage is left as is (its writes are rare).
- [ ] A regression test proving a value written 10 ms before an unload still lands (the flush) and
      that 100 rapid `set`s produce exactly one `setItem`.
- [ ] *Acceptance:* the drag-write count from item one drops to ≤ 2; `app:e2e` is unchanged; the
      retention spec (`retention.spec.ts`) shows no new per-cycle growth from the timer.

### D — The budget catches up with the app, in the open (S)

- [ ] After Theme A lands, run the README's rebaseline procedure for `totalJsKb` **only if** A
      missed the existing budget — with the new measured number, the date, and a one-paragraph
      reason in `_measured.note`, exactly as Phase 64 G wrote its disclosure. If A made the budget,
      this item is a one-line note that it did.
- [ ] Add `graph-scroll` (Theme B) to the budget suite's table in
      [`scripts/perf/README.md`](../../../scripts/perf/README.md).
- [ ] A **non-blocking** CI job — `perf-report` in `.github/workflows/ci.yml`, `continue-on-error:
      true` — that builds packaged-equivalent and runs `bundle-report.mjs --assert`, posting the
      top-ten table and any breach as a PR comment via `gh pr comment`. A report, never a gate: the
      README's own argument is that a blocking perf check gets disabled rather than read, and a
      2.2× breach sitting unseen for a month is the proof.
- [ ] *Acceptance:* a deliberately bloated test branch (import the full `monaco-editor` root in a
      throwaway component) gets a red comment on its PR and a green check mark.

## Files this phase touches

**A**
- [`packages/app/src/lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts) —
  `editor.api`, explicit features, lazy TS worker.
- New `packages/app/src/lib/monaco/languages.ts` + `.test.ts` — the lazy contribution registry.
- The four Monaco hosts under `features/files/preview`, `features/database`, `features/api-client`.
- [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts) — worker config, if the TS
  worker moves to a separate dynamic entry.

**B**
- [`packages/shared/src/domain/commit.ts`](../../../packages/shared/src/domain/commit.ts) — `through`.
- [`packages/git-engine/src/layout/lane-layout.ts`](../../../packages/git-engine/src/layout/lane-layout.ts) + test.
- [`packages/app/src/features/graph/graph-svg.tsx`](../../../packages/app/src/features/graph/graph-svg.tsx);
  new `graph-runs.ts` + `.test.ts`.
- New `packages/app/e2e/perf/graph-scroll.spec.ts`; [`scripts/perf/budgets.json`](../../../scripts/perf/budgets.json).

**C**
- New `packages/app/src/store/debounced-storage.ts` + `.test.ts`;
  [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (`storage:` option only).

**D** — `budgets.json` `_measured`, `scripts/perf/README.md`, `.github/workflows/ci.yml`.

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme.
- [ ] **A:** `node scripts/perf/bundle-report.mjs` before/after table in the PR; Phase 64's offline
      and five-worker checks re-run green; opening a Markdown preview loads no `ts.worker` chunk.
- [ ] **B:** 50k-fixture layout time, first-batch bytes and `graph-scroll` median all in the PR;
      graph `MSTUDIO_SHOTS` screenshots byte-identical.
- [ ] **C:** write counts before/after in the PR; the unload-flush test passes.
- [ ] **D:** the bloated test branch gets its comment; `moon run app:perf` still runs locally.
- [ ] **Open, for a human:** scroll the 50k graph on the packaged build and the real
      `~/Dev/midnite` checkout for a minute each — no visible difference from before Theme B.

## Not in this phase

- **Serving the renderer from a custom scheme instead of `file://`.** It would end the
  `?worker&inline` base64 tax outright by giving the renderer a real origin, and it would let
  Phase 76's CSP drop `worker-src blob: data:`. It is also a change to how every asset URL resolves.
  Recorded as the natural sequel to Theme A once A's numbers say how much is left on the table.
- **Splitting `ui-store.ts` into feature stores.** 2,252 lines is a maintainability finding, not a
  performance one; Theme C fixes the write pattern without moving a key.
- **`queries.ts` and idle CPU.** Zero `refetchInterval`s; Phases 36/37 own the visibility gates.
- **The `load more` cap at 50,000 commits** — `outstanding.md`, unchanged.
- **Interval-tree edge culling** (`INITIAL_PLAN` post-MVP) — Theme B's runs make it moot for
  pass-throughs; if branch/merge edge rendering ever profiles, that is its own phase.

## Decisions / open questions

- **Resolved — measure before every change, in the PR body.** Themes A and C each open with a
  measurement item. A theme that skips it has not started.
- **Resolved — the budget is a target, not a knob.** Theme A aims at the *existing* 15,950 KB.
  Theme D rebaselines only on a documented miss, through the README's procedure.
- **Resolved — pass-throughs leave `edges`; the own-lane straight edge stays.** `graph-svg.tsx`'s
  node placement reads the commit's own continuation from `edges`; moving it would touch the node
  logic for no win. Only the O(lanes) loop moves.
- **Open — `-1` sentinel vs. a sparse map for `through`.** A dense `number[]` is `laneCount` ints
  per row and trivially fast to iterate in the run builder; a sparse structure saves bytes on wide,
  mostly-empty bands. Recommendation: dense, measured on the 50k fixture; switch only if the
  first-batch bytes say so.
- **Open — how lazy is the TS worker?** On first `.ts`/`.js` model, or on first *keystroke* in one
  (a read-only preview may never need the service)? Recommendation: first model, simplest rule; a
  read-only preview that skips the service entirely is a Phase 64 follow-up.
- **Open — should the `perf-report` job run on every PR or only when `packages/app` changes?**
  Recommendation: `paths:` filter to `packages/app/**`, `packages/shared/**`, `pnpm-lock.yaml` —
  a docs PR does not need a packaged build.
