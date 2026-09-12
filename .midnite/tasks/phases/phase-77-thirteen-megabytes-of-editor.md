# Phase 77 — Thirteen megabytes of editor, and the lanes that never move

**Refined: x1** · 2026-09-12 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security/permissions & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

**Written directly** (no human in the loop — see Decisions) · 2026-09-08 · from a surface-layer
performance audit of the built renderer, the graph pipeline and the persisted stores.

[Phase 36](phase-36-performance-diet.md) gave this app its measurement discipline —
[`scripts/perf/`](../../../scripts/perf/README.md), packaged-equivalent or nothing, medians never
single runs, and [`budgets.json`](../../../scripts/perf/budgets.json) as the one place a number is
allowed to live. [Phase 45](phase-45-leak-audit.md) added the retention slope. Those phases are
91% done and their remaining items are human passes. This phase is what the numbers they produce
say *now*, read back against the code.

> **Four findings — all four re-grounded against the tree at refinement x1, and three of them were
> partly wrong as originally written. What survived is sharper; what did not is corrected here
> rather than quietly dropped.**
>
> **1. Total JS is 35.4 MB against a 15.95 MB budget, and the budget file already knows.**
> [`budgets.json`](../../../scripts/perf/budgets.json)'s `_measured` block (2026-09-06, Phase 64
> Theme G) records `totalJsKb: 35405.7` against `totalJsKb: 15950` and says, in its own words,
> "**Disclosure, not fixed here**". The breach is 2.2×. `bundle-budget.spec.ts` lives outside the
> gate by design, so nothing red is showing. The entry chunk is fine (1,434.7 KB against 1,520).
> **Correction (x1): the long tail is not Monaco's.** The original finding blamed
> `emacs-lisp-*.js` 771 KB, `cpp-*.js` 767 KB and `wasm-*.js` 607 KB on Monaco *basic-languages*.
> Monaco 0.56 **ships no `emacs-lisp` directory at all**, and its entire `cpp` Monarch tokenizer is
> **8 KB** — all 81 of its basic-languages together are a few hundred KB. Those chunks are **Shiki**
> grammars (`shiki@4.4.3` / `@shikijs/langs@4.4.3`), which Vite code-splits per language behind
> [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts). Monaco's real weight is the
> two big ones: `monaco-loader` ~13.2 MB and `ts.worker` ~6.8 MB (the latter confirmed verbatim in
> `budgets.json`'s own note). Theme A now measures both families before touching either.
> *`packages/app/dist/` does not exist on a fresh checkout — every per-chunk figure above must be
> re-read from a real build, which is why Theme A's first item exists.*
>
> **2. `import * as monaco from 'monaco-editor'` is the whole editor.**
> [`monaco-loader.ts:2`](../../../packages/app/src/lib/monaco/monaco-loader.ts) imports the package
> root, which resolves to `editor.main` — the editor **plus `editor.all`'s feature contributions plus
> every bundled language**. `monaco-editor/esm/vs/editor/editor.api` is the editor alone.
> **Correction (x1): the app never calls `monaco.editor.create`.** Repo-wide there is **no
> `editor.create`, no `createModel`, no `setModelLanguage` and no `monaco.languages.*` call** — every
> editor is `<Editor language={…} />` from `@monaco-editor/react@4.7.0`, and `getMonaco()`
> (`monaco-loader.ts:41`) exists to win the race against that package's own CDN-defaulting
> `loader.init()`. So a lazy language registry cannot hook where the original item said it would.
> **Second correction: the worker import specifiers are load-bearing and constrained.**
> `monaco-loader.ts:10–14` documents that `monaco-editor`'s `exports` map is `"./*": "./esm/vs/*.js"`,
> so a `monaco-editor/esm/vs/...` specifier doubles the prefix and fails **only at a production
> Rollup build** — the five workers at `:15–19` are therefore written `monaco-editor/language/…`, and
> any new contribution import must follow the same form. The `?worker&inline` is itself a second,
> separate cost ([`vite.config.ts:56–72`](../../../packages/app/vite.config.ts): an opaque `file://`
> origin cannot construct a worker from a relative URL, and base64 is 4/3 the bytes).
>
> **3. The lane layout emits one edge object per untouched lane per row, and its own class doc calls
> that the bottleneck.** [`lane-layout.ts:31–35`](../../../packages/git-engine/src/layout/lane-layout.ts):
> the naive path "re-emits pass-through edges for every lane on every row, which profiles as the
> bottleneck past a few thousand visible lanes". The loop is at **`:155–167`** (the doc's original
> `154–165` was off by one at each end; `:154` is the second `registry.snapshot()`), it walks
> `before` — every active lane — skips the one this commit sits in, and pushes a `straight`
> `GraphEdge` for each survivor. `:59` and `:154` each take a full `registry.snapshot()`.
> **Correction (x1): those objects are not zod-parsed on arrival.** They cross IPC in a 500-row batch
> (`BATCH_SIZE` lives at [`stream-registry.ts:3`](../../../packages/desktop/src/main/stream-registry.ts),
> not as the `log.ts:124` parameter default the original cited), and the preload hands the payload
> straight through untyped (`preload/index.ts:44–50`) — `LogBatchEvent` is compile-time only. So the
> cost is layout time, IPC bytes and renderer heap, **not** validation. **Second correction: they are
> drawn as `<line>`, not `<path>`** — `graph-svg.tsx:116–127` short-circuits `edge.type === 'straight'`
> to a plain `<line>` with no marker; `edgePath()` is only reached by branch and merge edges. The
> 2026-08-31 Kilo scan listed this as finding #6; every other finding in that scan is marked fixed.
>
> **4. The UI store's persisted slice is written whole on every `set`.**
> [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) is **2,751 lines**; the `persist`
> options are at **`:2366–2693`** with `name: 'midnite-studio.ui'`, **`version: 18`**, a `partialize`
> of **105 keys** (`:2369–2479`), **17 `migrate` arms** (`:2530–2648`) and a `merge` arm (`:2658`).
> There is **no `storage:` option**, so zustand's default `createJSONStorage(() => localStorage)`
> `JSON.stringify`s that slice and calls `setItem` synchronously on every state change.
> **Correction (x1): `useResizable` is innocent, and says so itself.**
> [`use-resizable.ts:155–180`](../../../packages/app/src/components/resizable/use-resizable.ts)'s
> `onPointerMove` touches only a ref and two local `useState` setters; the store write happens once,
> in `onPointerUp` at `:191–193`. Its docblock at `:96–99` already explains why: *"A persisted store
> write per pointermove would be ~60 localStorage serialisations a second, and every subscriber of
> the store — the whole app column — would re-render on each one."* The real per-pixel writers are
> **four `<input type="range">` `onChange` handlers** — `terminal-page.tsx:267` (font size),
> `:296` (line height, `step={0.05}`), `companion-page.tsx:373` (volume),
> `sidebar-page.tsx:271` (auto-fetch interval) — and **`dashboard-view.tsx:282`'s
> `onLayoutChange`**, which react-grid-layout fires throughout a tile drag into a *different*
> persisted store, `midnite-studio.dashboard`.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Scope guardrails.** Every theme lands with a number from `scripts/perf/`, before and after, in the
PR body — Phase 36's rule, restated. No budget in `budgets.json` is edited except through the
README's rebaseline procedure, and only in Theme D. Nothing visual changes: the graph draws the same
picture, Monaco opens the same files, the app remembers the same things. Idle CPU, startup and
process-table correctness are not touched — startup is inside budget (`readyToShowMs` 570 vs 1425),
and idle CPU, idle RAM and the `ps` locale bug all belong to
[Phase 85](phase-85-the-monitor-that-lied.md). **This phase owns bytes on disk and frames on screen;
85 owns bytes in RAM and the truth of the instruments.**

## Deliverables

### A — Monaco: the editor, not the catalogue (L)

- [ ] **Measure first, and attribute the tail correctly.**
      `MSTUDIO_BUNDLE_STATS=1 moon run app:build`, then read `packages/app/dist/stats.html`.
      - The env var is strict `=== '1'` ([`vite.config.ts:16`](../../../packages/app/vite.config.ts))
        and is declared an *input* of the `build` task
        ([`packages/app/moon.yml:39`](../../../packages/app/moon.yml)), so flipping it busts moon's
        cache and the build genuinely re-runs — a prior plain build will not silently satisfy it.
      - Record two tables in the PR body: **(a)** what the ~13.2 MB `monaco-loader` chunk is made of
        — `editor.api` proper, `editor.all`'s feature contributions, the bundled language
        contributions, and the inlined-worker base64 — and **(b)** Shiki's total across its grammar
        chunks, since Finding 1's tail is Shiki's and this is the first time anyone has counted it.
      - Every later item's before/after cites table (a). Item 8 below is the only consumer of (b).
- [ ] Replace `import * as monaco from 'monaco-editor'` at
      [`monaco-loader.ts:2`](../../../packages/app/src/lib/monaco/monaco-loader.ts) with
      `monaco-editor/esm/vs/editor/editor.api`, and register the editor features **the app actually
      uses** — a list now derived from the code rather than promised:
      | Feature | Proved by |
      |---|---|
      | find widget | `code-editor.tsx:28–36` reads the `findWidgetVisible` context key |
      | suggest widget | same, `suggestWidgetVisible` |
      | parameter hints | same, `parameterHintsVisible` |
      | `editor.action.formatDocument` | `body-tab.tsx:87` and `:107` |
      | minimap | `code-editor.tsx:205` (user-toggleable) |
      | word wrap, line highlight, readOnly | the options objects in all three hosts |
      | keybindings (`addCommand`) | `query-editor.tsx:76` — `monaco.KeyMod.CtrlCmd \| monaco.KeyCode.Enter` |
      - **Folding, bracket matching and hover — the three the original item named — are referenced
        nowhere in the app**, by option or by API. They are not on the list.
      - The three context keys are read off the **private** `editor._contextKeyService`. If dropping
        `editor.all` makes any of them undefined, `code-editor.tsx`'s Escape handling changes
        behaviour silently — so the list above goes in a comment over the imports, naming the call
        site that requires each, and the Escape semantics are re-verified (Phase 64 Theme E's own
        check).
      - Specifier form: `monaco-editor/esm/vs/editor/editor.api` is correct for the **editor**
        import; the five worker imports at `:15–19` keep their `monaco-editor/language/…` form, which
        `:10–14` explains is required by the package's `exports` map.
- [ ] **New:** `packages/app/src/lib/monaco/languages.ts` — the lazy contribution registry, shaped
      like [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts)'s memoised-singleton
      pattern (`??=`, empty at construction, per-language on first use):
      ```ts
      /** Resolves once per language id; subsequent calls return the same promise. */
      export function ensureLanguage(id: string): Promise<void>;
      /** The ids this app can register — everything else resolves immediately as plaintext. */
      export const REGISTERABLE_LANGUAGES: ReadonlySet<string>;
      ```
      - Backed by a `Map<string, Promise<void>>` over
        `() => import('monaco-editor/basic-languages/<id>/<id>.contribution')` — note the specifier
        **omits** `esm/vs`, per Finding 2's second correction.
      - Eagerly registered: none.
      - The `?worker&inline` language *services* (ts/json/css/html) are untouched by this item; it is
        about grammar-only contributions.
- [ ] **New:** `packages/app/src/lib/monaco/use-monaco-language.ts` — the hook that makes the
      registry reachable at all, given that no host calls `editor.create`:
      ```ts
      /** `false` until the language contribution for `id` has been registered. */
      export function useMonacoLanguage(id: string): boolean;
      ```
      - Each host renders its **existing** `loading` state (or nothing) until the hook returns true,
        then mounts `<Editor language={id} />`. **Gating the mount, not re-tagging the model**: it
        introduces no `setModelLanguage` call — there are none in the codebase — and avoids the
        flash of an unhighlighted buffer that the re-apply approach produces.
      - It composes with the module-scope `void getMonaco()` each host already does at
        `code-editor.tsx:44`, `query-editor.tsx:14`, `monaco-field.tsx:13`.
      - An id not in `REGISTERABLE_LANGUAGES` resolves immediately — no host ever blocks forever on a
        language Monaco does not ship.
- [ ] Wire the **three real hosts**, corrected from the original list:
      [`files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx)
      (`language = monacoLanguageForFile(fileName)` at `:89`),
      [`database/query-editor.tsx`](../../../packages/app/src/features/database/query-editor.tsx)
      (`language="sql"`, `:106`) and
      [`api-client/monaco-field.tsx`](../../../packages/app/src/features/api-client/monaco-field.tsx)
      (`language` prop).
      - [`api-client/body-tab.tsx`](../../../packages/app/src/features/api-client/body-tab.tsx) is
        **not** a host — it consumes `MonacoField` and only maps modes to ids at `:24–29`. It is not
        edited.
      - [`api-client/response-viewer.tsx`](../../../packages/app/src/features/api-client/response-viewer.tsx)
        (`:221,236,243,273`) is a `MonacoField` consumer too and is covered by that host.
      - [`features/themes/use-studio-monaco-theme.ts`](../../../packages/app/src/features/themes/use-studio-monaco-theme.ts)
        needs only `monaco.editor.defineTheme` (`:71`) and `setTheme` (`:77`), both present on
        `editor.api` — verified, unchanged.
        [`importers/vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts)
        is type-only.
- [ ] **The fragile one:** [`api-client/test-editor.tsx:39`](../../../packages/app/src/features/api-client/test-editor.tsx)
      calls `monaco.typescript.javascriptDefaults.addExtraLib(PM_AMBIENT_DTS, 'ts:pm.d.ts')`, behind
      a `let extraLibRegistered = false` guard at `:31–41`. Its own comment at `:21–29` warns that
      `monaco.typescript` is a **lazy getter that registers the entire TS/JS contribution**, pulling
      in a module that reads `document.queryCommandSupported` at eval time (absent in jsdom).
      - On `editor.api` that top-level `typescript` export may not exist at all. This item establishes
        what it becomes — most likely an explicit
        `import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'` behind the same
        first-use guard — and proves `test-editor.tsx` still registers its ambient lib **and still
        does not break the jsdom test environment**.
      - Nothing else in the app touches `monaco.typescript`; this is its only call site.
- [ ] **Lazy `ts.worker`.** The TypeScript service is ~6.8 MB and only matters when a `.ts`/`.js`
      model is open. `getWorker`'s `typescript`/`javascript` arm (`monaco-loader.ts:43–67`) resolves
      it on demand; the JSON/CSS/HTML/editor arms stay eager.
      - Gate: **first `.ts`/`.js` model**, not first keystroke (see Decisions).
      - *Acceptance:* a Playwright assertion that opening a `.md` preview requests no `ts.worker-*`
        chunk — `page.on('request')` filtered on `/ts\.worker/`, expected empty. Note the workers are
        `?worker&inline` (blob URLs, not network requests), so if `request` cannot see them the
        assertion is on `performance.getEntriesByType('resource')` plus the absence of the chunk from
        the dynamic-import graph in `dist/.vite/manifest.json`; the item says which was used.
- [ ] **The two bogus language ids.**
      [`monaco-languages.ts:54,55`](../../../packages/app/src/lib/monaco/monaco-languages.ts) map
      `prisma → 'prisma'` and `proto → 'proto'`. Monaco ships **neither** (`protobuf` exists;
      `prisma` does not), so both silently fall back to plaintext today. With an explicit registry
      they must not be copied blindly: map `.proto → 'protobuf'`, drop `prisma` to `'plaintext'`
      with a comment, and add a unit test asserting every value of `MONACO_LANG_BY_EXT` and
      `MONACO_LANG_BY_NAME` is in `REGISTERABLE_LANGUAGES` or is exactly `'plaintext'`.
- [ ] **The Shiki half, audited not assumed.** Using table (b) from the first item, establish whether
      `createHighlighter({ themes: [...], langs: [] })` (`highlighter.ts:23–28`) plus per-language
      `loadLanguage` (`line-highlight.ts:132`) is genuinely keeping grammars out of the eager graph —
      in which case the chunks are correctly split and merely present on disk, and the finding is
      closed with the number — or whether the `shiki` barrel import pulls the index in regardless.
      Fix only if the latter. **No Shiki change ships without table (b) justifying it.**
- [ ] Re-run `node scripts/perf/bundle-report.mjs` on the packaged-equivalent build. **Target:**
      `totalJsKb` back under the existing 15,950 budget *without* touching the budget. If it lands
      above, Theme D rebaselines with the number and the reason; the target is written here so a miss
      is visible.
- [ ] *Acceptance:* Phase 64's verification list is **re-run, and the two items it already records as
      failing are reported honestly rather than claimed green** — the `cdn.jsdelivr` grep still finds
      `@monaco-editor/loader`'s inert bundled default (Phase 64 records this; the item asserts it is
      still inert, i.e. `loader.config({monaco})` still wins the race), and the five-surface
      same-frame check is still half done. The three that do pass — offline packaged launch with
      Wi-Fi off, five workers from blob URLs with zero network requests for editor assets, and
      `bundle-budget.spec.ts`'s `MUST_BE_ABSENT` entry `{ name: 'monaco-editor', needles: ['MonacoEnvironment'] }`
      — must still pass. That needle is deliberately not the bare string `'monaco-editor'`, because
      `shared/src/keybindings.ts`'s `YIELD_ROOTS` ships a real `'.monaco-editor'` selector in the
      entry chunk; do not "fix" it.

### B — Pass-through lanes as a column, not a thousand edges (L)

The layout keeps emitting *what changed* per row; what did **not** change stops being an object.

> **Scope correction (x1): there is no run-builder.** The original theme drew multi-row "runs", one
> `<path>` per run of consecutive rows. That cannot be done where it was described: **each row is its
> own `<svg height={theme.rowHeight}>`** (`graph-svg.tsx:170–173`), absolutely positioned by the
> virtualizer's `transform: translateY(item.start)` (`graph-view.tsx:483`). There is no global
> row→y coordinate, so a multi-row line has no host element. The wins this theme is actually after —
> **layout time, IPC bytes and renderer heap** — come from the dense array alone and do not need one.
> The DOM node count is unchanged, deliberately, and an overlay SVG across the viewport is recorded
> in Not in this phase.

- [ ] Add `through` to [`GraphRowSchema`](../../../packages/shared/src/domain/commit.ts):
      ```ts
      /**
       * Indexed by lane: the `colorIdx` of a lane passing straight through this row's band
       * untouched, or -1 for an empty or touched lane. Defaulted so a payload written before
       * this field existed still parses — see `schemas.ts`'s `revisions` for the precedent.
       */
      through: z.array(z.number().int()).default([]),
      ```
      - **`.default([])` is required, not optional polish**: every other field on `GraphRowSchema`
        (`:55–66`) is required with no default, so a bare addition is a breaking wire change. The
        in-repo precedent is [`schemas.ts:219`](../../../packages/shared/src/ipc/schemas.ts)'s
        `revisions: z.array(z.string()).default([])`, whose comment says exactly this.
      - Dense `number[]` with a `-1` sentinel, not a sparse map (see Decisions).
      - `edges` keeps `branch`, `merge`, and the **own-lane** `straight` edge — `straightOwnEdge`,
        declared at `lane-layout.ts:114` and assigned at `:116`. It is one per row and it is what
        `graph-svg.tsx`'s node logic keys on. Only the `:155–167` loop's output moves.
- [ ] In [`lane-layout.ts`](../../../packages/git-engine/src/layout/lane-layout.ts), replace that
      loop with a single pass filling `through` from the post-`trim()` registry state, and drop the
      **first** `registry.snapshot()` (`:59`) in favour of the touched-lane set the surrounding code
      already computes.
      - `LaneRegistry.snapshot()` returns `new Set(this.occupied())` in **ascending index order**,
        and [`lane-registry.ts:32–34`](../../../packages/git-engine/src/layout/lane-registry.ts)
        warns that `lane-layout.ts` relies on that order to build its pass-through edges pre-sorted
        rather than sorting them. Filling a dense array by index preserves that property for free —
        say so in the code comment, because it is the reason no sort appears.
      - `TYPE_ORDER` (`:184`) and the straight-first paint order (`edges: straightEdges.concat(branchEdges, mergeEdges)`,
        `:174`) are **unchanged**: `through` is drawn before `edges`, which is the same z-order the
        concat produced.
      - Layout stays a pure function. `lane-layout.test.ts` gains fixtures asserting `through` for a
        3-lane merge, an octopus, and a root commit, plus the invariant **every occupied lane appears
        in exactly one of `through` or `edges`, never both and never neither**.
- [ ] [`graph-svg.tsx`](../../../packages/app/src/features/graph/graph-svg.tsx) draws `through`:
      one `<line>` per lane whose entry is `>= 0`, `x1 = x2 = laneCentre(theme, laneWidth, lane)`,
      `y1 = 0`, `y2 = theme.rowHeight`, `stroke={laneColor(colorIdx, theme.palette)}`,
      `strokeWidth={theme.strokeWidth}` — **byte-identical to the element `:116–127` emits today**
      for a straight edge, because that is exactly what it replaces.
      - Rendered **before** `row.edges.map` at `:277` so the paint order is unchanged.
      - The halo pass at `:243–251` filters on `edge.colorIdx === glowColorIdx`; it gains the
        matching `through` filter, or the glow silently loses every pass-through lane.
      - `edgePath()` (`:327`) and the branch/merge paths are untouched.
- [ ] Migrate every consumer that hand-builds a `GraphRow` — the original item's
      `grep -rn "edges" packages/app/src/features/graph` misses all of these:
      - [`settings/graph-theme-picker.tsx:17–62`](../../../packages/app/src/features/settings/graph-theme-picker.tsx)
        — four `GraphRow` literals with explicit `edges` and `laneCount`; the `{fromLane:0,toLane:0,type:'straight'}`
        at `:44` becomes a `through` entry or the settings preview loses a lane. **This is the one
        that fails typecheck first.**
      - [`test-support/fixtures.ts`](../../../packages/app/test-support/fixtures.ts),
        [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts),
        [`companion/digest.test.ts:83`](../../../packages/desktop/src/main/companion/digest.test.ts),
        and the app-side `graph-store.test.ts`, `author-filter.test.ts`, `first-commit-date.test.ts`,
        `graph-row-overflow.test.tsx`, `graph-row-highlight.test.tsx`, `graph-svg.test.ts`.
      - `.default([])` means each of these compiles without edit *if* it uses the schema's parse; the
        ones constructing the `GraphRow` **type** literally do need the field. The acceptance is
        `moon run :typecheck` green, not a grep.
- [ ] The perf mark goes in **main, not git-engine**: wrap `session.push(commits)` at
      [`log-service.ts:50`](../../../packages/desktop/src/main/log-service.ts), where `defaultLogger`
      and `perfEnabled(process.env)` are already in scope.
      - There is **no `layoutRows` function** (the original item named one).
      - `bootMark` ([`perf-marks.ts:44`](../../../packages/desktop/src/main/perf-marks.ts)) is **not**
        reusable: its `BootMarkName` is a closed union in `shared/src/perf.ts` that
        `scripts/perf/startup-report.mjs` reads, and adding a layout stage to it would change
        startup's own report. Build a local gated closure instead, on
        `agent-process.ts:104`'s `countPsRead` pattern — `perfEnabled(process.env) ? (…) : () => {}`,
        resolved once at module load.
      - `perfEnabled` **is** importable from git-engine (`shared` is a declared dep and `perf.ts`
        imports only zod) — recorded here so a future reader does not re-derive it — but the mark
        still belongs in `log-service.ts`, which is where the batch and the logger already are.
- [ ] Measure on the 50k fixture. `scripts/perf/make-big-repo.sh` builds it; nothing wires it into a
      perf script today, and its own footer (`:89–91`) documents the path:
      `MSTUDIO_PERF=1 MSTUDIO_OPEN_REPOS=$target moon run desktop:start`. Report three numbers
      before/after:
      - **layout time** for the full stream, from the new mark;
      - **IPC bytes** for the first 500-row batch — `JSON.stringify(rows).length` at
        `log-service.ts:52`, logged under the same perf gate;
      - **renderer heap** after the stream settles, via `memory-report.mjs --idle` if
        [Phase 85 Theme D](phase-85-the-monitor-that-lied.md) has landed it, else `performance.memory`
        in a `page.evaluate`. Say which.
      - `idle-cpu.mjs` and `memory-report.mjs` both already accept `--repo=` (`:248` / `:660`), so the
        fixture can be pointed at without new plumbing.
- [ ] **New:** `packages/app/e2e/perf/graph-scroll.spec.ts`, modelled on
      [`diff-scroll.spec.ts`](../../../packages/app/e2e/perf/diff-scroll.spec.ts) — same
      `readFileSync(resolve(HERE,'..','..','..','..','scripts','perf','budgets.json'))` shape, same
      60-frame rAF scroll loop, same median-gap assertion.
      - It **synthesises rows in-spec** against `test-support/mock-bridge.ts`, exactly as
        `diff-scroll.spec.ts` synthesises its 4,000-line hunk. The `e2e/perf/` specs run against the
        Vite dev server with the mocked bridge and take no repo — the 50k fixture is for the
        `--repo`-driven scripts in the item above, not for this spec.
      - Budget `graphScrollMedianGapMs` added to `budgets.json` at 2.5× the measured median, with its
        own `_graphScroll` note, per the README's rule.
- [ ] *Acceptance — a structural assertion, because the screenshot one is not available.*
      A vitest on `graph-svg` asserting the **multiset of painted lanes is identical** before and
      after: for a fixture row, the set of `{lane, colorIdx}` pairs drawn as full-height verticals is
      the same whether they arrive via `edges` or via `through`.
      - `MSTUDIO_SHOTS` only **writes** PNGs to `docs/screenshots/phase-14/` — nothing reads them
        back, so "byte-stable screenshots" was never a check this repo could run. The only pixel
        comparison is `e2e/visual/` at `maxDiffPixelRatio: 0.002` with Linux-only baselines, and
        there is no graph visual spec; see Decisions for why one is not added here.
      - Plus the three numbers above, each improved, in the PR body.

### C — The UI store writes when it has something to say (S)

> **Target correction (x1):** `useResizable` already commits on pointer-up and documents why. This
> theme now aims at the writers that genuinely fire per pixel, one of which lives in a second store.

- [ ] **Measure first.** A vitest around `useUiStore` with a spy on `localStorage.setItem`, counting
      writes across:
      - a simulated `<input type="range">` drag on terminal line height
        ([`terminal-page.tsx:296`](../../../packages/app/src/features/settings/settings-pages/terminal-page.tsx),
        `step={0.05}` — the finest-grained control in the app, so the worst case);
      - a typical view switch;
      - and, against `useDashboardStore`, a simulated react-grid-layout drag
        ([`dashboard-view.tsx:282`](../../../packages/app/src/features/dashboard/dashboard-view.tsx)).
      - Counts in the PR body. They are the justification for everything below; if a drag already
        produces ≤2 writes, say so and stop.
- [ ] **New:** `packages/app/src/store/debounced-storage.ts` + `.test.ts`, a sibling of
      [`shared-settings-storage.ts`](../../../packages/app/src/store/shared-settings-storage.ts) and
      built to the same shape — a generic factory returning a plain object literal typed
      `PersistStorage<T>`, **fully synchronous**, each method guarded on
      `typeof localStorage === 'undefined'`:
      ```ts
      export function debouncedStorage<T>(name: string, ms = 250): PersistStorage<T>;
      /** Flush any pending write immediately. Exported for tests and for the unload path. */
      export function flushNow(): void;
      ```
      - **It replaces a `PersistStorage`, it does not wrap one** — `sharedSettingsStorage` hardcodes
        its own `localStorage.setItem` (`:29–47`) and exposes no inner storage to decorate, so the
        two are not composable today. That is stated here so the executor does not attempt it. The
        two `midnite.settings` stores keep `sharedSettingsStorage` unchanged; their writes are rare.
      - Trailing-edge coalescing at 250 ms; immediate flush on `pagehide`, `beforeunload`, and
        `visibilitychange → hidden`.
      - `getItem`/`removeItem` are pass-through, and `getItem` must return any **pending** value
        rather than the stale stored one, or a rehydrate racing a flush reads the old state.
- [ ] Applied as `storage: debouncedStorage('midnite-studio.ui')` in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts)'s persist options (**`:2366–2693`**,
      the block that today has no `storage:` key) and as
      `storage: debouncedStorage('midnite-studio.dashboard')` in
      [`dashboard-store.ts:210`](../../../packages/app/src/store/dashboard-store.ts).
      - **No `version` bump and no `migrate` arm** in either store: the serialised
        `{ state, version }` envelope is byte-identical, only its write *timing* changes. `ui-store`
        stays at `version: 18` with its 17 arms and its `merge` arm untouched;
        `dashboard-store` stays at `version: 1`.
      - The out-of-persist subscriber at `ui-store.ts:2702–2704` (`writeSessionActiveView` on every
        `activeView` change) writes **`sessionStorage`**, not `localStorage`, and is deliberately
        **unchanged** — it is one small key and it is not part of the persisted slice.
- [ ] A regression test proving both halves: 100 rapid `set`s produce **exactly one** `setItem`, and
      a value written 10 ms before a `pagehide` still lands.
- [ ] *Acceptance:* the line-height drag write count from item one drops to ≤2; the dashboard drag
      count drops to ≤2; `moon run app:e2e` unchanged; `retention.spec.ts` shows no new per-cycle
      growth attributable to the pending-write timer.

### D — The budget catches up with the app, in the open (S)

- [ ] After Theme A lands, run the README's rebaseline procedure for `totalJsKb` **only if** A missed
      the existing budget — with the new measured number, the date, and a one-paragraph reason in
      `_measured.note`, exactly as Phase 64 G wrote its disclosure. If A made the budget, this item
      is a one-line note that it did.
- [ ] Add `graph-scroll` (Theme B) to the budget-suite table in
      [`scripts/perf/README.md`](../../../scripts/perf/README.md) — and **fix the sentence above it
      in the same edit**: the prose says *"Three specs under `packages/app/e2e/perf/`"* while the
      table already lists four (`retention.spec.ts` was added without updating the count). With
      `graph-scroll` it is five.
- [ ] A **non-blocking** `perf-report` job in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml):
      - `runs-on: macos-14`, `continue-on-error: true` — **the first use of that key in this repo**,
        so it gets a comment saying why (the README's own argument: a blocking perf check gets
        disabled rather than read, and a 2.2× breach sitting unseen for a month is the proof).
      - Runs `moon run app:build`, then `node scripts/perf/bundle-report.mjs --json`, and writes a
        markdown table built from the JSON's `top` array into **`$GITHUB_STEP_SUMMARY`**.
        `bundle-report.mjs` already has `--json` (`:35`) and its human table (`:91–97`) is
        space-padded plain text, so the JSON is the right input for a markdown renderer.
      - **Not a PR comment.** `gh pr comment` is used nowhere in this repo's workflows, and a
        job-level `permissions:` block **replaces** the workflow default — `ci.yml:614–617` carries a
        comment warning that `contents: read` must be restated or `actions/checkout` fails on this
        private repo. `$GITHUB_STEP_SUMMARY` needs no permission, no token and no gh CLI, and lands
        one click from the PR's Checks tab.
      - Step-level `env: GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on both the install and
        the `moon run` steps, as every other job does (there is no workflow- or job-level `env:` in
        this file).
      - `paths:` filter to `packages/app/**`, `packages/shared/**`, `pnpm-lock.yaml` — a docs PR does
        not need a packaged build.
      - It must run `moon run desktop:bundle` itself if any spec needs the packaged main:
        `packages/app/moon.yml`'s `perf` task deliberately cannot declare it as a dep (it would
        invert the package dependency direction).
      - Exit codes are already right for this: `bundle-report.mjs` exits `2` on a missing `dist`,
        `1` on a breach with `--assert`, `0` otherwise — the job reports rather than gates, so it
        runs **without** `--assert` and surfaces the numbers.
- [ ] *Acceptance:* a deliberately bloated test branch (import the `monaco-editor` root in a
      throwaway component) shows the breach in its job summary and still reports a **green** overall
      check.

## Files this phase touches

Reconciled against the tree at refinement x1 (2026-09-12). `(**unchanged**)` means load-bearing for
this phase and deliberately not edited; `(**net-new**)` means the phase names it and it does not
exist yet.

| Area | Files |
|------|-------|
| Monaco core | [`lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts) (`getMonaco` L41, the root import L2, worker imports L15–19, `getWorker` L43–67, specifier warning L10–14) · `lib/monaco/languages.ts` (**net-new**: `ensureLanguage`, `REGISTERABLE_LANGUAGES`) + `.test.ts` · `lib/monaco/use-monaco-language.ts` (**net-new**: `useMonacoLanguage`) + `.test.ts` · [`lib/monaco/monaco-languages.ts`](../../../packages/app/src/lib/monaco/monaco-languages.ts) (`monacoLanguageForFile` L82, `MONACO_LANG_BY_EXT` L10–66 — `prisma` L54, `proto` L55) |
| Monaco hosts | [`files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) (context keys L28–36, `void getMonaco()` L44, `language` L89, options L201–210) · [`database/query-editor.tsx`](../../../packages/app/src/features/database/query-editor.tsx) (`addCommand` L76, `language="sql"` L106) · [`api-client/monaco-field.tsx`](../../../packages/app/src/features/api-client/monaco-field.tsx) (L32–52) · [`api-client/test-editor.tsx`](../../../packages/app/src/features/api-client/test-editor.tsx) (`monaco.typescript` L39, guard L31–41, warning L21–29) · [`api-client/body-tab.tsx`](../../../packages/app/src/features/api-client/body-tab.tsx) (**unchanged** — not a host; `MONACO_LANGUAGE` L24–29, `formatDocument` L87/L107) · [`api-client/response-viewer.tsx`](../../../packages/app/src/features/api-client/response-viewer.tsx) (**unchanged** — `MonacoField` consumer) |
| Monaco theming | [`features/themes/use-studio-monaco-theme.ts`](../../../packages/app/src/features/themes/use-studio-monaco-theme.ts) (**unchanged**, verified `defineTheme` L71 / `setTheme` L77 exist on `editor.api`) · [`importers/vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts) (**unchanged**, type-only) |
| Shiki | [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) (`getHighlighter` L23–28) · [`features/diff/line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) (`loadLanguage` L132) — **audited in Theme A item 8; edited only if table (b) justifies it** |
| Build | [`vite.config.ts`](../../../packages/app/vite.config.ts) (`bundleStats` L16, visualizer L22, worker doc L56–72, `worker: { format: 'es' }` L73–75; **no `manualChunks` exists**) · [`packages/app/moon.yml`](../../../packages/app/moon.yml) (`build` L12–47 with `$MSTUDIO_BUNDLE_STATS` input L39; `perf` L97–114 — **unchanged**) |
| Contract | [`shared/src/domain/commit.ts`](../../../packages/shared/src/domain/commit.ts) (`GraphRowSchema` L55–66 — new `through`; `GraphEdgeSchema` L42, `GraphEdgeTypeSchema` L39 — **unchanged**) · [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (`LogBatchEvent` L223–226, **unchanged**; `revisions` L219 is the `.default([])` precedent) |
| Graph — engine | [`git-engine/src/layout/lane-layout.ts`](../../../packages/git-engine/src/layout/lane-layout.ts) (`layoutOne` L57, snapshot L59 + L154, `straightOwnEdge` L114/L116, the loop **L155–167**, row assembly L169–176, `TYPE_ORDER` L184) + [`lane-layout.test.ts`](../../../packages/git-engine/src/layout/lane-layout.test.ts) · [`lane-registry.ts`](../../../packages/git-engine/src/layout/lane-registry.ts) (**unchanged**; its ascending-order contract L32–34 is what makes the dense fill sort-free) · [`commands/log.ts`](../../../packages/git-engine/src/commands/log.ts) (`streamLog` L120, `batchSize` default L124 — **unchanged**) |
| Graph — main | [`main/log-service.ts`](../../../packages/desktop/src/main/log-service.ts) (`startLog` L36, `session` L37, `session.push` L50, `send` L52 — the perf mark and the IPC-bytes log) · [`main/stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts) (`BATCH_SIZE = 500` L3, **unchanged**) · [`main/perf-marks.ts`](../../../packages/desktop/src/main/perf-marks.ts) (**unchanged** — `bootMark` L44 deliberately not reused) |
| Graph — renderer | [`features/graph/graph-svg.tsx`](../../../packages/app/src/features/graph/graph-svg.tsx) (`renderEdge` L88, straight `<line>` L116–127, halo L243–251, edges L277, `edgePath` L327, gutter hook `data-graph-gutter` L196) · [`features/graph/graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx) (`laneCount` reduce L221, virtualizer L303–309, `item.start` L483) · [`features/graph/graph-themes.ts`](../../../packages/app/src/features/graph/graph-themes.ts) (**unchanged**: `laneCentre` L214, `gutterWidth` L224) · [`features/settings/graph-theme-picker.tsx`](../../../packages/app/src/features/settings/graph-theme-picker.tsx) (`PREVIEW_ROWS` L17–62 — **the first typecheck failure**) |
| Graph — fixtures | [`test-support/fixtures.ts`](../../../packages/app/test-support/fixtures.ts) · [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts) · [`desktop/src/main/companion/digest.test.ts`](../../../packages/desktop/src/main/companion/digest.test.ts) (L83) · app-side `graph-store.test.ts`, `author-filter.test.ts`, `first-commit-date.test.ts`, `graph-row-overflow.test.tsx`, `graph-row-highlight.test.tsx`, `graph-svg.test.ts` |
| Stores | `store/debounced-storage.ts` (**net-new**) + `.test.ts` · [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (persist options **L2366–2693**: `name` L2367, `version: 18` L2368, `partialize` L2369–2479, `migrate` L2530–2648, `merge` L2658 — **`storage:` is the only key added**; subscriber L2702–2704 **unchanged**) · [`store/dashboard-store.ts`](../../../packages/app/src/store/dashboard-store.ts) (persist L210, `setLayout` L137 — `storage:` only) · [`store/shared-settings-storage.ts`](../../../packages/app/src/store/shared-settings-storage.ts) (**unchanged** — the shape to imitate, L17–51) |
| Store call sites | [`settings-pages/terminal-page.tsx`](../../../packages/app/src/features/settings/settings-pages/terminal-page.tsx) (L267, L296) · [`settings-pages/companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx) (L373) · [`settings-pages/sidebar-page.tsx`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) (L271) · [`dashboard/dashboard-view.tsx`](../../../packages/app/src/features/dashboard/dashboard-view.tsx) (L282, L421–433) · [`components/resizable/use-resizable.ts`](../../../packages/app/src/components/resizable/use-resizable.ts) (**unchanged** — already correct, L96–99 explains why) |
| Perf & CI | `packages/app/e2e/perf/graph-scroll.spec.ts` (**net-new**) · [`e2e/perf/diff-scroll.spec.ts`](../../../packages/app/e2e/perf/diff-scroll.spec.ts) (**unchanged** — the template) · [`e2e/perf/bundle-budget.spec.ts`](../../../packages/app/e2e/perf/bundle-budget.spec.ts) (`MUST_BE_ABSENT` L97–113, **unchanged**) · [`scripts/perf/bundle-report.mjs`](../../../scripts/perf/bundle-report.mjs) (**unchanged** — `--json` L35, report L81–86) · [`scripts/perf/make-big-repo.sh`](../../../scripts/perf/make-big-repo.sh) (**unchanged**) · [`budgets.json`](../../../scripts/perf/budgets.json) · [`scripts/perf/README.md`](../../../scripts/perf/README.md) (rebaseline L67–89, suite table L41–54 — **the "Three specs" sentence L47**) · [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) (new `perf-report` job; `permissions` warning L614–617) |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme; `moon run root:tracker-check` exits 0.
- [ ] **A:** `node scripts/perf/bundle-report.mjs` before/after table in the PR, with the Monaco and
      Shiki attribution tables from item one.
- [ ] **A:** opening a Markdown preview loads no `ts.worker-*` chunk (the assertion names which
      mechanism it used — `page.on('request')`, `performance.getEntriesByType('resource')`, or the
      dynamic-import graph in `dist/.vite/manifest.json`).
- [ ] **A:** a unit test asserts every value in `MONACO_LANG_BY_EXT`/`MONACO_LANG_BY_NAME` is in
      `REGISTERABLE_LANGUAGES` or is exactly `'plaintext'` — which is what catches `prisma`/`proto`.
- [ ] **A:** `test-editor.tsx` still registers its ambient `.d.ts` and its jsdom test still passes —
      the one place `editor.api` can break silently.
- [ ] **A:** Phase 64's list re-run: offline packaged launch with Wi-Fi off, five workers from blob
      URLs with zero network requests for editor assets, `MUST_BE_ABSENT`'s `MonacoEnvironment`
      needle absent from the entry chunk, and Escape-in-find-widget semantics unchanged. The
      `cdn.jsdelivr` string and the five-surface same-frame check are reported at their **known**
      state, not claimed green.
- [ ] **B:** `lane-layout.test.ts` asserts `through` for a 3-lane merge, an octopus and a root
      commit, and that every occupied lane appears in exactly one of `through`/`edges`.
- [ ] **B:** the `graph-svg` vitest asserts an identical multiset of `{lane, colorIdx}` full-height
      verticals before and after, including under a glow (`glowColorIdx` set).
- [ ] **B:** 50k-fixture layout time, first-batch `JSON.stringify` bytes and renderer heap all in the
      PR; `graph-scroll.spec.ts` green against its new `graphScrollMedianGapMs` budget.
- [ ] **C:** write counts before/after in the PR for the line-height drag, the view switch and the
      dashboard drag; 100 rapid `set`s produce exactly one `setItem`; a write 10 ms before `pagehide`
      lands.
- [ ] **C:** neither store's `version` changed and no `migrate` arm was added — asserted by
      `persisted-keys.test.ts` still passing untouched.
- [ ] **D:** the bloated test branch shows its breach in the job summary and still reports a green
      check; `moon run app:perf` still runs locally.
- [ ] **Open, for a human:** scroll the 50k graph on the packaged build and the real `~/Dev/midnite`
      checkout for a minute each — no visible difference from before Theme B.
- [ ] **Open, for a human:** open a `.ts`, a `.sql` and a `.md` file in sequence after Theme A and
      confirm no flash of unhighlighted text and no perceptible delay before the editor appears.

## Not in this phase

- **An overlay SVG spanning the graph viewport.** It is what a true multi-row run-builder would need,
  and it would cut DOM nodes as well as objects — but it couples the painter to the virtualizer's
  scroll state, needs its own invalidation, and forces the halo pass to move with it. Theme B takes
  the layout/IPC/heap win without it. Recorded as the sequel if `graph-scroll`'s median says the DOM
  node count is what costs.
- **A graph visual-regression spec.** `e2e/visual/` would give real pixel proof at
  `maxDiffPixelRatio: 0.002`, but its baselines are Linux-only and regenerated inside the Playwright
  container, and `scripts/visual-budget.mjs` caps the corpus at ~100 baselines / ~3 MB. Theme B's
  change is pixel-identical *by construction* — it emits the same element with the same attributes —
  so a structural assertion in the default gate is the better trade. Worth adding if the graph ever
  gets a change that is not.
- **Serving the renderer from a custom scheme instead of `file://`.** It would end the
  `?worker&inline` base64 tax outright by giving the renderer a real origin, and let
  [Phase 76](phase-76-the-renderer-in-a-sandbox.md)'s CSP drop `worker-src blob: data:`. It is also a
  change to how every asset URL resolves. The natural sequel to Theme A once A's numbers say how much
  is left on the table.
- **Splitting `ui-store.ts` into feature stores.** 2,751 lines is a maintainability finding, not a
  performance one; Theme C fixes the write pattern without moving a key.
- **Everything in [Phase 85](phase-85-the-monitor-that-lied.md)** — the `ps` locale bug and the
  nullable process table, the retention-budget verdict, the idle RSS floor, `getAppMetrics`, and the
  ungated CSS animations. 85 owns *bytes in RAM and the truth of the instruments*; this phase owns
  *bytes on disk and frames on screen*. Siblings; neither blocks the other. One exception worth
  naming: Theme B's renderer-heap number is easier once 85 Theme D's `--idle` mode exists, and the
  item says what to do if it does not yet.
- **`queries.ts` and idle CPU.** Zero `refetchInterval`s; Phases 36/37 own the visibility gates and
  85 Theme F owns the animation loops.
- **The `load more` cap at 50,000 commits** — `outstanding.md`, unchanged.
- **Interval-tree edge culling** (`INITIAL_PLAN` post-MVP) — Theme B's dense array makes it moot for
  pass-throughs; if branch/merge edge rendering ever profiles, that is its own phase.

## Decisions / open questions

- **Resolved — measure before every change, in the PR body.** Themes A and C each open with a
  measurement item. A theme that skips it has not started. Theme A's opens with *two* tables now,
  because Finding 1's tail turned out to belong to a different library.
- **Resolved — the budget is a target, not a knob.** Theme A aims at the *existing* 15,950 KB.
  Theme D rebaselines only on a documented miss, through the README's procedure.
- **Resolved — the Shiki tail is corrected, audited, and fixed only if the numbers justify it.**
  Monaco ships no `emacs-lisp` and its `cpp` tokenizer is 8 KB; the 771/767/607 KB chunks are Shiki
  grammars. `highlighter.ts` already constructs with `langs: []` and loads per-language, so they may
  be correctly split already. The audit item settles it; no speculative fix ships.
- **Resolved — `ensureLanguage` gates the mount; there is no `setModelLanguage`.** No host calls
  `editor.create`, and `<Editor language={…}>` mounts before a dynamic contribution import resolves.
  A `useMonacoLanguage(id)` hook holding the existing loading state avoids both the flash of
  unhighlighted text and the codebase's first `setModelLanguage` call.
- **Resolved — the host list is three files, not four.** `body-tab.tsx` and `response-viewer.tsx`
  consume `MonacoField`; `test-editor.tsx` is a fourth *Monaco toucher* with its own hazard and gets
  its own item.
- **Resolved — the TS worker is lazy on first `.ts`/`.js` model, not first keystroke.** Simplest
  rule that is also correct; a read-only preview that skips the service entirely is a Phase 64
  follow-up, not this item's problem.
- **Resolved — pass-throughs leave `edges`; the own-lane straight edge stays.** `graph-svg.tsx`'s
  node placement reads the commit's own continuation from `edges`; moving it would touch the node
  logic for no win. Only the `:155–167` loop's output moves.
- **Resolved — `through` is a dense `number[]` with a `-1` sentinel, and it carries `.default([])`.**
  Dense is `laneCount` ints per row and trivially fast to fill in registry order — which is also what
  keeps it sort-free, since `LaneRegistry.snapshot()` is ascending and `lane-registry.ts:32–34` says
  that order is load-bearing. `.default([])` is not polish: every other `GraphRowSchema` field is
  required with no default, so a bare addition breaks the wire.
- **Resolved — there is no run-builder, and the DOM node count does not change.** Each row is its own
  `<svg height={rowHeight}>` positioned by the virtualizer; a multi-row line has no host element. The
  wins are layout time, IPC bytes and heap. The overlay-SVG alternative is recorded in Not in this
  phase with what would justify it.
- **Resolved — the perf mark lives in `log-service.ts:50`, not git-engine.** `bootMark`'s
  `BootMarkName` is a closed union that `startup-report.mjs` reads; a local gated closure on
  `countPsRead`'s pattern is the right shape. (`perfEnabled` *is* importable from git-engine — noted
  so it is not re-derived — but the batch and the logger are both already in `log-service.ts`.)
- **Resolved — Theme B's proof is a structural assertion, not a screenshot.** `MSTUDIO_SHOTS` writes
  PNGs and nothing reads them back, so "byte-stable screenshots" was never runnable. A vitest on the
  painted-lane multiset tests the actual invariant, runs in the default gate, and costs no visual
  baseline.
- **Resolved — Theme C retargets at the range inputs and the dashboard, and widens to two stores.**
  `useResizable` is already correct and documents why. `dashboard-view.tsx:282`'s `onLayoutChange`
  fires throughout a tile drag into `midnite-studio.dashboard`, which the original theme excluded —
  it is the worst offender, so the exclusion is lifted.
- **Resolved — `debouncedStorage` replaces a `PersistStorage`, it does not wrap one.**
  `sharedSettingsStorage` hardcodes its own `setItem` and exposes nothing to decorate. The two
  `midnite.settings` stores keep it unchanged; their writes are rare.
- **Resolved — no `version` bump, no `migrate` arm, in either store.** The serialised envelope is
  byte-identical; only the write timing changes.
- **Resolved — the perf report is a job summary, not a PR comment.** `$GITHUB_STEP_SUMMARY` needs no
  permission, no token and no `gh` CLI — and `ci.yml:614–617` warns that a job-level `permissions:`
  block replaces the workflow default, so a PR comment would cost this repo its first such block for
  a report that is one click away either way.
- **Resolved — the `perf-report` job is `paths:`-filtered and runs on `macos-14`.** Filtered to
  `packages/app/**`, `packages/shared/**`, `pnpm-lock.yaml` — a docs PR does not need a packaged
  build. macOS because it may need `desktop:bundle`, which it must invoke itself (`app:perf` cannot
  declare it as a moon dep without inverting the package graph).
- **Open — does `editor.api` keep the three private context keys alive?** `code-editor.tsx:28–36`
  reads `findWidgetVisible`, `suggestWidgetVisible` and `parameterHintsVisible` off
  `editor._contextKeyService`. They come from feature contributions that `editor.all` registers today.
  *Recommendation:* register those three features explicitly and assert the keys in the same e2e test
  that covers Escape semantics — if any is undefined, the Escape handler silently changes behaviour,
  which is exactly the failure a private API invites.
- **Open — how much of the 13.2 MB is actually recoverable?** Nobody has read `stats.html` yet, and
  `dist/` does not exist on a fresh checkout. If `editor.api` + explicit features turns out to be
  most of `editor.main`, the theme's target is unreachable and Theme D rebaselines.
  *Recommendation:* treat Theme A item one's table (a) as a go/no-go — if the language contributions
  are under ~1 MB of the chunk, drop the registry entirely and keep only the `ts.worker` and
  `editor.api` items.
