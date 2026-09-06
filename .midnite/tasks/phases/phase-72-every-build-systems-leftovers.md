# Phase 72 — Every build system's leftovers

**Refined: x2** · 2026-09-05 · matcher design, data model & IPC contract, security & blast radius, file-map precision, testing & verification, UI / empty / loading / error states, sequencing & cross-phase dependencies, per-item acceptance criteria, out-of-scope tightening

[Phase 59](phase-59-workspace-optimizer.md) shipped the Workspace Optimizer with a scanner that
knows exactly three directory names: `node_modules`, `dist`, `.moon`. Its own docblock says so, and
says widening the set is a later phase's call — *"see the phase doc's Decision 6, not this one's"*.
**This is that phase.** A machine that builds anything other than a TypeScript monorepo accretes
weight the Optimizer currently reports as zero: a Rust `target/`, a Gradle `build/`, a .NET `obj/`,
a Python `.venv`, an Xcode `.build`. The scan walks straight past all of it and tells the user
their repos are clean.

This phase stays **inside the repo roots the app already manages**. Nothing here touches
`~/Library`, the Trash, or any path outside a worktree — that widening is
[Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s job and its own review. What changes here is
*what the walker recognises and how confidently*, which is the low-risk half of the work and useful
on its own the day it lands.

**Five things you must read before writing code; each changes what a theme is.**

**`classify` matches on basename alone, and that is already wrong in production.**
[`scan-service.ts:40-44`](../../../packages/desktop/src/main/optimizer/scan-service.ts) seeds
`DEFAULT_BUILD_ARTIFACT_PATTERNS` with `{ basename: '.moon', category: 'buildOutput' }`. But this
repo's `.moon/` directory contains `workspace.yml`, `toolchain.yml` and `tasks/` — **checked-in
configuration**. Only `.moon/cache/` and `.moon/docker/` are gitignored
([`.gitignore:5-6`](../../../.gitignore), verified verbatim). So today's Optimizer offers a user's
moon configuration for deletion, labelled "Build output". It is recoverable (it goes to the Trash,
not `unlink`), but it is exactly the failure mode a basename-only matcher produces, and the same
mistake scales: a bare `build/` is a CMake artifact in one repo and a hand-written source directory
in the next; a bare `bin/` is MSBuild output beside a `.csproj` and a folder of shell scripts
everywhere else. **Widening a basename list would multiply this bug by twelve.** Theme A replaces
the matcher; Theme E fixes `.moon` as a consequence, not as a patch.

**`classify` is pure and synchronous, and evidence is not.** Proving a `build/` is CMake's means
reading `CMakeCache.txt` inside it; proving a `target/` is Cargo's means seeing `Cargo.toml` beside
it. One of those needs a `readdir` of the candidate, the other needs the *parent's* entry list —
which `walk` already holds: `const entries = await readDirSafe(dir, log);` at
[`scan-service.ts:150`](../../../packages/desktop/src/main/optimizer/scan-service.ts). So the
sibling half costs **zero extra syscalls** if the signature takes the parent's names, and the child
half costs **one `readdir` per candidate**, which only fires for directories whose name already
matched. Design the signature for that; do not make every detector pay for the expensive rule.

**The injectable-pattern seam does not reach the walker, and the refinement must build it.**
`classify`'s `patterns` parameter is real and tested
([`scan-service.test.ts:45-50`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts)),
but `walk` calls `classify(full)` with **no second argument**
([`:168`](../../../packages/desktop/src/main/optimizer/scan-service.ts)) and `ScanWorkspaceOptions`
([`:227-234`](../../../packages/desktop/src/main/optimizer/scan-service.ts)) has no `patterns`
member. Theme E's `disabledEcosystems` therefore cannot "just filter `DEFAULT_DETECTORS` before
walking" — the plumbing from `scanWorkspace` down through `walk` into `classify` is **net-new work
in Theme A**, not an existing seam to reuse. Theme A item 9 builds it explicitly.

**The entry budget is one shared counter, and `dirBytes` spends it too.** `state.entriesWalked` is
a single field on `WalkState` ([`:55-61`](../../../packages/desktop/src/main/optimizer/scan-service.ts));
`walk` increments it at `:153` and `dirBytes` increments it at `:118`, and both compare it against
the same global `MAX_WALK_ENTRIES`. A per-root cap is therefore **not** a second `if` — it needs a
per-root baseline recorded on the state and both loops taught to consult it. And `cleanItems` calls
`dirBytes(confined, newWalkState(), …)` at
[`:330`](../../../packages/desktop/src/main/optimizer/scan-service.ts) to size an item at delete
time; a 50,000-entry cap applied there would under-report `freedBytes` for exactly the directories
this phase exists to find. Theme E item 2 states the shape that avoids that.

**The category union is a wire contract with four members and fifteen consumers.**
`ScanCategorySchema` ([`shared/src/domain/optimizer.ts:18-23`](../../../packages/shared/src/domain/optimizer.ts))
is `z.enum(['nodeModules','buildOutput','staleWorktree','looseObjects'])`, and it flows into
`byCategory` as a `z.record`, into `CATEGORY_HUES` and `CATEGORY_LABELS` as exhaustive `Record`s
([`category-palette.ts:19,38`](../../../packages/app/src/features/optimizer/category-palette.ts)),
into a hand-written `CATEGORY_ORDER` array in **two** tab components
([`smart-scan-tab.tsx:14-19`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx),
[`storage-tab.tsx:9-14`](../../../packages/app/src/features/optimizer/storage-tab.tsx)), into
`SegmentedBar`'s props type ([`segmented-bar.tsx:22`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx)),
and into **four test/e2e files that carry the literal string `'nodeModules'`**
([`segmented-bar.test.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.test.tsx),
[`scan-service.test.ts`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts),
[`e2e/optimizer.spec.ts`](../../../packages/app/e2e/optimizer.spec.ts),
[`e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts)) plus
[`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts). Widening it per-ecosystem —
`rustTarget`, `gradleBuild`, `dotnetObj` — would put twelve rows in a palette and twelve rows in a
list nobody can scan. **Do not widen the category axis; add an orthogonal one.** See Theme C and
Decision 3.

**Builds on.**
- [`desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `classify(path, patterns): ScanCategory | null` (`:47-53`), `BuildArtifactPattern` (`:29-32`,
  whose `category` is `Extract<ScanCategory,'nodeModules'|'buildOutput'>`),
  `DEFAULT_BUILD_ARTIFACT_PATTERNS` (`:40-44`), `WalkState` (`:55-61`), `newWalkState()` (`:63-71`),
  `addItem(state, item)` (`:73-81`), `readDirSafe(dir, log): Promise<Dirent[]>` (`:83-93`),
  `dirBytes(root, state, signal, log)` (`:101-137`), `walk(dir, depth, repoId, state, signal,
  onProgress, log)` (`:139-175`), `PROGRESS_EVERY_ENTRIES = 50` (`:26`), `MAX_WALK_DEPTH = 12`
  (`:22`), `MAX_WALK_ENTRIES = 200_000` (`:24`), `staleWorktreeCandidates` (`:184-207`),
  `collectRoots(extraRoot)` (`:211-225`), `ScanWorkspaceOptions` (`:227-234`),
  `scanWorkspace(opts): Promise<ScanResult>` (`:236-273`), `cleanItems(paths, roots, trash)`
  (`:297-342`), `knownRoots()` (`:345-351`).
  **The whole phase is this one file plus its contract.**
- [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `ScanCategorySchema` (`:18-24`), `ScanItemSchema` (`:26-33`), `SCAN_ITEMS_CAP = 2_000` (`:39`),
  `ScanResultSchema` (`:41-47`), `OptimizerResultOf<T>` (`:92-98`). Re-exported wholesale by
  [`domain/index.ts:13`](../../../packages/shared/src/domain/index.ts) — there is no per-symbol
  barrel line to add.
- [`shared/src/ipc/schemas.ts:1887-1922`](../../../packages/shared/src/ipc/schemas.ts) —
  `OptimizerScanRequest` (`:1889-1892`, today just `{ extraRoot?: string }`),
  `OptimizerScanResponse` (`:1893`), `OptimizerScanProgressEventSchema` (`:1896-1899`),
  `OptimizerCleanRequest` (`:1901-1903`), `OptimizerCleanResultSchema` (`:1904-1908`).
- [`desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  `registerOptimizerHandlers(getWindow)` (`:15`), the `optimizerScan` handler (`:21-51`) with its
  single-flight `currentScan: AbortController | null` guard, and `shell.trashItem` at `:58`.
- [`app/src/features/optimizer/category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
  `type Hsl = readonly [number, number, number]` (`:17`, module-private), `CATEGORY_HUES` (`:19-24`),
  `categoryHsl` (`:26`), `categoryColor` (`:28-31`), `categoryFill(category, alpha)` (`:33-36`),
  `CATEGORY_LABELS` (`:38-43`). Its docblock (`:3-15`) states hues are chosen clear of `METRIC_HUES`
  (cpu 210, memory 280, gpu 160, disk 35, in
  [`monitor/metric-palette.ts:25-32`](../../../packages/app/src/features/monitor/metric-palette.ts));
  keep that property and make it mechanical.
- [`app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  `SegmentedBar({ segments, total, label })` (`:17-25`). **Its `segments` are typed
  `readonly { id: ScanCategory; bytes: number }[]` and it calls `categoryColor(segment.id)` and
  `CATEGORY_LABELS[segment.id]` internally (`:44`, `:46`)** — it is *not* id-agnostic, and Theme D
  changes the component. The overflow-scaling maths (`:26-33`) is untouched.
- [`app/src/features/monitor/format-bytes.ts:12`](../../../packages/app/src/features/monitor/format-bytes.ts) —
  `formatBytes(bytes: number): string`. **Every byte figure in this phase uses it.**
- [`app/src/features/optimizer/use-optimizer.ts`](../../../packages/app/src/features/optimizer/use-optimizer.ts) —
  `useOptimizerScanProgress(): void` (`:11-19`), `runOptimizerClean(paths: string[]):
  Promise<OptimizerCleanOutcome | null>` (`:49`), which reconciles against `skipped` (`:62-73`) and
  raises an info toast naming the skipped count.
- [`app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) —
  `OptimizerScanState` (`:15-21`), `removeScanItem(path)` (`:64-78`, which rebuilds
  `scan.result.items`). **Plain `create()`, no `persist` — unpersisted, deliberately.**
- [`app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BLAST_RADIUS_COPY` (`:32-43`) whose `files` arm reads ``subject: (n) => `${n} item${n === 1 ? '' : 's'}` ``,
  `consequence: 'will be moved to the trash.'`, `noEffect: 'Nothing is left to clean.'`;
  `ConfirmRequest` (`:45-81`) with `blastRadiusKind` (`:52`) and `warnings?: string[]` (`:63`);
  `warnings` render as `<li className="text-xs font-medium text-destructive">` inside one
  destructive-tinted `<ul>` (`:153-161`).
- [`app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `optimizerEnabled`
  (`:1112`), its `PersistedUi` member (`:1288`), its default (`:1359`), its `partialize` entry
  (`:1828`), `version: 9` (`:1750`). The gate this phase inherits and does not re-litigate. Its
  **array-valued** sibling `hiddenMetrics: MetricId[]` (`:936-944`, `:1254`, `:1308`, `:1719-1723`,
  `:1790`) is the precedent Theme E copies, docblock reasoning included.
- [`desktop/src/main/optimizer/scan-service.test.ts`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts) —
  the `mockSingleRepo(repoPath)` harness (`:101-108`) over two real `mkdtemp` roots created in
  `beforeAll` (`:87-90`) and `realpath`-resolved, plus `honors an injected pattern list over the
  default` (`:45-50`), which is the seam Theme F extends.
- [`app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) — `MockFixtures['optimizer']`
  (`:522-548`, whose `byCategory` is `Record<string, number>` at `:525`) and the
  `midniteStudio.optimizer` implementation (`:2396-2470`) with its `byCategory: {}` default
  (`:2400`). Every renderer e2e reads its `ScanResult` from here.

**Scope guardrails.**
- **Repo roots only.** Every path this phase can produce or delete still resolves under a managed
  worktree or the one user-picked extra root, and `cleanItems` still confines against
  `knownRoots()` via `confineTree(root, target)`
  ([`fs-scope-write.ts:215-225`](../../../packages/desktop/src/main/fs-scope-write.ts)), which
  `realpath`s both sides, refuses the root itself, and returns `null` rather than throwing.
  Widening that is [Phase 73](phase-73-the-optimizer-leaves-the-repo.md); a home-level path
  appearing in a `ScanResult` from this phase is a bug.
- **The regenerable-cache rule, stated once and enforced per detector.** The Optimizer may offer a
  directory only when *some named tool recreates it on demand and its loss costs time, never
  information*. Every detector added here names that tool in a `producer` field. If you cannot name
  one, the directory does not belong in the catalogue.
- **Evidence, not names.** No detector ships whose only qualification is a directory basename,
  unless that basename is itself unambiguous across the whole ecosystem (`node_modules`,
  `__pycache__`, `.pytest_cache`). Decision 1 states the admitting rule.
- **`shell.trashItem` stays the only delete.** Unchanged from Phase 59 and not up for discussion
  here. No `fs.rm`, no vendor commands — a command-based reclaim route exists but belongs to
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Theme D, where the caches that need it live.
- **`git-engine` gains nothing.** Same guardrail as Phase 59. The detector catalogue is Node/TS in
  `desktop/`, the types are zod in `shared/`. `ArtifactDetector` and `EvidenceRule` are **desktop-only
  and never exported from `shared`** — only `Ecosystem`/`EcosystemSchema` and
  `ReclaimCost`/`ReclaimCostSchema` cross the boundary, which is precisely what
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) `:156-158` assumes.
- **No new dependency.** No glob library: the two matching forms this phase needs (a `sep`-joined
  path suffix and a filename extension) are a handful of lines of segment comparison and
  `String.prototype.endsWith`, and are tested as such. `micromatch`/`minimatch`/`picomatch` appear
  nowhere in the `importers:` block of `pnpm-lock.yaml` nor in any `package.json` (verified); they
  exist only as transitive tooling deps. Keep it that way.
- **No new IPC channel, and the PR description says so.** All five optimizer channels
  ([`channels.ts:299-309`](../../../packages/shared/src/ipc/channels.ts) plus
  `optimizerScanProgress` at `:762`) are unchanged; only their payload schemas widen.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Sequencing.** `C → A → B → E → D → F`. Theme C is first in *landing* order even though it is
lettered third: `ArtifactDetector` names `Ecosystem` and `ReclaimCost`, so those must exist in
`shared/` before `detectors.ts` compiles. A → B is the registry before the catalogue that fills it.
E depends on A's `detectors` plumbing (the `disabledEcosystems` filter has nothing to filter
otherwise) and on C's `truncatedRoots`. D is last of the build themes because it renders C's fields
and E's `truncatedRoots`. **A partial landing of C alone is safe** (the wire widens, `walk` writes
constant values into the three new fields); **a partial landing of A without C does not compile**;
**D without B renders an empty grouping and is not shippable on its own.**

---

## Deliverables

### A — The detector registry (M) · ✅ DONE (PR #190, 2026-09-05)

Replaces the basename list with a structure that can express "this directory, but only when the
evidence beside it says so."

- [x] Add `packages/desktop/src/main/optimizer/detectors.ts` — a new module, **not** more constants
      in `scan-service.ts`.
      - The scanner and the catalogue change for different reasons and at different rates: the
        walker is security-critical machinery, the catalogue is a list that grows every time
        someone uses a new build tool.
      - It imports `Ecosystem`, `ReclaimCost` and `ScanCategory` from `@midnite/studio-shared` and
        **nothing from `scan-service.ts`** — the dependency points one way, so a catalogue edit can
        never change walker behaviour by accident.
      - *Done when:* `detectors.ts` exists, exports the four symbols below, and
        `scan-service.ts` imports from it rather than declaring patterns inline.
- [x] Export the detector shape, with every field named:
      ```ts
      export type DetectorId = string; // kebab, e.g. 'rust-target', 'dotnet-obj'

      export type ArtifactDetector = {
        /** Stable, kebab, never reused — it is the test name and the `detectorId` on the wire. */
        id: DetectorId;
        label: string;                       // "Cargo target/", shown in the item list
        category: ScanCategory;              // the coarse axis — see Theme C
        ecosystem: Ecosystem;                // the grouping axis — see Theme C
        /** What recreates this. Prose, one clause. Required: see the scope guardrail. */
        producer: string;                    // "cargo build"
        /** `sep`-joined path suffixes; one segment is the common basename case. */
        match: readonly string[];            // ['target'] | ['vendor/bundle']
        evidence: EvidenceRule;
        reclaim: ReclaimCost;                // 'cheap' | 'costly' — see Theme D
      };
      ```
      - `match` entries are written with `/` in source regardless of platform;
        `matchesPathSuffix` splits the *suffix* on `/` and the *path* on `sep`, so the catalogue
        stays readable and stays correct on Windows even though this app ships macOS-only today.
      - *Done when:* `tsc` accepts every entry in `DEFAULT_DETECTORS` against this type with no
        `as`, no `satisfies` widening and no optional field.
- [x] Export `EvidenceRule` as a four-arm discriminated union, and **say in the docblock which arm
      costs a syscall**:
      ```ts
      export type EvidenceRule =
        /** The name alone is proof. Admitted only by Decision 1's rule. */
        | { kind: 'none' }
        /** A name in the candidate's PARENT directory. Free — walk already has that readdir. */
        | { kind: 'siblingAny'; names: readonly string[] }
        /** A filename extension in the candidate's PARENT. Free, same readdir. */
        | { kind: 'siblingSuffix'; suffixes: readonly string[] }
        /** A name INSIDE the candidate. One readdir per candidate, and only for candidates. */
        | { kind: 'childAny'; names: readonly string[] };
      ```
      There is deliberately **no `childAll`, no regex and no glob arm.** Every detector in Theme B's
      catalogue is expressible in these four; an arm nobody uses is an arm nobody tests.
      - *Done when:* `detectors.test.ts` has at least one positive and one negative fixture per arm,
        and a `switch (rule.kind)` over the union with no `default` still typechecks (exhaustive).
- [x] Export `matchesPathSuffix(path: string, suffix: string): boolean` — splits `path` on `sep` and
      `suffix` on `'/'`, compares the trailing segments pairwise, and is **case-sensitive**.
      - macOS's default volume is case-*insensitive* but case-*preserving*, so `Build/` and `build/`
        both exist as spellings on disk. Compare case-sensitively and list both spellings in `match`
        where a tool ships both (CLion writes `cmake-build-debug`; Xcode writes `Build`). A
        case-insensitive compare would make `Bin/` — a perfectly ordinary source folder name —
        match the .NET detector.
      - Returns `false` when the suffix has more segments than the path. Never allocates a regex.
      - *Done when:* `matchesPathSuffix('/a/b/vendor/bundle', 'vendor/bundle') === true`,
        `matchesPathSuffix('/a/vendorbundle', 'vendor/bundle') === false`,
        `matchesPathSuffix('/a/xvendor/bundle', 'vendor/bundle') === false` and
        `matchesPathSuffix('/bundle', 'vendor/bundle') === false`, all asserted in
        `detectors.test.ts`.
- [x] Export `matchesFileSuffix(names: ReadonlySet<string>, suffixes: readonly string[]): boolean` —
      the `siblingSuffix` helper, a plain `endsWith` scan over the set.
      - Kept separate from `matchesPathSuffix` on purpose: one compares *path segments*, the other
        compares *filename tails*, and collapsing them into one "suffix" function is how a
        `.csproj` rule ends up matching a directory named `foo.csproj`. The set holds names, not
        types, so a directory called `x.csproj` would satisfy it — acceptable, because a
        `.csproj`-named directory beside an `obj/` is not a case worth defending against.
      - *Done when:* asserted for `.csproj` present, `.csproj` absent, and a name that merely
        *contains* `.csproj` mid-string.
- [x] Rewrite `classify` in
      [`scan-service.ts:47-53`](../../../packages/desktop/src/main/optimizer/scan-service.ts) as:
      ```ts
      export async function classify(
        path: string,
        siblingNames: ReadonlySet<string>,
        detectors: readonly ArtifactDetector[] = DEFAULT_DETECTORS,
        log: Logger = defaultLogger,
      ): Promise<ArtifactDetector | null>
      ```
      - It returns the **whole detector**, not just a category — `walk` needs `id`, `ecosystem`,
        `reclaim`, `label` and `producer` to build the `ScanItem` and the `detectors` map, and a
        second lookup by category would be ambiguous the moment two detectors share one.
      - The `detectors` parameter stays injectable exactly as `patterns` was, so
        [`scan-service.test.ts:45-50`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts)
        is *rewritten in place* rather than deleted: same intent, new argument shape.
      - `BuildArtifactPattern` and `DEFAULT_BUILD_ARTIFACT_PATTERNS` are **deleted**, not deprecated.
        `BuildArtifactPattern.category`'s `Extract<ScanCategory,'nodeModules'|'buildOutput'>`
        (`:31`) goes with them — under Theme C's rename it would not compile anyway.
      - *Done when:* `classify` has no `basename()` call left in it and
        `grep -c BuildArtifactPattern packages/` returns 0.
- [x] **Order matters and is part of the contract.** `classify` returns the **first** matching
      detector in array order, and `DEFAULT_DETECTORS` is ordered most-specific-first.
      - Two detectors legitimately claim `target/` (Cargo and Maven) and two claim `build/` (CMake
        and Gradle); their evidence rules disambiguate, but a detector with `evidence: {kind:'none'}`
        must never sit above one whose `match` shares a suffix with it.
      - Assert the ordering invariant in a test rather than relying on review: *for every pair
        `(i, j)` with `i < j`, if `DEFAULT_DETECTORS[i].evidence.kind === 'none'` and
        `DEFAULT_DETECTORS[i].match` shares any suffix with `DEFAULT_DETECTORS[j].match`, fail.*
      - *Done when:* `detectors.test.ts`'s `no evidence-free detector shadows an evidenced one`
        passes, and deliberately moving `node_modules` above a hypothetical evidenced
        `node_modules` entry makes it fail.
- [x] Wire the sibling set through `walk` with no extra `readdir`.
      - `readDirSafe(dir, log)` at
        [`:150`](../../../packages/desktop/src/main/optimizer/scan-service.ts) already returns the
        parent's `Dirent[]`; build `const siblingNames = new Set(entries.map((e) => e.name));`
        **once, immediately after `:150` and above the `for` loop**, and pass it to every `classify`
        call in that directory.
      - Building it per-entry would turn an O(n) walk into O(n²) on a wide `node_modules`; the set
        is built once per directory even when no entry in it is a candidate, which costs one array
        map on a list already in memory.
      - *Done when:* `walk` contains exactly one `new Set(` and exactly one `readDirSafe` call.
- [x] **Thread the detector list from `scanWorkspace` to `classify` — this plumbing does not exist
      today.** `ScanWorkspaceOptions` (`:227-234`) gains `detectors?: readonly ArtifactDetector[]`;
      `walk` gains a `detectors: readonly ArtifactDetector[]` parameter after `repoId`; `walk`'s
      `classify(full)` at `:168` becomes `await classify(full, siblingNames, detectors, log)`.
      - Rejected alternative: reading a module-level mutable `activeDetectors`. A scan is
        single-flight today only because `optimizer-handlers.ts:21-51` aborts the previous
        controller; module state would make a future concurrent scan silently cross-contaminate.
      - This is what Theme E's `disabledEcosystems` filter plugs into, and what lets every Theme F
        fixture inject a two-entry catalogue instead of running the full twenty-four.
      - *Done when:* a `scanWorkspace({ signal, onProgress, detectors: [oneDetector] })` call in
        `scan-service.test.ts` produces items only for that detector.
- [x] `childAny` evidence goes through `readDirSafe`, never a bare `readdir`.
      - A candidate the user cannot read must skip the detector, not fail the scan. The existing
        helper already logs `[optimizer] scan: could not read "<dir>": <describeFsError>` and
        returns `[]`; that is the correct behaviour here too — **no evidence found ⇒ no match**,
        which fails *closed* (nothing offered for deletion), the safe direction.
      - The `childAny` `readdir` does **not** increment `state.entriesWalked`: it is evidence, not
        traversal, and charging it to the walk budget would make the budget depend on how many
        detectors are enabled.
      - *Done when:* a fixture directory chmod'd `0o000` (skipped on CI where the test runs as
        root — guard with `process.getuid?.() !== 0`) yields zero items and one log line.
- [x] **`.git` stays refused at any depth** and symlinks stay untraversed and unsized.
      - [`:158`](../../../packages/desktop/src/main/optimizer/scan-service.ts)
        (`if (entry.name === '.git') continue;`), `:159` (`if (entry.isSymbolicLink()) continue;`)
        and `:119` (the same check inside `dirBytes`) do not move, do not reorder, and stay
        **above** the `classify` call so a name can never be evidenced into a match.
      - Add a test asserting a detector cannot be made to match inside a `.git` directory even when
        a fixture plants `.git/node_modules/` there.
      - *Done when:* `scan-service.test.ts`'s `a detector never matches inside .git` passes and the
        two existing symlink assertions (`:131-149`) are untouched.
- [x] `detectors.test.ts`: every arm of `EvidenceRule` proved against a fixture tree — a `target/`
      with a sibling `Cargo.toml` matches, the same `target/` without one does not; a `build/`
      containing `CMakeCache.txt` matches, an empty `build/` does not; `matchesPathSuffix` accepts
      `a/b/vendor/bundle` for `vendor/bundle` and rejects `a/vendorbundle`.
      - Reuse `scan-service.test.ts`'s `mkdtemp(join(tmpdir(), …))` + `realpath` + `afterAll(rm)`
        harness shape (`:87-95`) rather than a mocked `fs`; the whole point is real `Dirent`s.
- [x] Docblock at the top of `detectors.ts` states the three rules an entry must satisfy — a named
      `producer`, evidence unless Decision 1's rule admits the name, and a place in the ordering —
      and names the two things deliberately absent: **no Go detector** (Decision 7) and **no
      per-detector exclusion list** (Decision 9). A future reader "fixing the gap" is the failure
      mode this paragraph exists to prevent.

### B — The catalogue: nine ecosystems in the repo (M) · ✅ DONE (PR #190, 2026-09-05)

Each entry below states **what identifies it**, **what proves it**, and **what recreates it**. An
entry with no third column does not ship. Every `id` below is normative — Theme F asserts on them
and Phase 73/74 rows sit beside them.

- [x] **Node/web** — `node-modules` (`node_modules`, `evidence: none`, category `dependencies`,
      ecosystem `node`, producer `npm/pnpm/yarn install`, **costly**); `node-dist` (`dist`,
      `siblingAny: ['package.json']`, `buildOutput`, `npm run build`, cheap); `node-next`
      (`.next`), `node-turbo` (`.turbo`), `node-parcel-cache` (`.parcel-cache`), `node-svelte-kit`
      (`.svelte-kit`), `node-nuxt` (`.nuxt`), `node-vite` (`.vite`) — each `evidence: none`, each a
      tool-private dotted name that means one thing.
      - `.turbo` and `.parcel-cache` are `toolCache`; `.next`, `.svelte-kit`, `.nuxt`, `.vite` are
        `buildOutput`. All cheap.
      - `dist` **must** keep its sibling evidence: `dist/` is also a perfectly ordinary hand-written
        folder name in a non-Node repo.
- [x] **moon** — `moon-cache` (`.moon/cache`) and `moon-docker` (`.moon/docker`) as **two-segment
      `match` suffixes**, never `.moon`. Category `toolCache`, ecosystem `multi`, producer
      `moon run`, cheap.
      - This is the [`.gitignore:5-6`](../../../.gitignore) boundary written into the catalogue:
        `.moon/workspace.yml`, `.moon/toolchain.yml` and `.moon/tasks/` are checked-in
        configuration. See Theme E for retiring the old entry.
      - Ecosystem `multi` rather than `node`: moon is language-agnostic and this repo's own
        `.moon/toolchain.yml` configures more than node.
- [x] **Rust** — `rust-target` (`target`, `siblingAny: ['Cargo.toml']`, `buildOutput`, producer
      `cargo build`, cheap).
      - The registry of downloaded crates lives at `~/.cargo/registry`, is **not** in a repo, and is
        [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s — so a `target/` delete costs a
        recompile, not a re-download, and `cheap` is the honest grade.
- [x] **C/C++ (CMake)** — `cmake-build` (`build`, `_build`, `cmake-build-debug`,
      `cmake-build-release`, `childAny: ['CMakeCache.txt', 'CMakeFiles']`, `buildOutput`, producer
      `cmake --build`, cheap).
      - **The evidence is a child, not a sibling** — CMake writes `CMakeCache.txt` *into* the build
        directory. A bare `build/` with no cache file inside it is somebody's source tree and is
        never offered.
      - `_build` also belongs to Elixir/Dune, which this phase does not cover; the `CMakeCache.txt`
        evidence means an Elixir `_build` simply does not match, which is correct — a miss is a bug
        report, a false match is a data-loss incident.
- [x] **.NET / C#** — `dotnet-obj` (`obj`) and `dotnet-bin` (`bin`), both
      `siblingSuffix: ['.csproj', '.fsproj', '.vbproj', '.vcxproj']`, `buildOutput`, producer
      `dotnet build`, cheap.
      - `bin/` is the single most dangerous basename in this catalogue — it is a script folder in
        half the repos on any machine — so it ships **only** with project-file evidence, and
        Theme F's fixture set includes a `bin/` beside a `package.json` (must not match) and a
        `bin/` with no siblings at all (must not match).
      - `~/.nuget/packages` is out of repo and is
        [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s.
- [x] **Python (tool caches)** — `py-pycache` (`__pycache__`), `py-pytest-cache` (`.pytest_cache`),
      `py-mypy-cache` (`.mypy_cache`), `py-ruff-cache` (`.ruff_cache`), `py-tox` (`.tox`) —
      `evidence: none`, category `toolCache`, ecosystem `python`, cheap.
      - Producers respectively: `python import`, `pytest`, `mypy`, `ruff`, `tox`. Each name is
        tool-private and unambiguous; `__pycache__` is grandfathered by Decision 1's second clause.
- [x] **Python (environments)** — `py-venv` (`.venv`, `venv`, `env`,
      `childAny: ['pyvenv.cfg']`, category `dependencies`, producer `python -m venv`, **costly**).
      - `pyvenv.cfg` is written by `venv`/`virtualenv` and by nothing else, which is what makes
        `env` — otherwise an unacceptable basename, since `env/` is also a common config directory —
        safe to list.
      - `~/Library/Caches/pip` and the uv/poetry caches are out of repo.
- [x] **Java / Kotlin / Gradle / Maven** — `gradle-build` (`build`,
      `siblingAny: ['build.gradle','build.gradle.kts','settings.gradle','settings.gradle.kts']`,
      `buildOutput`, producer `gradle build`, cheap); `gradle-project-cache` (`.gradle` — the
      **project-local** one, same four sibling files, `toolCache`, producer `gradle`, cheap);
      `maven-target` (`target`, `siblingAny: ['pom.xml']`, `buildOutput`, producer `mvn package`,
      cheap); `idea-out` (`out`, `siblingAny: ['.idea']`, `buildOutput`, producer
      `IntelliJ IDEA build`, cheap).
      - `~/.gradle/caches` and `~/.m2/repository` are out of repo.
      - `idea-out` is ecosystem `java` even though `.idea` is IDE-wide: IntelliJ's `out/` is a JVM
        compile output, and putting it under `multi` would hide it from a Java user's group.
- [x] **Swift / Xcode (project-local)** — `swiftpm-build` (`.build`,
      `siblingAny: ['Package.swift']`, `buildOutput`, producer `swift build`, cheap);
      `cocoapods-pods` (`Pods`, `siblingAny: ['Podfile']`, `dependencies`, producer `pod install`,
      **costly**); `xcode-deriveddata` (`DerivedData`,
      `siblingSuffix: ['.xcodeproj','.xcworkspace']`, `buildOutput`, producer `xcodebuild`, cheap).
      - `xcode-deriveddata` catches only the project-local override; the shared
        `~/Library/Developer/Xcode/DerivedData` is out of repo.
      - `.build` is listed with a leading dot but is **not** admitted by Decision 1 — SwiftPM's
        `.build` is not tool-namespaced, and `.build` is a plausible hand-made directory name. It
        carries sibling evidence like any undotted name.
- [x] **Ruby** — `ruby-vendor-bundle` (`vendor/bundle` as a **two-segment suffix** with
      `childAny: ['ruby']`, category `dependencies`, producer `bundle install --path vendor/bundle`,
      **costly**).
      - Never a bare `vendor/`: in a Ruby repo `vendor/` also holds checked-in assets and forked
        gems. `~/.gem` and `~/.bundle/cache` are out of repo.
- [x] **Go — deliberately nothing in-repo, and this is a finding, not an omission.**
      - Go builds into `GOCACHE`/`GOMODCACHE` under the home directory, so a Go repo has no build
        artifact to find. Its one in-repo candidate, `vendor/`, is **checked in on purpose** and
        changes build behaviour when absent (`go build` silently switches from `-mod=vendor` to the
        module cache).
      - **Ship no Go detector**, and no `'go'` member on `EcosystemSchema` —
        [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Decision 8 adds that member with the
        caches that justify it. Say so in `detectors.ts`'s docblock so the next person does not
        "fix" the gap.
- [x] **The stale-worktree item is synthesised, not detected — give it a stable identity.**
      `scanWorkspace` adds its `staleWorktree` item directly at
      [`:249`](../../../packages/desktop/src/main/optimizer/scan-service.ts), bypassing `classify`
      entirely, so Theme C's three new `ScanItem` fields have no detector to read them from.
      - Export `STALE_WORKTREE_DETECTOR: ArtifactDetector` from `detectors.ts` with
        `id: 'git-stale-worktree'`, `label: 'Stale worktree'`, `category: 'staleWorktree'`,
        `ecosystem: 'git'`, `producer: 'git worktree add'`, `match: []`, `evidence: {kind:'none'}`,
        `reclaim: 'cheap'`, and have `:249` build its item from that constant.
      - It is **excluded from `DEFAULT_DETECTORS`** (an empty `match` can never fire in `classify`,
        and including it would trip the ordering invariant), and the `producer`-presence test in
        Theme F covers it explicitly as a separate assertion.
      - *Done when:* a stale-worktree item in a scan carries
        `detectorId: 'git-stale-worktree', ecosystem: 'git', reclaim: 'cheap'` and appears in
        `result.detectors` with its label and producer.
- [x] Export `DEFAULT_DETECTORS: readonly ArtifactDetector[]` containing exactly the twenty-four
      entries above, in the order the items are listed here (Node first, Ruby last), and export
      `DETECTOR_COUNT = DEFAULT_DETECTORS.length` — asserted equal to `24` in Theme F so an
      accidental deletion during a merge is a failing test rather than a silent regression.

### C — The data model widens by one axis, not twelve (M) · ✅ DONE (PR #190, 2026-09-05)

- [x] Add `EcosystemSchema` to
      [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts):
      ```ts
      export const EcosystemSchema = z.enum([
        'node', 'multi', 'rust', 'cpp', 'dotnet', 'python', 'java', 'swift', 'ruby', 'git',
      ]);
      export type Ecosystem = z.infer<typeof EcosystemSchema>;
      ```
      - This is the **grouping** axis. The first nine are Theme B's nine catalogue groups in
        Theme B's own order; `'multi'` is the build-tool-agnostic member (moon); `'git'` covers
        `staleWorktree`/`looseObjects` and is last because nothing in the catalogue produces it.
      - **Later phases append immediately before `'git'`** —
        [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Decision 8 adds `'go'`,
        [Phase 74](phase-74-media-caches-and-the-trash.md) adds `'media'`. Write that rule in the
        docblock; `'git'` staying last is what keeps the Storage legend's ordering stable.
      - There is **no `'go'` and no `'media'` member in this phase.**
      - The docblock must name the *other* ecosystem taxonomy in the same flat barrel:
        `DiagnosticsEcosystemSchema`
        ([`shared/src/domain/diagnostics.ts:39-48`](../../../packages/shared/src/domain/diagnostics.ts)),
        `z.enum(['javascript','go','python','dotnet','cpp','make','moon'])`, which is purely
        descriptive and drives nothing. The names do not collide, but
        [`domain/index.ts:13`](../../../packages/shared/src/domain/index.ts) re-exports both flat, so
        say in one line which is which and that neither should be widened to serve the other — see
        Decision 15.
- [x] Widen `ScanCategorySchema` ([`:18-23`](../../../packages/shared/src/domain/optimizer.ts)) to
      **five** members, not twelve:
      `z.enum(['dependencies','buildOutput','toolCache','staleWorktree','looseObjects'])`.
      - `'dependencies'` **renames** `'nodeModules'` — a union member that names one ecosystem
        cannot also hold `.venv`, `Pods` and `vendor/bundle`.
      - `'toolCache'` is new and covers `__pycache__`, `.pytest_cache`, `.mypy_cache`,
        `.ruff_cache`, `.tox`, `.gradle`, `.turbo`, `.parcel-cache`, `.moon/cache`, `.moon/docker`.
      - The rename is mechanical and typecheck-enforced everywhere it is a *type*, and
        **grep-enforced in five files where it is a string literal**: `scan-service.test.ts:36`,
        `segmented-bar.test.tsx:17,30,42`, `e2e/optimizer.spec.ts:21`,
        `e2e/optimizer-shots.spec.ts:34`, `e2e/mock-bridge.ts:2400`. `grep -rn "'nodeModules'"
        packages/` must return nothing when the theme is done.
      - Replace the schema's stale docblock (`:12-17`, which still says "the three patterns
        `classify()` actually matches today") with one naming this phase.
- [x] Add `ReclaimCostSchema` with the rule in its docblock:
      ```ts
      /** `cheap`: a local rebuild restores it. `costly`: the network does. */
      export const ReclaimCostSchema = z.enum(['cheap', 'costly']);
      export type ReclaimCost = z.infer<typeof ReclaimCostSchema>;
      ```
      - `node_modules`, `.venv`, `Pods` and `vendor/bundle` are `costly` — deleting them on a plane
        is a different decision than deleting a `dist/`. This is not decoration; Theme D gates
        behaviour on it and [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) imports the type.
- [x] Widen `ScanItemSchema` ([`:26-33`](../../../packages/shared/src/domain/optimizer.ts)) by three
      fields: `detectorId: z.string()`, `ecosystem: EcosystemSchema`, `reclaim: ReclaimCostSchema`.
      `path`, `bytes`, `category` and `repoId` are unchanged and keep their order.
      - `detectorId` is a plain `z.string()` and **not** an enum: the catalogue grows in `desktop/`,
        and forcing every addition through a `shared/` enum edit is the coupling this split exists
        to avoid (Decision 8).
      - All three are **required, not optional**. An optional field would let `walk` forget one and
        still typecheck; three required fields make the `:249` stale-worktree call site a compile
        error until Theme B's `STALE_WORKTREE_DETECTOR` exists.
- [x] Add `detectors` to `ScanResultSchema` — the map that lets a row render prose without
      duplicating it 2,000 times:
      ```ts
      export const DetectorInfoSchema = z.object({ label: z.string(), producer: z.string() });
      // on ScanResultSchema:
      detectors: z.record(z.string(), DetectorInfoSchema),
      ```
      - Keyed by `detectorId`, and **populated only for detectors that actually matched** during
        this scan. `label` and `producer` are what Theme D's rows and confirm copy need; putting
        them on every `ScanItem` would put roughly 100 KB of duplicated prose on the wire at
        `SCAN_ITEMS_CAP`.
      - Rejected alternative: having the renderer import the catalogue. It cannot — `detectors.ts`
        lives in `desktop/` and `packages/app` may not import it
        ([`eslint.config.mjs`](../../../eslint.config.mjs) boundary groups), which is the whole
        reason this map is on the wire.
- [x] Add `byEcosystem: z.record(EcosystemSchema, z.number().nonnegative())` to `ScanResultSchema`
      ([`:41-47`](../../../packages/shared/src/domain/optimizer.ts)) alongside the existing
      `byCategory`.
      - Both roll-ups are computed in `main` during the walk — the renderer receives totals, it does
        not re-aggregate 2,000 items on every render.
      - The two-argument `z.record(keySchema, valueSchema)` form is house style in
        `packages/shared` (`byCategory` at `:43`, `workflow.ts:53`, `blame.ts:29`); zod resolves to
        `3.25.76`, which supports it.
- [x] Add `truncatedRoots: z.array(z.string())` to `ScanResultSchema` — see Theme E item 5 for what
      fills it and Theme D item 9 for what renders it. `truncated: z.boolean()` stays, unchanged, as
      the coarse flag.
- [x] `SCAN_ITEMS_CAP = 2_000` ([`:39`](../../../packages/shared/src/domain/optimizer.ts)) is
      **unchanged**.
      - More detectors means more items, and the cap plus `truncated: true` is the mechanism that
        already covers it. Raising the cap because the scan now finds more things is the wrong
        instinct — Theme D's grouping is what makes 2,000 items legible.
- [x] Update `WalkState` ([`:55-61`](../../../packages/desktop/src/main/optimizer/scan-service.ts))
      and `newWalkState()` (`:63-71`) for the two new roll-ups and the detector map.
      - `byCategory`'s initialiser is a literal with one key per member; **keep both it and the new
        `byEcosystem` literals** (not a computed `reduce`) so a new union member is a typecheck
        failure rather than a silently-missing key. `byEcosystem` gets ten `0` entries.
      - `detectors` starts `{}` and is filled in `addItem`'s caller, not `addItem` — `addItem` takes
        a `ScanItem`, which no longer carries `label`/`producer`.
- [x] Update `addItem` ([`:73-81`](../../../packages/desktop/src/main/optimizer/scan-service.ts)) to
      add `state.byEcosystem[item.ecosystem] += item.bytes;` beside the existing `byCategory` line.
      **The `SCAN_ITEMS_CAP`/`itemsTruncated` behaviour does not change** — the roll-ups still
      accumulate past the cap, so the byte totals stay honest when the item list is truncated.
- [x] Update `scanWorkspace`'s return ([`:266-272`](../../../packages/desktop/src/main/optimizer/scan-service.ts))
      to spread `byEcosystem`, `detectors` and `truncatedRoots` alongside the existing four fields.
      `truncated`'s existing expression (`state.itemsTruncated || state.entriesWalked >=
      MAX_WALK_ENTRIES`) gains `|| state.truncatedRoots.length > 0`.
- [x] No new IPC channel. `optimizerScan`, `optimizerClean` and `optimizerScanProgress`
      ([`channels.ts:299-309`, `:762`](../../../packages/shared/src/ipc/channels.ts)) carry the
      wider payload unchanged; only the schemas in
      [`ipc/schemas.ts:1889-1909`](../../../packages/shared/src/ipc/schemas.ts) widen, and
      `OptimizerScanResponse` widens *by re-export* (`OptimizerResultOf(ScanResultSchema)` is
      already written in terms of the domain schema). Say so in the theme's PR description — "no new
      channels" is a claim reviewers should be able to verify from the diff.
- [x] Widen the e2e mock bridge's fixture type in step with the schema:
      [`mock-bridge.ts:522-548`](../../../packages/app/e2e/mock-bridge.ts)'s
      `MockFixtures['optimizer'].scanResult` and its `byCategory: Record<string, number>` (`:525`),
      and the `byCategory: {}` default at `:2400`, gain `byEcosystem`, `detectors` and
      `truncatedRoots`.
      - Without this every optimizer e2e renders a `ScanResult` missing three fields the tabs now
        read, and the failure surfaces as a blank group list rather than a type error.

### D — A result list that can hold twelve kinds of thing (M) · ✅ DONE (PR #196, 2026-09-06)

Four categories fitted in a flat list. Nine ecosystems do not.

- [x] Replace the two hand-maintained `CATEGORY_ORDER` arrays in
      [`smart-scan-tab.tsx:14-19`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx)
      and [`storage-tab.tsx:9-14`](../../../packages/app/src/features/optimizer/storage-tab.tsx)
      with a **single exported const** in
      [`category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts):
      `export const CATEGORY_ORDER: readonly ScanCategory[]`, five members, `dependencies` first.
      Both tabs import it.
      - Two hand-maintained copies of one ordering is how the fifth member goes missing from one tab.
- [x] Add `ECOSYSTEM_ORDER: readonly Ecosystem[]` to the same file, in `EcosystemSchema`'s own
      member order, plus `ECOSYSTEM_LABELS: Record<Ecosystem, string>`:
      node → `Node`, multi → `Build tooling`, rust → `Rust`, cpp → `C / C++`, dotnet → `.NET`,
      python → `Python`, java → `Java / Kotlin`, swift → `Swift / Xcode`, ruby → `Ruby`,
      git → `Git`.
      - `ECOSYSTEM_ORDER` is asserted to be a permutation of `EcosystemSchema.options` (Theme F), so
        an appended member from Phase 73/74 cannot be forgotten here.
- [x] Add `ECOSYSTEM_HUES: Record<Ecosystem, Hsl>`, `ecosystemHsl`, `ecosystemColor` and
      `ecosystemFill(ecosystem, alpha)` beside the existing category quartet — one palette module,
      two axes. Export the `Hsl` type (`:17`), which is module-private today.
      - Hues, chosen ≥12° from every hue in `CATEGORY_HUES` (350, 115, 20, 265) **and** in
        `METRIC_HUES` (210, 280, 160, 35): node 135 · multi 315 · rust 55 · cpp 185 · dotnet 300 ·
        python 230 · java 100 · swift 78 · ruby 330 · git 245. Saturation 55–70, lightness 45–62,
        matching `CATEGORY_HUES`'s range.
      - This does **not** contradict Decision 3. Ten hues need only be distinguishable *from their
        neighbours in an ordered bar that carries a legend and a per-segment `title` tooltip* — not
        identifiable in isolation, which is what twelve *categories* would have required.
      - Make the separation a test, not a review property: see Theme F.
- [x] Make `SegmentedBar` generic so one component serves both axes.
      [`segmented-bar.tsx:17-25`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx)
      becomes:
      ```ts
      export function SegmentedBar<Id extends string>({ segments, total, label, color, name }: {
        segments: readonly { id: Id; bytes: number }[];
        total: number;
        label: string;
        color: (id: Id) => string;
        name: (id: Id) => string;
      })
      ```
      - **The phase's earlier claim that this component "does not care what `id` means" was wrong**
        — it calls `categoryColor(segment.id)` and `CATEGORY_LABELS[segment.id]` internally. Moving
        those two lookups to props is the smallest change that keeps one component, one set of
        overflow-scaling tests, and the `title` tooltip's `${name(id)}: ${formatBytes(bytes)}` shape.
      - Rejected alternative: a second `EcosystemBar` component. It would duplicate the
        `scale`/`percent` overflow maths (`:26-33`) that
        [`segmented-bar.test.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.test.tsx)
        exists to protect.
      - The existing call site passes `color={categoryColor} name={(id) => CATEGORY_LABELS[id]}`.
- [x] Smart Scan's result list groups **by ecosystem**: `ECOSYSTEM_ORDER.map(...)` replaces
      `CATEGORY_ORDER.map(...)` at
      [`smart-scan-tab.tsx:132-163`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx),
      each group showing its `formatBytes(byEcosystem[eco])` total and a per-group Clean button; the
      existing per-category rows become the **second level inside a group**, keeping their current
      `text-sm text-foreground` label and `text-xs text-muted-foreground` `{count} item(s) — bytes`
      sub-line.
      - The existing `if (count === 0) return null;` guard (`:135`) generalises: an ecosystem whose
        `byEcosystem` total is 0 renders nothing, and a category row inside a group with no items
        renders nothing.
      - **Empty state, when a scan completed and found nothing at all:** the heading already reads
        `Scan complete` (`:84`); the sub-copy `formatBytes(0) + ' reclaimable'` is replaced with the
        literal `Nothing to reclaim — every repo this app manages is already clean.` when
        `result.items.length === 0`. The group list renders nothing, not an empty frame.
      - **Loading state is unchanged**: `Scanning…` plus `Walking every registered repo and
        worktree.` (`:84`, `:86-92`), driven by `optimizerScanProgress`, not a timer.
      - **Error state is unchanged**: `scan.message` in `text-xs text-destructive` (`:125-127`).
- [x] **A `costly` item is never selected by default.**
      - The per-group Clean button cleans that group's `reclaim === 'cheap'` items only; reclaiming
        a `costly` item takes an explicit per-row action.
      - When a group contains skipped `costly` items, the confirm's `warnings` array gains the line
        `N item(s) need a re-download to restore and were left alone — clean them individually.`
      - When a group contains **only** `costly` items, the group's Clean button is `disabled` with
        `title="Every item here needs a re-download to restore — clean them individually."` rather
        than opening a confirm whose `blastRadius.count` is 0 (which would render
        `BLAST_RADIUS_COPY.files.noEffect`, "Nothing is left to clean", and read as a bug).
      - Rationale in Decision 4: one click that deletes every `node_modules`, `.venv` and `Pods` on
        the machine is a twenty-minute reinstall the user did not ask for.
- [x] The confirm keeps `blastRadiusKind: 'files'` and its existing two-part shape — `count` in
      `blastRadius`, bytes in `warnings`
      ([`smart-scan-tab.tsx:47-64`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx)) —
      and `cleanCategory(category)` becomes `cleanEcosystem(ecosystem)` with
      a `title` of ``Clean `${ECOSYSTEM_LABELS[ecosystem]}?` `` and `confirmLabel: 'Move to Trash'`.
      - Add a **producers** line to `warnings`, built from `result.detectors`: the distinct
        `producer` strings of the detectors whose items are in the selection, comma-joined, as
        *"cargo build and gradle build will need to run again."* (Oxford-free `and` join; cap at
        four producers plus `and N more` so the box cannot grow unbounded.)
      - `warnings` order is fixed: bytes first (the existing `${formatBytes(bytes)} will be
        freed.`), then producers, then the `costly`-skipped line. That is the order a user reads
        them — what I gain, what it costs, what I did not get.
      - `blastRadius.sample` stays `[]`: `sample` is git-only (`{sha, subject}`) and there is
        nothing shaped like a commit here — the same reasoning the existing comment at `:47-53`
        gives.
- [x] Storage tab gains a second `SegmentedBar` keyed on ecosystem, rendered **above** the existing
      category one at [`storage-tab.tsx:34`](../../../packages/app/src/features/optimizer/storage-tab.tsx),
      labelled `Reclaimable storage by ecosystem`; the existing bar keeps its
      `Reclaimable storage by category` label.
      - Ecosystem above category because the ecosystem is what the user recognises ("my Rust
        projects"); the category is the technical refinement.
      - **The label is an accessibility name, not decoration:** `SegmentedBar` renders
        `role="img" aria-label={label}` (`:32-33`), and
        [`optimizer-shots.spec.ts:175,185`](../../../packages/app/e2e/optimizer-shots.spec.ts)
        already locate the existing bar with
        `getByRole('img', { name: 'Reclaimable storage by category' })`. The two labels must stay
        distinct strings so neither locator becomes ambiguous — keep the existing one verbatim.
        [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Theme E's System bar takes a third,
        `System caches by ecosystem`; do not reuse it.
      - The bottom legend `<ul>` (`:63-74`) gains a matching ecosystem legend above the category
        one, both rendered from their `*_ORDER` + `*_LABELS` pairs.
- [x] Storage tab's per-item rows ([`:36-61`](../../../packages/app/src/features/optimizer/storage-tab.tsx))
      show the detector `label` above the path rather than the path alone — a row reading
      `~/Dev/api/target` tells the user nothing that `Cargo target/` above
      `~/Dev/api/target` does not tell them better.
      - Label in `text-sm text-foreground`; path stays in `truncate font-mono text-xs
        text-foreground` (`:56`) exactly as today; the `selectRepo(item.repoId)` deep-link
        behaviour is unchanged.
      - Label source is `result.detectors[item.detectorId]?.label ?? item.detectorId` — a
        `??`-guarded lookup, because a `ScanResult` replayed from an older mock fixture would
        otherwise render `undefined`.
- [x] The truncated notice at
      [`smart-scan-tab.tsx:167-171`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx)
      keeps its current sentence and **appends the repo names** when `truncatedRoots` is non-empty:
      `This scan hit its bounds and stopped early — some reclaimable space may not be shown.` then
      `Cut short: <basename>, <basename>` for up to three roots, `and N more` beyond that.
      - Basenames, not full paths — the full path is already visible on every row and a wrapped
        absolute path in a muted footnote is unreadable.
- [x] Every icon in the new UI comes from `react-icons`, imported per set. **Never `lucide-react`** —
      [`eslint.config.mjs`](../../../eslint.config.mjs) fails the build on it.
      - If ecosystem marks use `react-icons/si` (`SiRust`, `SiPython`, `SiDotnet`, …), **add
        `['si', 'Si', Si, 1]` to the `SETS` table at
        [`icon-names.test.ts:59-62`](../../../packages/app/src/components/icons/icon-names.test.ts)
        and the matching `import * as Si from 'react-icons/si'`** — that test covers only `lu` and
        `go` today, so a `si` import is currently unasserted.
      - Simpler alternative, and the one to take unless the marks demonstrably help (Decision 15): **no ecosystem
        icons at all.** The group header already carries a label and a coloured swatch; nine brand
        glyphs is nine more things to keep aligned at two row heights for no information gain.
        Ship without them and revisit only if a screenshot pass says the list reads flat.

### E — Budgets, per-ecosystem settings, and the `.moon` fix (S) · ✅ DONE (PR #196, 2026-09-06)

- [x] **Retire the `.moon` detector and say why in the code.**
      `DEFAULT_BUILD_ARTIFACT_PATTERNS`'s `{ basename: '.moon', category: 'buildOutput' }`
      ([`scan-service.ts:43`](../../../packages/desktop/src/main/optimizer/scan-service.ts)) is
      deleted along with the whole constant, replaced by the two `.moon/cache` and `.moon/docker`
      suffix detectors from Theme B.
      - Leave a comment in `detectors.ts` naming the old entry and the `.gitignore:5-6` lines that
        prove the boundary, so nobody re-adds the short form as a "simplification".
      - *Done when:* a scan of this repo produces a `moon-cache` item and no item whose path ends
        `/.moon` — asserted in Theme F and listed in Verification.
- [x] Add `MAX_ENTRIES_PER_ROOT = 50_000` to
      [`scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) and enforce
      it through a **per-root baseline on `WalkState`**, not a second `if` at one call site.
      - `WalkState` gains `entriesAtRootStart: number` and `perRootLimit: number`;
        `newWalkState()` defaults `perRootLimit` to `Number.POSITIVE_INFINITY`, and
        `scanWorkspace` sets `state.perRootLimit = MAX_ENTRIES_PER_ROOT` once before its loop and
        `state.entriesAtRootStart = state.entriesWalked` at the top of each iteration (`:241-254`).
      - Add `function budgetExhausted(state: WalkState): boolean` returning
        `state.entriesWalked >= MAX_WALK_ENTRIES ||
         state.entriesWalked - state.entriesAtRootStart >= state.perRootLimit`, and replace **all
        five** existing `state.entriesWalked >= MAX_WALK_ENTRIES` comparisons (`:111`, `:117`,
        `:148`, `:152`, and `scanWorkspace`'s loop guard) with it. `dirBytes` must consult it too —
        it increments the same counter at `:118`, so a cap that ignored it would not bind.
      - **`newWalkState()`'s infinite default is load-bearing:** `cleanItems` calls
        `dirBytes(confined, newWalkState(), …)` at `:330` to size an item the user has already
        confirmed. A 50,000-entry cap there would under-report `freedBytes` for exactly the large
        `node_modules` this phase exists to find. This is why the limit lives on the state rather
        than being read from the module constant inside the loops — and it keeps `cleanItems`'s own
        source lines byte-identical.
      - Today one pathological repo early in `collectRoots()`'s order can consume the entire
        200,000-entry budget and every later repo silently reports zero. With three detectors that
        was unlikely; with twenty-four candidate names it is not. The per-root budget makes the
        failure *partial and visible* rather than *total and silent*.
- [x] Fill `truncatedRoots` where the per-root budget bites: after each root's `walk`/`dirBytes`
      returns in `scanWorkspace`'s loop, if
      `state.entriesWalked - state.entriesAtRootStart >= state.perRootLimit`, push `root.path`.
      - Pushed once per root, never duplicated; an abort mid-root does **not** push (the scan was
        cancelled, not truncated, and labelling it "cut short" would be a lie).
- [x] Raise `MAX_WALK_ENTRIES` from `200_000` to `500_000` and restate the docblock's justification
      in entries-per-second terms **measured on a real machine, not asserted**.
      - Measure with a throwaway script over this repo plus two large checkouts and put the number
        in the docblock: *"~N entries/second on an M-series laptop, so 500,000 is a worst case of
        about X seconds."* A `readdir`-driven walk that skips matched directories rather than
        descending them (`walk`'s `continue` at
        [`:170`](../../../packages/desktop/src/main/optimizer/scan-service.ts)) is cheap per entry;
        the number should follow the measurement.
      - If the measurement says 500,000 costs more than a second or two, **lower it** — the per-root
        cap delivers the fairness property on its own (Decision 6).
- [x] `MAX_WALK_DEPTH = 12` ([`:22`](../../../packages/desktop/src/main/optimizer/scan-service.ts))
      is **unchanged**, and so is `PROGRESS_EVERY_ENTRIES = 50` (`:26`).
      - Every detector in Theme B's catalogue sits within a few levels of a project root, and the
        depth bound is what stops a symlink-free but pathological tree. If a real repo turns out to
        need more, raise it with the repo named in the commit message.
      - The progress callback still reports `(state.entriesWalked, MAX_WALK_ENTRIES)`, so raising
        the global bound changes what a given percentage means but not the mechanism.
- [x] Per-ecosystem opt-out in
      [`optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx):
      a `disabledEcosystems: Ecosystem[]` preference, default `[]` (everything on), rendered as one
      `<Field label="Ecosystems to scan" hint="…">` containing nine checkboxes in
      `ECOSYSTEM_ORDER` (`'git'` excluded — stale worktrees are not an opt-out).
      - Match the page's existing control style exactly: a bare
        `<input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />` inside a
        `<label className="flex items-center gap-2 text-xs">`, as `optimizerEnabled` does at
        `:26-32`. `Field` takes `label: string`, `hint: string`, `children: ReactNode` — nothing else.
      - **Store the disabled set, not the enabled set**, and cite `hiddenMetrics`'s docblock
        ([`ui-store.ts:936-944`](../../../packages/app/src/store/ui-store.ts)) as the reason: an
        allowlist persisted before a member existed silently hides it for every existing user. This
        matters concretely here — Phase 73 adds `'go'` and Phase 74 adds `'media'`, and both must
        appear by default for someone who upgrades.
- [x] Persist `disabledEcosystems` following `hiddenMetrics` exactly — **seven edits across two
      files, and the seventh is the one everybody forgets.**
      - Six in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts): interface member and
        `toggleEcosystem(id: Ecosystem)` setter beside `:936-944`; `PersistedUi` `Pick<>` member
        beside `:1254`; default `[]` beside `:1308`; the setter implemented as `hiddenMetrics`'s
        `includes`/`filter`/spread toggle at `:1719-1723`; `partialize` entry beside `:1790`.
      - **The seventh is [`packages/app/src/store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts)** —
        add `'disabledEcosystems', // optimizer-settings-page.tsx` to `PREFERENCE_KEYS`, beside
        `'hiddenMetrics'` (`:40`) and `'optimizerEnabled'` (`:46`). Omitting it is a **typecheck
        failure**, not a lint nit: `AssertExactPartition` at `:158-163` requires the key set and
        `keyof PersistedUi` to be mutually exhaustive. And `persisted-keys.test.ts:95-100` further
        asserts every non-orphan preference key appears *literally, as that string* in some file
        under `features/settings/` — which Theme E's checkbox group satisfies only if the key is
        spelled out there rather than reached through a computed accessor.
      - **Do not bump `version: 9`** (`:1750`) and do not write a `migrate` arm.
        `allowForceWithLease`, `launchAndRunEnabled`, `optimizerEnabled` and `hiddenMetrics` were
        all added without one, because zustand's default merge supplies the default for an older
        blob (`ui-store.test.ts:419-429` states why). An array default merges the same way a
        boolean does.
- [x] The setting is applied in **main**, not the renderer.
      - `OptimizerScanRequest` ([`schemas.ts:1889-1892`](../../../packages/shared/src/ipc/schemas.ts))
        gains `disabledEcosystems: z.array(EcosystemSchema).optional()` — house style is a bare
        `.optional()` with no `.default()`, matching `extraRoot` beside it.
      - `optimizer-handlers.ts`'s `optimizerScan` handler (`:21-51`) passes it into
        `scanWorkspace`; `scanWorkspace` computes
        `const detectors = opts.detectors ?? DEFAULT_DETECTORS.filter((d) =>
        !(opts.disabledEcosystems ?? []).includes(d.ecosystem));` **once, before the root loop**,
        and threads it into `walk` (Theme A item 9).
      - Filtering after the walk would spend the entry budget finding things the user asked not to
        see — which is the whole point of a budget that is now enforced per root.
      - An explicit `opts.detectors` (the test seam) **wins over** `disabledEcosystems`; say so in
        the docblock so a fixture that passes both is not a puzzle.
- [x] Update the settings page's "What this still never does" `<ul>`
      ([`:38-43`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx))
      by adding a fourth `<li>`, keeping the existing three verbatim:
      *"Only directories a build tool recreates on demand — never source, never configuration,
      never anything outside a repo this app manages."*
      - Also update `optimizerEnabled`'s `hint` string (`:23`) — it still says "Smart Scan, Storage,
        Memory and GPU tabs", which is accurate, so leave it; the new boundary belongs in the list,
        not the hint.

### F — Verification (M) · ◐ PARTIAL (PR #196, 2026-09-06; PR #202, 2026-09-06 closed the
stale `DETECTOR_COUNT` literal — one item stays genuinely open: the human pass over real
Rust/Gradle/Python checkouts, appears twice for the same reason)

- [x] `detectors.test.ts` — the ordering invariant from Theme A asserted over `DEFAULT_DETECTORS`:
      no `{kind:'none'}` detector precedes a detector sharing a `match` suffix with it.
      **Assertion:** the O(n²) pair scan finds zero violations, and a deliberately mis-ordered
      two-entry array passed to the same helper throws.
- [x] `detectors.test.ts` — `producer` presence: `expect(DEFAULT_DETECTORS.every((d) =>
      d.producer.trim().length > 0)).toBe(true)`, plus the same assertion on
      `STALE_WORKTREE_DETECTOR`, which is not in the array. That is the scope guardrail made
      mechanical.
- [x] `detectors.test.ts` — `expect(DEFAULT_DETECTORS).toHaveLength(DETECTOR_COUNT)` and
      `expect(DETECTOR_COUNT).toBe(28)`; plus `expect(new Set(DEFAULT_DETECTORS.map(d => d.id)).size)
      .toBe(DEFAULT_DETECTORS.length)` — ids are unique, because `detectorId` keys the
      `result.detectors` map.
      - **Closed in PR #202:** the real `DETECTOR_COUNT` is 28, not the phase brief's stale
        24 — Theme B's own done.md entry already corrected this figure. The existing test only
        asserted `DEFAULT_DETECTORS.toHaveLength(DETECTOR_COUNT)` (a tautology against itself) plus
        the id-uniqueness check; a `toBe(28)` literal pin was added alongside it.
- [x] `detectors.test.ts` — `matchesPathSuffix` and `matchesFileSuffix` unit cases exactly as
      Theme A items 4 and 5 enumerate them, including the `/bundle` shorter-than-suffix case and the
      mid-string `.csproj` case.
- [x] `detectors.test.ts` — every `EvidenceRule` arm against a real fixture tree, positive **and**
      negative, using the `mkdtemp` + `realpath` + `afterAll(rm)` harness shape from
      [`scan-service.test.ts:87-95`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts).
- [x] `scan-service.test.ts` — **the negative-match fixture set, which is the half that matters**:
      `bin/` beside a `package.json`; `build/` with no `CMakeCache.txt` and no `build.gradle`;
      `venv/` with no `pyvenv.cfg`; `vendor/` with a `Gemfile` but no `bundle/` under it; `.moon/`
      containing `workspace.yml`; `target/` with no `Cargo.toml` and no `pom.xml`.
      **Assertion:** `result.items` is `[]` and `result.totalBytes === 0` for each. A test suite for
      a deleter that only asserts what it finds is testing the wrong direction.
- [x] `scan-service.test.ts` — a positive fixture per ecosystem in Theme B, asserting the item's
      `detectorId`, `ecosystem`, `category` and `reclaim`, not just that something was found; and
      that `result.detectors[detectorId]` carries the catalogue's `label` and `producer`.
- [x] `scan-service.test.ts` — the two ambiguous-name cases explicitly: `target/` beside
      `Cargo.toml` classifies as `rust-target`, `target/` beside `pom.xml` as `maven-target`, and
      `target/` beside **both** resolves to `rust-target` (Rust precedes Java in
      `DEFAULT_DETECTORS`). Assert the actual id, so a reorder is a failing test rather than a
      silent behaviour change.
- [x] `scan-service.test.ts` — `a detector never matches inside .git`: a fixture with
      `.git/node_modules/x.js` yields zero items, proving the `:158` guard still sits above
      `classify`.
- [x] `scan-service.test.ts` — the injected-catalogue seam, rewritten from `honors an injected
      pattern list over the default` (`:45-50`): `classify('/a/build', new Set(), [buildDetector])`
      returns that detector and `classify('/a/node_modules', new Set(), [buildDetector])` returns
      `null`. Same intent, new argument shape — do not delete the test, port it.
- [x] `scan-service.test.ts` — `scanWorkspace({ …, detectors: [oneDetector] })` produces items only
      for that detector, proving Theme A item 9's plumbing reaches `classify`.
- [x] `scan-service.test.ts` — `MAX_ENTRIES_PER_ROOT`: a two-root fixture where the first root
      exceeds the per-root budget. **Assertions:** the second root still yields items; `truncatedRoots`
      contains the first root's path and not the second's; `truncated` is `true`.
      - Keep the fixture cheap by injecting a low `perRootLimit` through a test-only
        `ScanWorkspaceOptions` field rather than materialising 50,000 real directory entries.
- [x] `scan-service.test.ts` — **update the abort test at `:170-190`**, which asserts an exact
      literal `{ totalBytes: 0, byCategory: {…four keys…}, items: [], truncated: false }`. It gains
      the ten-key `byEcosystem` literal, `detectors: {}` and `truncatedRoots: []`. This is the one
      existing assertion the widening breaks, and it must still assert an exact literal (not
      `objectContaining`) — the point of that test is that an aborted scan returns a *complete,
      valid* `ScanResult`.
- [x] `scan-service.test.ts` — `disabledEcosystems: ['python']` yields no Python items from a tree
      that otherwise produces them, and the same tree with `disabledEcosystems: []` does.
- [x] `scan-service.test.ts` — the stale-worktree item carries
      `detectorId: 'git-stale-worktree'`, `ecosystem: 'git'`, `reclaim: 'cheap'`, and
      `result.byEcosystem.git` equals its bytes. Reuse the existing `staleWorktreeCandidates`
      mocking at `:53-81`.
- [x] `optimizer-handlers.test.ts` — the existing `trashItem` assertions (`:54`
      `expect(trashItem).toHaveBeenCalledWith('/root/node_modules')`, `:64`
      `expect(trashItem).not.toHaveBeenCalled()`) still pass **unchanged**. This phase must not
      touch the delete path; a diff in that test is a red flag. Add one new case: an
      `optimizerScan` invoke carrying `disabledEcosystems: ['rust']` reaches `scanWorkspace` with
      that field, proving the handler forwards it.
- [x] `optimizer-store.test.ts` — **add** a `removeScanItem` test (the store has the action at
      `:64-78` but no test covers it today): a `ScanResult` with the widened `ScanItem` shape loses
      exactly the removed path and keeps `byCategory`/`byEcosystem` untouched, and
      `expect(localStorage.length).toBe(0)` still holds after it — the existing
      `the store never touches localStorage` assertion (`:49-57`) gains one more call.
- [x] `category-palette.test.ts` (**net-new**) — the hue-separation property made mechanical:
      for every hue in `ECOSYSTEM_HUES`, its shortest arc to every hue in `CATEGORY_HUES` and in
      `METRIC_HUES` is `>= 12`. Plus `expect(ECOSYSTEM_ORDER.slice().sort()).toEqual(
      EcosystemSchema.options.slice().sort())` and the same for `CATEGORY_ORDER` against
      `ScanCategorySchema.options` — an appended enum member from Phase 73/74 cannot be forgotten in
      the ordering array.
- [x] `segmented-bar.test.tsx` — updated for the generic props (`color`, `name` now required) and
      the renamed `'dependencies'` literal at `:17`, `:30`, `:42`. Its overflow-scaling assertions
      are unchanged, which is the evidence the refactor was mechanical. Add one case rendering an
      `Ecosystem`-keyed bar, proving the generic actually admits a second id type.
- [x] `smart-scan-tab.test.tsx` (**net-new**) — the renderer unit test, following
      [`video-project-list.test.tsx:1-52`](../../../packages/app/src/features/video/video-project-list.test.tsx)'s
      shape: stub `window.midniteStudio`, wrap in
      `<QueryClientProvider><DialogHost>…</DialogHost></QueryClientProvider>`, `fireEvent` through
      to the confirm button, `waitFor` the bridge call.
      **Assertions:** a `ScanResult` with one `costly` and two `cheap` items in one ecosystem
      produces a group-Clean confirm whose `blastRadius.count` is **2**; its `warnings` contain a
      bytes line, a producers line naming both producers, and the `need a re-download` line
      mentioning **1** item; and `optimizer.clean` is called with exactly the two cheap paths.
- [x] `smart-scan-tab.test.tsx` — the all-`costly` group renders a **disabled** Clean button and
      opens no dialog on click; and a completed scan with zero items renders
      `Nothing to reclaim — every repo this app manages is already clean.`
- [x] `packages/app/e2e/optimizer.spec.ts` and
      [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) — updated for the renamed
      `'nodeModules'` literal (`optimizer.spec.ts:21`, `mock-bridge.ts:2400`) and the three new
      `ScanResult` fields (`mock-bridge.ts:522-548`). The existing
      `a scan hands its ScanResult to Storage` test (`:126`) must pass unchanged in intent.
- [x] `packages/app/e2e/optimizer-shots.spec.ts` — refresh the Smart Scan and Storage shots in light
      and dark against a seeded **multi-ecosystem** fixture (at minimum node + rust + python, one
      `costly` among them), so the grouped list and the two segmented bars are both captured.
      - Output paths stay `docs/screenshots/p59-abce/optimizer-smart-scan-{light,dark}.png` and
        `optimizer-storage-{light,dark}.png`; keep `installShotsBridge` + `seedOptimizerEnabled`
        (`:114-121`) and the existing `goDark`/`paintDark` two-step (`:140-146`) exactly as they are.
      - Add an assertion for the new ecosystem bar,
        `getByRole('img', { name: 'Reclaimable storage by ecosystem' })`, beside the existing
        category-bar assertions at `:175` and `:185`.
      - `seedOptimizerEnabled` writes `{ version: 8 }` at `:117` while
        [`ui-store.ts:1750`](../../../packages/app/src/store/ui-store.ts) is `version: 9` — a stale
        seed that survives only because there is no `migrate` arm to trip over it. Fix it to `9` in
        passing **unless [Phase 74](phase-74-media-caches-and-the-trash.md) has already landed the
        same one-character change**, in which case leave it alone rather than conflict.
- [x] `moon run :typecheck :lint :test` green. The `ScanCategory` rename is the item most likely to
      leave a stale `Record`; the exhaustiveness of `CATEGORY_HUES`/`CATEGORY_LABELS`/
      `ECOSYSTEM_HUES`/`ECOSYSTEM_LABELS` is what catches it, so do not soften any of them to
      `Partial`. `grep -rn "'nodeModules'" packages/` must return nothing.
- [ ] **Human pass:** run a scan against a checkout containing a real Rust, Gradle and Python
      project and confirm each is found with correct bytes; then confirm a repo with a hand-written
      `build/` and a hand-written `bin/` produces **nothing**.
      - **Genuinely open:** this needs a human with real external Rust/Gradle/Python checkouts on
        disk; it was not exercised by this session's build or its automated verification.

---

## Files this phase touches

**New**
- `packages/desktop/src/main/optimizer/detectors.ts` — `ArtifactDetector`, `DetectorId`,
  `EvidenceRule`, `DEFAULT_DETECTORS`, `DETECTOR_COUNT`, `STALE_WORKTREE_DETECTOR`,
  `matchesPathSuffix`, `matchesFileSuffix` (A, B).
- `packages/desktop/src/main/optimizer/detectors.test.ts` — ordering invariant, `producer`
  presence, id uniqueness, count, every evidence arm (A, F).
- `packages/app/src/features/optimizer/category-palette.test.ts` — the hue-separation assertion and
  the `*_ORDER`-is-a-permutation assertions (D, F).
- `packages/app/src/features/optimizer/smart-scan-tab.test.tsx` — the group-clean confirm, the
  all-`costly` disabled button, the zero-item empty copy (D, F).

**Changed**
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `classify` becomes async, sibling-set-taking and detector-returning; `BuildArtifactPattern` and
  `DEFAULT_BUILD_ARTIFACT_PATTERNS` deleted; `walk` builds the sibling set once per directory and
  takes a `detectors` parameter; `budgetExhausted` replaces five inline comparisons;
  `MAX_ENTRIES_PER_ROOT`; `MAX_WALK_ENTRIES` raised; `byEcosystem`/`detectors`/`truncatedRoots`
  roll-ups; the `:249` stale-worktree item built from `STALE_WORKTREE_DETECTOR` (A, B, C, E).
  **`cleanItems` and `knownRoots` keep byte-identical source** — that is
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md).
- [`packages/desktop/src/main/optimizer/scan-service.test.ts`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts) —
  negative-match fixtures, per-ecosystem positives, ambiguity, `.git` refusal, the ported injected
  seam, per-root budget, the widened abort literal at `:170-190` (F).
- [`packages/desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  the `optimizerScan` handler (`:21-51`) forwards `disabledEcosystems` into `scanWorkspace`. **The
  `shell.trashItem` wiring at `:58` and the whole `optimizerClean` handler do not move** (E).
- [`packages/desktop/src/main/ipc/optimizer-handlers.test.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.test.ts) —
  one added forwarding case; the two `trashItem` assertions unchanged (F).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `EcosystemSchema`/`Ecosystem`, `ReclaimCostSchema`/`ReclaimCost`, `DetectorInfoSchema`, widened
  `ScanCategorySchema` and `ScanItemSchema`, `byEcosystem`/`detectors`/`truncatedRoots` on
  `ScanResultSchema`, refreshed docblock at `:12-17` (C, E).
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) —
  `OptimizerScanRequest` gains `disabledEcosystems?` (E). **No channel added** to
  [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts).
- [`packages/app/src/features/optimizer/category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
  the single `CATEGORY_ORDER`, `ECOSYSTEM_ORDER`, `ECOSYSTEM_LABELS`, `ECOSYSTEM_HUES`,
  `ecosystemHsl`/`ecosystemColor`/`ecosystemFill`, `Hsl` exported (D).
- [`packages/app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  generic over `Id extends string` with `color`/`name` props; the scaling maths untouched (D).
- [`packages/app/src/features/optimizer/components/segmented-bar.test.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.test.tsx) —
  new props, renamed literal, one ecosystem-keyed case (D, F).
- [`packages/app/src/features/optimizer/smart-scan-tab.tsx`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx) —
  ecosystem grouping, `cleanEcosystem` replacing `cleanCategory`, the `cheap`-only group clean, the
  producer and `costly`-skipped warning lines, the zero-item empty copy, the named truncated roots (D).
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  the second `SegmentedBar` and its legend, detector labels on rows (D).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
  the nine per-ecosystem checkboxes in one `Field`, the fourth `<li>` on the boundary list (E).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  `disabledEcosystems` + `toggleEcosystem`, five edits following `hiddenMetrics`, **no `version`
  bump and no `migrate` arm** (E).
- [`packages/app/src/store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) —
  `'disabledEcosystems'` added to `PREFERENCE_KEYS`; omitting it fails `AssertExactPartition`
  (`:158-163`) at typecheck (E).
- [`packages/app/src/store/optimizer-store.test.ts`](../../../packages/app/src/store/optimizer-store.test.ts) —
  a `removeScanItem` test over the widened `ScanItem` (F).
- [`packages/app/src/components/icons/icon-names.test.ts`](../../../packages/app/src/components/icons/icon-names.test.ts) —
  **only if** ecosystem marks ship: a `['si','Si',Si,1]` row in the `SETS` table at `:59-62` (D).
- [`packages/app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) —
  `MockFixtures['optimizer'].scanResult` gains `byEcosystem`/`detectors`/`truncatedRoots`; the
  `byCategory` default at `:2400` renamed (C, F).
- [`packages/app/e2e/optimizer.spec.ts`](../../../packages/app/e2e/optimizer.spec.ts) —
  the `'nodeModules'` literal at `:21` and the fixture at `:16`, `:24` (F).
- [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts) —
  a multi-ecosystem fixture and refreshed shots (F).

**Deliberately unchanged**
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineTree(root, target): Promise<string | null>` (`:215-225`) is exactly right for
  repo-confined deletion and is not touched here (**unchanged**).
- [`packages/desktop/src/main/optimizer/scan-service.ts`'s `cleanItems`/`knownRoots`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `:297-351` keeps byte-identical source; `newWalkState()`'s infinite per-root default is what makes
  that possible (**unchanged**).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) — all six
  optimizer channels (`:299-309`, `:762`) (**unchanged**).
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BLAST_RADIUS_COPY`'s `files` arm and `warnings` rendering already do everything Theme D needs
  (**unchanged, and load-bearing**).
- [`packages/app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) —
  `removeScanItem` (`:64-78`) filters on `path` and is agnostic to the widened item; still
  unpersisted (**unchanged**).
- [`packages/app/src/features/monitor/metric-palette.ts`](../../../packages/app/src/features/monitor/metric-palette.ts) —
  `METRIC_HUES` is read by the new hue-separation test and is not edited (**unchanged**).
- [`packages/git-engine/`](../../../packages/git-engine) — gains nothing, per the guardrail
  (**unchanged**).

---

## Verification

- [x] `moon run :typecheck :lint :test` green, and `grep -rn "'nodeModules'" packages/` returns
      nothing.
- [x] `DEFAULT_DETECTORS` has 28 entries, unique ids, no empty `producer`, and no evidence-free
      detector shadowing an evidenced one — all four asserted in `detectors.test.ts`.
      - **Closed in PR #202:** the real count is 28 (Theme B's done.md entry already corrected
        this stale "24"); `detectors.test.ts` now pins `expect(DETECTOR_COUNT).toBe(28)` alongside
        the existing uniqueness, non-empty-`producer`, and no-shadowing assertions.
- [x] Every negative fixture in Theme F produces **zero** items and `totalBytes === 0`.
- [x] A scan of this repo finds `.moon/cache` as `moon-cache` and produces **no** item whose path
      ends `/.moon`.
- [x] `target/` beside both `Cargo.toml` and `pom.xml` resolves to `rust-target`, asserted by id.
- [x] A two-root scan that exhausts the first root's budget still returns items from the second, and
      names only the first in `truncatedRoots`.
- [x] An aborted scan still returns a complete, schema-valid `ScanResult` — the `:170-190` literal,
      widened.
- [x] `cleanItems`'s and `knownRoots`'s source diff is empty; `optimizer-handlers.test.ts`'s two
      `trashItem` assertions are unchanged.
- [x] No `ScanItem` produced by any test resolves outside a fixture root.
- [x] Every `ECOSYSTEM_HUES` hue is ≥12° from every `CATEGORY_HUES` and `METRIC_HUES` hue, and both
      `*_ORDER` arrays are permutations of their enums — asserted in `category-palette.test.ts`.
- [x] A group containing one `costly` and two `cheap` items cleans **2** paths, and the confirm's
      `warnings` name the bytes freed, the producers that must run again, and the one item left
      behind.
- [x] An all-`costly` group's Clean button is disabled and opens no dialog.
- [x] A completed scan with zero items renders `Nothing to reclaim — every repo this app manages is
      already clean.`, not an empty frame.
- [x] `disabledEcosystems` appears in `persisted-keys.ts`'s `PREFERENCE_KEYS` and literally in
      `optimizer-settings-page.tsx` — `AssertExactPartition` and `persisted-keys.test.ts:95-100`
      both pass with no new `KNOWN_ORPHANS` entry.
- [x] The Storage tab exposes exactly two `role="img"` bars, named `Reclaimable storage by
      ecosystem` and `Reclaimable storage by category`; the existing shots-spec locators at
      `optimizer-shots.spec.ts:175,185` still resolve unambiguously.
- [x] Smart Scan and Storage shots refreshed in both themes against a multi-ecosystem fixture.
- [ ] **Open, for a human:** real Rust + Gradle + Python checkout found correctly with plausible
      bytes; hand-written `build/`/`bin/` found not at all.
      - **Genuinely open** — same gap as Theme F's own human-pass item; needs real external
        checkouts this session did not have.
- [x] **Open, for a human:** the `MAX_WALK_ENTRIES` docblock quotes a measured entries-per-second
      figure from this machine, not an asserted one (Theme E item 4).

---

## Not in this phase

- **Anything outside a repo root.** `~/Library/Caches`, `~/.cargo`, `~/.gradle`, `~/.m2`,
  `~/.nuget`, `GOCACHE`, `GOMODCACHE`, Xcode DerivedData, Homebrew's cache, browser caches — all
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md). Its confinement primitive
  (`confineAllowlist`) is deliberately a *different* one from `confineTree`, which is why the split
  is a phase boundary and not a flag.
- **Vendor reclaim commands** (`go clean -cache`, `pnpm store prune`, `brew cleanup -s`).
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Theme D, where the caches that require them
  live.
- **Media caches and Empty Trash.** [Phase 74](phase-74-media-caches-and-the-trash.md).
- **A `'go'` or `'media'` member on `EcosystemSchema`.** Both are appended by the phase that ships
  something belonging to them — 73 and 74 respectively — because an enum member with no detector is
  a legend row with a zero beside it forever.
- **PHP (`vendor/` + `composer.json`), Elixir (`_build`, `deps`), Dart/Flutter (`.dart_tool`,
  `build/`), Haskell (`.stack-work`, `dist-newstyle`).** Each is one catalogue entry in the shape
  Theme A defines; none was asked for, and a catalogue nobody has a repo to test against is a
  catalogue of guesses. Add them when someone has the repo.
- **A `childAll` or glob `EvidenceRule` arm.** Every one of Theme B's twenty-four entries is
  expressible in the four arms that ship; an arm nobody uses is an arm nobody tests.
- **Per-detector exclusion lists.** `.moon/cache` is handled by making the *match* two segments;
  no case in the catalogue needs more. See Decision 9.
- **Raising `SCAN_ITEMS_CAP`.** Finding more things is a reason to group them, not a reason to send
  more of them across IPC.
- **Docker images and volumes.** A different daemon, a different permission model, and a delete
  with no Trash to undo it.
- **`looseObjects`.** Still zero, still for the reason Phase 59's Decision 11 gives: `readHealth`
  returns a combined packed+loose byte figure, and the guardrail says git-engine gains nothing. The
  enum member and its palette entry stay so the union does not churn again when a later phase fills it.
- **Automatic or scheduled scanning.** Every scan stays user-initiated.
- **A concurrent/parallel walk.** `optimizer-handlers.ts:21-51` makes a scan single-flight by
  aborting the previous controller; parallelising roots would need the entry budget to become
  atomic, and the budget's fairness property is the point of Theme E.

---

## Decisions / open questions

Decisions 1–9 were **chosen without the human on 2026-09-05** — this phase was written from a single
brief with no one available to consult. Decisions 10–15 were added by the x2 refinement on the same
day, on the same terms. Each records the recommendation that was taken and why, so a later refine
can reverse it with the reasoning in view.

1. **Resolved — an `evidence: {kind:'none'}` detector must have a dotted, tool-namespaced name, or
   be one of the two grandfathered exceptions.** The rule that admits them: *a leading dot plus a
   tool-namespaced name is not a name a human gives a source directory.* That covers `.next`,
   `.turbo`, `.parcel-cache`, `.svelte-kit`, `.nuxt`, `.vite`, `.pytest_cache`, `.mypy_cache`,
   `.ruff_cache`, `.tox`, `.gradle`, `.moon/cache`, `.moon/docker`. `node_modules` and
   `__pycache__` are grandfathered on the same reasoning — nobody names a source folder either. Any
   *undotted, non-namespaced* basename needs evidence: `dist` is undotted and therefore gated on
   `package.json` even though it is the most common of all, and SwiftPM's `.build` is dotted but
   *not* namespaced, so it is gated too. Reason for the rule rather than a fixed list: a fixed
   count ("four and no more") is wrong the moment a twelfth dotted tool name is correct, and a rule
   can be applied by the next person without reopening this decision.
2. **Resolved — `classify` becomes async.** The alternative — pre-collect all evidence during the
   walk and keep `classify` pure — was considered and rejected: it moves filesystem knowledge into
   `walk`, which is the security-critical function, to keep purity in the function that is merely a
   lookup. The sibling set stays a pure argument (a `ReadonlySet<string>` the caller builds), so the
   only impurity is the `childAny` `readdir`, and it is confined to one arm.
3. **Resolved — one `ScanCategory` axis of five, plus an orthogonal `Ecosystem` axis — not twelve
   categories.** A twelve-member category union would need twelve palette hues distinguishable from
   each other *and* from `METRIC_HUES`, and would put twelve rows in a flat list. The ecosystem axis
   groups; the category axis colours *within* a legend-bearing bar. **Amended by the x2 refinement:**
   the ecosystem axis does get ten hues, because a segment in an *ordered bar with a legend and a
   per-segment tooltip* only needs to be distinguishable from its neighbours — a much weaker
   requirement than identifying one of twelve categories in isolation. The 12° separation minimum is
   now asserted in `category-palette.test.ts` rather than left to review. Reversing the axis split
   later means one enum edit and one palette rewrite.
4. **Resolved — `costly` items are excluded from every group/bulk clean and take a per-row action.**
   The alternative — a "select all" with `costly` rows pre-checked — makes the destructive default
   the easy one, which is the opposite of every other confirm in this app. The cost of the chosen
   option is one extra click per `node_modules`; the cost of the alternative is an unintended
   twenty-minute reinstall. This is a stronger position than Phase 59 took, where all four
   categories were equally bulk-cleanable — `node_modules` becoming `costly` is a deliberate,
   user-visible behaviour change and belongs in the PR description.
5. **Resolved — `nodeModules` → `dependencies` is a rename, not an addition.** Keeping `nodeModules`
   and adding a second dependency category would leave the wire contract permanently naming one
   ecosystem in a union that covers nine. The rename touches 15 files; every one is either
   typecheck-enforced or caught by the `grep -rn "'nodeModules'"` gate in Verification.
6. **Resolved — `MAX_WALK_ENTRIES` 200k → 500k, and a new 50k per-root cap.** The per-root cap is
   the real fix; the global raise is a consequence of having more roots that actually produce items.
   If Theme E's measurement says 500k costs more than a second or two, lower it — the per-root cap
   still delivers the fairness property on its own.
7. **Resolved — no Go detector ships, and no `'go'` ecosystem member.** Recorded as a decision
   rather than an omission because "Go is missing" is the first thing a reviewer will say. Go's
   in-repo `vendor/` is checked in and load-bearing; its caches are elsewhere, and
   [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Decision 8 adds the member alongside them.
8. **Resolved — `detectorId` is `z.string()`, not an enum in `shared/`.** The catalogue lives in
   `desktop/` and grows often; an enum in `shared/` would make every catalogue addition a
   three-package change. The cost is that a typo in a `detectorId` is not caught by the compiler —
   mitigated by the settings key being `Ecosystem` (which *is* an enum), by the id-uniqueness
   assertion in `detectors.test.ts`, and by Theme D's `?? item.detectorId` fallback, which renders a
   typo visibly rather than as `undefined`.
9. **Resolved — no per-detector nested exception mechanism ships.** `.moon/cache` is handled by
   making the *match* two segments, which works. A tool that writes regenerable output *and*
   checked-in config into the same directory with no clean split would need an exclusion list per
   detector; no such case exists in Theme B's catalogue, so no mechanism ships. Revisit if one
   appears; do not build it speculatively.
10. **Resolved — `label` and `producer` travel in a `ScanResult.detectors` map, not on every
    `ScanItem`.** The renderer needs both strings and cannot import `detectors.ts` (it lives in
    `desktop/`, and the eslint boundary groups forbid it), so they must be on the wire. Repeating
    them per item would put roughly 100 KB of duplicated prose on a `SCAN_ITEMS_CAP`-sized result;
    the map is O(matched detectors) — at most 24 entries. The cost is one indirection at render
    time, guarded with `?? item.detectorId`.
11. **Resolved — the per-root budget lives on `WalkState`, not in the module constant.**
    `newWalkState()` defaults `perRootLimit` to `Infinity` and only `scanWorkspace` sets the real
    cap. Reading `MAX_ENTRIES_PER_ROOT` directly inside `walk`/`dirBytes` would silently cap
    `cleanItems`'s delete-time sizing at 50,000 entries — under-reporting `freedBytes` for exactly
    the large `node_modules` this phase exists to find — and would force a diff into `cleanItems`,
    which this phase promises not to touch.
12. **Resolved — `SegmentedBar` becomes generic rather than gaining a sibling component.** Its
    `segments` are typed `ScanCategory` today and it does the palette lookups internally, so a
    second axis was never a free second call site. Injecting `color` and `name` as props keeps one
    component and one set of overflow-scaling tests; a duplicated `EcosystemBar` would fork the
    `scale`/`percent` maths that `segmented-bar.test.tsx` exists to protect.
13. **Resolved — the preference stores the *disabled* ecosystems, following `hiddenMetrics`.**
    `ui-store.ts:936-944`'s docblock already argues this: an allowlist persisted before a member
    existed silently hides it for every existing user. Here that is not hypothetical — Phase 73 adds
    `'go'` and Phase 74 adds `'media'`, and both must be on by default for anyone who upgrades. No
    `version` bump and no `migrate` arm: zustand's default merge supplies `[]` for an older blob,
    exactly as it does for `hiddenMetrics`. The one non-obvious cost is that the key must also be
    classified in `persisted-keys.ts` or the build fails — see Theme E.
14. **Resolved — `Ecosystem` and `DiagnosticsEcosystem` coexist; neither is widened to serve the
    other.** Diagnostics' enum (`diagnostics.ts:39-48`) is descriptive metadata on a detected
    toolchain — `'javascript'`, `'make'`, `'moon'` — and nothing branches on it; the Optimizer's is
    the grouping key for a delete-shaped list, and Phase 73/74 append to it. Merging them would make
    one phase's catalogue addition a change to the other's UI labels. They are distinguishable by
    name from the flat `domain/index.ts` barrel, so the cost is one docblock sentence in each file.
15. **Resolved — ship without per-ecosystem icons unless a screenshot pass says otherwise.** Nine
    `react-icons/si` brand glyphs would each need alignment at both row heights, in both themes, and
    would require extending `icon-names.test.ts`'s `SETS` table to a third set. The group header
    already carries a label and a coloured swatch, which is the information the glyph would repeat.
    If the refreshed shots read flat, add them — and add the `['si','Si',Si,1]` row in the same
    commit, or the new imports are silently unasserted.
