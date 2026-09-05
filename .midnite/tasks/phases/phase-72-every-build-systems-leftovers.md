# Phase 72 — Every build system's leftovers

**Refined: x1** · 2026-09-05 · matcher design, data model & IPC contract, security & blast radius, file-map precision, testing & verification

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

**Three things you must read before writing code; each changes what a theme is.**

**`classify` matches on basename alone, and that is already wrong in production.**
[`scan-service.ts:40-53`](../../../packages/desktop/src/main/optimizer/scan-service.ts) seeds
`DEFAULT_BUILD_ARTIFACT_PATTERNS` with `{ basename: '.moon', category: 'buildOutput' }`. But this
repo's `.moon/` directory contains `workspace.yml`, `toolchain.yml` and `tasks/` — **checked-in
configuration**. Only `.moon/cache/` and `.moon/docker/` are gitignored
([`.gitignore:5-6`](../../../.gitignore)). So today's Optimizer offers a user's moon configuration
for deletion, labelled "Build output". It is recoverable (it goes to the Trash, not `unlink`), but
it is exactly the failure mode a basename-only matcher produces, and the same mistake scales: a
bare `build/` is a CMake artifact in one repo and a hand-written source directory in the next; a
bare `bin/` is MSBuild output beside a `.csproj` and a folder of shell scripts everywhere else.
**Widening a basename list would multiply this bug by twelve.** Theme A replaces the matcher; Theme
E fixes `.moon` as a consequence, not as a patch.

**`classify` is pure and synchronous, and evidence is not.** Proving a `build/` is CMake's means
reading `CMakeCache.txt` inside it; proving a `target/` is Cargo's means seeing `Cargo.toml` beside
it. One of those needs a `readdir` of the candidate, the other needs the *parent's* entry list —
which [`walk`](../../../packages/desktop/src/main/optimizer/scan-service.ts) already holds, having
just called `readDirSafe(dir)` at `:150`. So the sibling half costs **zero extra syscalls** if the
signature takes the parent's names, and the child half costs **one `readdir` per candidate**, which
only fires for directories whose name already matched. Design the signature for that; do not make
every detector pay for the expensive rule.

**The category union is a wire contract with four members and five consumers.**
`ScanCategorySchema` ([`shared/src/domain/optimizer.ts:18`](../../../packages/shared/src/domain/optimizer.ts))
is `z.enum(['nodeModules','buildOutput','staleWorktree','looseObjects'])`, and it flows into
`byCategory` as a `z.record`, into `CATEGORY_HUES` and `CATEGORY_LABELS` as exhaustive `Record`s
([`category-palette.ts:19,38`](../../../packages/app/src/features/optimizer/category-palette.ts)),
and into a hand-written `CATEGORY_ORDER` array in **two** tab components
([`smart-scan-tab.tsx:14`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx),
[`storage-tab.tsx:9`](../../../packages/app/src/features/optimizer/storage-tab.tsx)). Widening it
per-ecosystem — `rustTarget`, `gradleBuild`, `dotnetObj` — would put twelve rows in a palette and
twelve rows in a list nobody can scan. **Do not widen the category axis; add an orthogonal one.**
See Theme C and Decision 3.

**Builds on.**
- [`desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `classify(path, patterns)` (`:47`), `BuildArtifactPattern` (`:29`),
  `DEFAULT_BUILD_ARTIFACT_PATTERNS` (`:40`), `walk(dir, depth, repoId, state, signal, onProgress, log)`
  (`:139`), `dirBytes(root, state, signal, log)` (`:101`), `readDirSafe(dir, log)` (`:83`),
  `MAX_WALK_DEPTH = 12` (`:22`), `MAX_WALK_ENTRIES = 200_000` (`:24`),
  `scanWorkspace(opts)` (`:236`), `cleanItems(paths, roots, trash)` (`:297`), `knownRoots()` (`:345`).
  **The whole phase is this one file plus its contract.**
- [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `ScanCategorySchema` (`:18`), `ScanItemSchema` (`:26`), `SCAN_ITEMS_CAP = 2_000` (`:39`),
  `ScanResultSchema` (`:41`), `OptimizerResultOf<T>` (`:92`).
- [`app/src/features/optimizer/category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
  `CATEGORY_HUES` (`:19`), `categoryColor` (`:28`), `categoryFill(category, alpha)` (`:33`),
  `CATEGORY_LABELS` (`:38`). Hues are deliberately chosen clear of `METRIC_HUES`; keep that property.
- [`app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  `SegmentedBar({ label, total, segments })`, the byte-domain bar. Reused as-is.
- [`app/src/features/monitor/format-bytes.ts:12`](../../../packages/app/src/features/monitor/format-bytes.ts) —
  `formatBytes(bytes: number): string`. **Every byte figure in this phase uses it.**
- [`app/src/features/optimizer/use-optimizer.ts:49`](../../../packages/app/src/features/optimizer/use-optimizer.ts) —
  `runOptimizerClean(paths: string[])`, which reconciles the store against `skipped` rather than
  assuming the delete worked.
- [`app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) —
  `OptimizerScanState` (`:15`), `removeScanItem(path)` (`:64`). **Unpersisted, deliberately.**
- [`app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BLAST_RADIUS_COPY` (`:31`) with its `files` arm, `ConfirmRequest.blastRadiusKind` (`:52`),
  `warnings?: string[]` (`:63`).
- [`app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `optimizerEnabled`
  (`:1112`), its `PersistedUi` member (`:1288`), its default (`:1359`), its `partialize` entry
  (`:1828`), `version: 9` (`:1750`). The gate this phase inherits and does not re-litigate.
- [`desktop/src/main/optimizer/scan-service.test.ts`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts) —
  the fixture-tree harness (`:83`), including `honors an injected pattern list over the default`
  (`:45`), which is the seam this phase's tests extend.

**Scope guardrails.**
- **Repo roots only.** Every path this phase can produce or delete still resolves under a managed
  worktree or the one user-picked extra root, and `cleanItems` still confines against
  `knownRoots()`. Widening that is [Phase 73](phase-73-the-optimizer-leaves-the-repo.md); a
  home-level path appearing in a `ScanResult` from this phase is a bug.
- **The regenerable-cache rule, stated once and enforced per detector.** The Optimizer may offer a
  directory only when *some named tool recreates it on demand and its loss costs time, never
  information*. Every detector added here names that tool in a `producer` field. If you cannot name
  one, the directory does not belong in the catalogue.
- **Evidence, not names.** No detector ships whose only qualification is a directory basename,
  unless that basename is itself unambiguous across the whole ecosystem (`node_modules`,
  `__pycache__`, `.pytest_cache`). Decision 1 lists the four that qualify.
- **`shell.trashItem` stays the only delete.** Unchanged from Phase 59 and not up for discussion
  here. No `fs.rm`, no vendor commands — a command-based reclaim route exists but belongs to
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Theme D, where the caches that need it live.
- **`git-engine` gains nothing.** Same guardrail as Phase 59. The detector catalogue is Node/TS in
  `desktop/`, the types are zod in `shared/`.
- **No new dependency.** No glob library: the two matching forms this phase needs (a `/`-joined
  path suffix and a filename extension) are four lines of `String.prototype.endsWith` and are
  tested as such. `micromatch`/`minimatch`/`picomatch` are absent from every `package.json` and
  from `pnpm-lock.yaml`; keep it that way.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Deliverables

### A — The detector registry (M)

Replaces the basename list with a structure that can express "this directory, but only when the
evidence beside it says so."

- [ ] Add `packages/desktop/src/main/optimizer/detectors.ts` — a new module, **not** more constants
      in `scan-service.ts`. The scanner and the catalogue change for different reasons and at
      different rates: the walker is security-critical machinery, the catalogue is a list that grows
      every time someone uses a new build tool.
- [ ] Export the detector shape, with every field named:
      ```ts
      export type ArtifactDetector = {
        /** Stable, kebab, never reused — it is the settings key and the test name. */
        id: DetectorId;
        label: string;                       // "Cargo target/", shown in the item list
        category: ScanCategory;              // the coarse axis — see Theme C
        ecosystem: Ecosystem;                // the grouping axis — see Theme C
        /** What recreates this. Prose, one clause. Required: see the scope guardrail. */
        producer: string;                    // "cargo build"
        /** `/`-joined path suffixes; one segment is the common basename case. */
        match: readonly string[];            // ['target'] | ['vendor/bundle']
        evidence: EvidenceRule;
        reclaim: ReclaimCost;                // 'cheap' | 'costly' — see Theme D
      };
      ```
- [ ] Export `EvidenceRule` as a four-arm discriminated union, and **say in the docblock which arm
      costs a syscall**:
      ```ts
      export type EvidenceRule =
        /** The name alone is proof. Only the four names in Decision 1 may use this. */
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
- [ ] Export `matchesPathSuffix(path: string, suffix: string): boolean` — splits on `sep`, compares
      the trailing segments, and is **case-sensitive**. macOS's default volume is case-*insensitive*
      but case-*preserving*, so `Build/` and `build/` both exist as spellings on disk. Compare
      case-sensitively and list both spellings in `match` where a tool ships both (CLion writes
      `cmake-build-debug`; Xcode writes `Build`). A case-insensitive compare would make `Bin/` — a
      perfectly ordinary source folder name — match the .NET detector.
- [ ] Rewrite `classify` in
      [`scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) as:
      ```ts
      export async function classify(
        path: string,
        siblingNames: ReadonlySet<string>,
        detectors: readonly ArtifactDetector[] = DEFAULT_DETECTORS,
        log: Logger = defaultLogger,
      ): Promise<ArtifactDetector | null>
      ```
      It returns the **whole detector**, not just a category — `walk` needs `id`, `ecosystem` and
      `reclaim` to build the `ScanItem`, and a second lookup by category would be ambiguous the
      moment two detectors share one. Keep the `detectors` parameter injectable exactly as
      `patterns` was: `scan-service.test.ts:45` already asserts that seam works, and Theme F
      extends that test rather than replacing it.
- [ ] **Order matters and is part of the contract.** `classify` returns the **first** matching
      detector in array order, and `DEFAULT_DETECTORS` is ordered most-specific-first. Two
      detectors legitimately claim `target/` (Cargo and Maven) and two claim `build/` (CMake and
      Gradle); their evidence rules disambiguate, but a detector with `evidence: {kind:'none'}` must
      never sit above one with real evidence. Assert the ordering invariant in a test rather than
      relying on review: *no `{kind:'none'}` detector may appear before a detector whose `match`
      shares a suffix with it.*
- [ ] Wire the sibling set through `walk` with no extra `readdir`: `readDirSafe(dir, log)` at
      [`:150`](../../../packages/desktop/src/main/optimizer/scan-service.ts) already returns the
      parent's `Dirent[]`; build `new Set(entries.map((e) => e.name))` **once per directory**, above
      the loop, and pass it to every `classify` call in that directory. Building it per-entry would
      turn an O(n) walk into O(n²) on a wide `node_modules`.
- [ ] `childAny` evidence goes through `readDirSafe`, never a bare `readdir` — a candidate the user
      cannot read must skip the detector, not fail the scan. The existing helper already logs and
      returns `[]`; that is the correct behaviour here too (no evidence found ⇒ no match).
- [ ] **`.git` stays refused at any depth** ([`:158`](../../../packages/desktop/src/main/optimizer/scan-service.ts))
      and symlinks stay untraversed and unsized (`:159`, `:119`). Neither line moves. Add a test
      asserting a detector cannot be made to match inside a `.git` directory even if its name would.
- [ ] `detectors.test.ts`: every arm of `EvidenceRule` proved against a fixture tree — a `target/`
      with a sibling `Cargo.toml` matches, the same `target/` without one does not; a `build/`
      containing `CMakeCache.txt` matches, an empty `build/` does not; `matchesPathSuffix` accepts
      `a/b/vendor/bundle` for `vendor/bundle` and rejects `a/vendorbundle`.

### B — The catalogue: nine ecosystems in the repo (M)

Each entry below states **what identifies it**, **what proves it**, and **what recreates it**. An
entry with no third column does not ship.

- [ ] **Node/web** — `node_modules` (`evidence: none`, producer `npm/pnpm/yarn install`,
      **costly**); `dist` (`siblingAny: ['package.json']`, `npm run build`, cheap); `.next`,
      `.turbo`, `.parcel-cache`, `.svelte-kit`, `.nuxt`, `.vite` (`evidence: none` — each is a
      tool-private dotted name that means one thing, cheap). `dist` **must** keep its sibling
      evidence: `dist/` is also a perfectly ordinary hand-written folder name in a non-Node repo.
- [ ] **moon** — `.moon/cache` and `.moon/docker` as **two-segment `match` suffixes**, never `.moon`.
      This is the [`.gitignore:5-6`](../../../.gitignore) boundary written into the catalogue:
      `.moon/workspace.yml`, `.moon/toolchain.yml` and `.moon/tasks/` are checked-in configuration.
      Producer: `moon run`. Cheap. See Theme E for retiring the old entry.
- [ ] **Rust** — `target` (`siblingAny: ['Cargo.toml']`, producer `cargo build`, cheap). The
      registry of downloaded crates lives at `~/.cargo/registry`, is **not** in a repo, and is
      [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s — so a `target/` delete costs a
      recompile, not a re-download, and `cheap` is the honest grade.
- [ ] **C/C++ (CMake)** — `build`, `_build`, `cmake-build-debug`, `cmake-build-release`
      (`childAny: ['CMakeCache.txt', 'CMakeFiles']`, producer `cmake --build`, cheap). **The
      evidence is a child, not a sibling** — CMake writes `CMakeCache.txt` *into* the build
      directory. A bare `build/` with no cache file inside it is somebody's source tree and is never
      offered. Note `_build` also belongs to Elixir/Dune, which this phase does not cover; the
      `CMakeCache.txt` evidence means an Elixir `_build` simply does not match, which is correct —
      a miss is a bug report, a false match is a data-loss incident.
- [ ] **.NET / C#** — `obj` and `bin`, both gated on
      `siblingSuffix: ['.csproj', '.fsproj', '.vbproj', '.vcxproj']`, producer `dotnet build`,
      cheap. `bin/` is the single most dangerous basename in this catalogue — it is a script folder
      in half the repos on any machine — so it ships **only** with project-file evidence, and
      Theme F's fixture set includes a `bin/` beside a `package.json` (must not match) and a `bin/`
      with no siblings at all (must not match). `~/.nuget/packages` is out of repo and is
      [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)'s.
- [ ] **Python** — `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`
      (`evidence: none`, cheap — each name is tool-private and unambiguous); `.venv`, `venv`, `env`
      (`childAny: ['pyvenv.cfg']`, producer `python -m venv`, **costly**). `pyvenv.cfg` is written
      by `venv`/`virtualenv` and by nothing else, which is what makes `env` — otherwise an
      unacceptable basename — safe to list. `~/Library/Caches/pip` and the uv/poetry caches are out
      of repo.
- [ ] **Java / Kotlin / Gradle / Maven** — `build`
      (`siblingAny: ['build.gradle','build.gradle.kts','settings.gradle','settings.gradle.kts']`,
      producer `gradle build`, cheap); `.gradle` — the **project-local** one, `siblingAny` the same
      four files, cheap; `target` (`siblingAny: ['pom.xml']`, producer `mvn package`, cheap);
      `out` (`siblingAny: ['.idea']`, producer `IntelliJ IDEA build`, cheap). `~/.gradle/caches`
      and `~/.m2/repository` are out of repo.
- [ ] **Swift / Xcode (project-local)** — `.build` (`siblingAny: ['Package.swift']`, producer
      `swift build`, cheap); `Pods` (`siblingAny: ['Podfile']`, producer `pod install`, **costly**);
      `DerivedData` (`siblingSuffix: ['.xcodeproj','.xcworkspace']`, producer `xcodebuild`, cheap)
      — that last one only catches the project-local override; the shared
      `~/Library/Developer/Xcode/DerivedData` is out of repo.
- [ ] **Ruby** — `vendor/bundle` as a **two-segment suffix** with `childAny: ['ruby']`, producer
      `bundle install --path vendor/bundle`, **costly**. Never a bare `vendor/`: in a Ruby repo
      `vendor/` also holds checked-in assets and forked gems. `~/.gem` and `~/.bundle/cache` are out
      of repo.
- [ ] **Go — deliberately nothing in-repo, and this is a finding, not an omission.** Go builds into
      `GOCACHE`/`GOMODCACHE` under the home directory, so a Go repo has no build artifact to find.
      Its one in-repo candidate, `vendor/`, is **checked in on purpose** and changes build
      behaviour when absent (`go build` silently switches from `-mod=vendor` to the module cache).
      **Ship no Go detector.** Say so in `detectors.ts`'s docblock so the next person does not
      "fix" the gap. Go's real caches are [Phase 73](phase-73-the-optimizer-leaves-the-repo.md)
      Theme D, where they need `go clean`, not a delete.

### C — The data model widens by one axis, not twelve (M)

- [ ] Add `EcosystemSchema` to
      [`shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts):
      `z.enum(['node','rust','python','dotnet','java','ruby','cpp','swift','git','multi'])`. This is
      the **grouping** axis. `'git'` covers `staleWorktree`/`looseObjects`; `'multi'` covers a
      detector that belongs to no single ecosystem.
- [ ] Widen `ScanCategorySchema` (`:18`) to **five** members, not twelve:
      `z.enum(['dependencies','buildOutput','toolCache','staleWorktree','looseObjects'])`.
      `'dependencies'` **renames** `'nodeModules'` — a union member that names one ecosystem cannot
      also hold `.venv`, `Pods` and `vendor/bundle`. `'toolCache'` is new and covers `__pycache__`,
      `.pytest_cache`, `.gradle`, `.turbo`, `.moon/cache`. The rename is mechanical and
      typecheck-enforced: every `Record<ScanCategory, …>` fails to compile until it is updated.
- [ ] Add `ReclaimCostSchema = z.enum(['cheap','costly'])` with the rule in its docblock:
      **`cheap` means a local rebuild restores it; `costly` means the network does.** `node_modules`,
      `.venv`, `Pods` and `vendor/bundle` are `costly` — deleting them on a plane is a different
      decision than deleting a `dist/`. This is not decoration; Theme D gates behaviour on it.
- [ ] Widen `ScanItemSchema` (`:26`) by three fields:
      `detectorId: z.string()`, `ecosystem: EcosystemSchema`, `reclaim: ReclaimCostSchema`. `path`,
      `bytes`, `category` and `repoId` are unchanged. `detectorId` is a plain `z.string()` and
      **not** an enum: the catalogue grows in `desktop/`, and forcing every addition through a
      `shared/` enum edit is the coupling this split exists to avoid.
- [ ] Add `byEcosystem: z.record(EcosystemSchema, z.number().nonnegative())` to `ScanResultSchema`
      (`:41`) alongside the existing `byCategory`. Both roll-ups are computed in `main` during the
      walk — the renderer receives totals, it does not re-aggregate 2,000 items on every render.
- [ ] `SCAN_ITEMS_CAP = 2_000` (`:39`) is **unchanged**. More detectors means more items, and the
      cap plus `truncated: true` is the mechanism that already covers it. Raising the cap because
      the scan now finds more things is the wrong instinct — Theme D's grouping is what makes 2,000
      items legible.
- [ ] Update `newWalkState()` ([`:63`](../../../packages/desktop/src/main/optimizer/scan-service.ts))
      and `addItem` (`:73`) for the new roll-up. `byCategory`'s initialiser is a literal with one
      key per member; keep it a literal (not a computed reduce) so a new union member is a
      typecheck failure rather than a silently-missing key.
- [ ] No new IPC channel. `optimizerScan`, `optimizerClean` and `optimizerScanProgress`
      ([`channels.ts:299-309`, `:762`](../../../packages/shared/src/ipc/channels.ts)) carry the
      wider payload unchanged; only the schemas in
      [`ipc/schemas.ts:1889-1909`](../../../packages/shared/src/ipc/schemas.ts) widen, and they
      widen by re-export, not by edit. Say so in the theme's PR description — "no new channels" is a
      claim reviewers should be able to verify from the diff.

### D — A result list that can hold twelve kinds of thing (M)

Four categories fitted in a flat list. Nine ecosystems do not.

- [ ] Rewrite the `CATEGORY_ORDER` arrays in
      [`smart-scan-tab.tsx:14`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx)
      and [`storage-tab.tsx:9`](../../../packages/app/src/features/optimizer/storage-tab.tsx) as a
      **single exported const** in
      [`category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts).
      Two hand-maintained copies of one ordering is how the fifth member goes missing from one tab.
- [ ] Add `ECOSYSTEM_LABELS: Record<Ecosystem, string>` and `ECOSYSTEM_HUES: Record<Ecosystem, Hsl>`
      to `category-palette.ts`, both exhaustive, hues chosen clear of `METRIC_HUES`
      (cpu 210, memory 280, gpu 160, disk 35) for the reason the file's docblock at `:10-14`
      already gives. Keep `categoryColor`/`categoryFill`/`CATEGORY_LABELS` and add the ecosystem
      pair beside them — one palette module, two axes.
- [ ] Smart Scan's result list groups **by ecosystem**, with each group showing its total and a
      per-group Clean button; the existing per-category rows become the second level inside a
      group. Ecosystems with zero bytes render nothing (the current `count === 0` guard at
      [`smart-scan-tab.tsx:135`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx)
      generalises).
- [ ] **A `costly` item is never selected by default.** The per-group Clean button cleans that
      group's `cheap` items only; reclaiming a `costly` item takes an explicit per-row action. The
      confirm for a group containing skipped `costly` items says so in `warnings` — *"3 items need a
      re-download to restore and were left alone; clean them individually."* Rationale in
      Decision 4: one click that deletes every `node_modules`, `.venv` and `Pods` on the machine is
      a twenty-minute reinstall the user did not ask for.
- [ ] The confirm keeps `blastRadiusKind: 'files'` and its existing two-part shape — `count` in
      `blastRadius`, bytes in `warnings`
      ([`smart-scan-tab.tsx:47-64`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx)).
      Add a third `warnings` line naming the **producers** that will have to run again:
      *"cargo build and gradle build will need to run again."* That is the sentence that turns a
      byte count into a decision, and `producer` exists to supply it.
- [ ] Storage tab: the `SegmentedBar` gains a second instance keyed on ecosystem, above the existing
      category one. `SegmentedBar({ label, total, segments })` takes `{ id, bytes }[]` and already
      does not care what `id` means, so this is a second call site, not a component change.
- [ ] Each item row shows its detector `label` rather than its raw path only — a row reading
      `~/Dev/api/target` tells the user nothing that `Cargo target/ · ~/Dev/api/target` does not
      tell them better. Path stays, in `font-mono text-xs`, as today.
- [ ] Every icon in the new UI comes from `react-icons`, imported per set
      (`react-icons/lu`, `react-icons/si` for ecosystem marks). **Never `lucide-react`** —
      `eslint.config.mjs` fails the build on it, and
      [`components/icons/icon-names.test.ts`](../../../packages/app/src/components/icons/icon-names.test.ts)
      asserts every `react-icons/lu` name the renderer imports resolves to a defined export. If a
      `react-icons/si` set glyph is used, extend that test to cover the second set or the assertion
      silently stops applying.

### E — Budgets, per-detector settings, and the `.moon` fix (S)

- [ ] **Retire the `.moon` detector and say why in the code.** `DEFAULT_BUILD_ARTIFACT_PATTERNS`'s
      `{ basename: '.moon', category: 'buildOutput' }`
      ([`scan-service.ts:43`](../../../packages/desktop/src/main/optimizer/scan-service.ts)) is
      replaced by the two `.moon/cache` and `.moon/docker` suffix detectors from Theme B. Leave a
      comment in `detectors.ts` naming the old entry and the `.gitignore` lines that prove the
      boundary, so nobody re-adds the short form as a "simplification".
- [ ] Add `MAX_ENTRIES_PER_ROOT = 50_000` to
      [`scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) and enforce
      it per root in `scanWorkspace`'s loop (`:241`), alongside the existing global
      `MAX_WALK_ENTRIES`. Today one pathological repo early in `collectRoots()`'s order can consume
      the entire 200,000-entry budget and every later repo silently reports zero — with three
      detectors that was unlikely, with twenty-four candidate names it is not. The per-root budget
      makes the failure *partial and visible* rather than *total and silent*.
- [ ] Raise `MAX_WALK_ENTRIES` from `200_000` to `500_000` and restate the docblock's justification
      in entries-per-second terms measured on a real machine, not asserted. A `readdir`-driven walk
      that skips matched directories rather than descending them
      (`walk`'s `continue` at [`:170`](../../../packages/desktop/src/main/optimizer/scan-service.ts))
      is cheap per entry; the number should follow the measurement.
- [ ] `MAX_WALK_DEPTH = 12` is **unchanged**. Every detector in Theme B's catalogue sits within a
      few levels of a project root, and the depth bound is what stops a symlink-free but pathological
      tree. If a real repo turns out to need more, raise it with the repo named in the commit
      message.
- [ ] `truncated` gains precision: `ScanResult` carries `truncatedRoots: z.array(z.string())` so the
      renderer's existing "This scan hit its bounds and stopped early"
      ([`smart-scan-tab.tsx:167`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx))
      can name which repos were cut short instead of leaving the user to guess.
- [ ] Per-ecosystem opt-out in
      [`optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx):
      a `disabledEcosystems: Ecosystem[]` preference, default `[]` (everything on). Persisted in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) following `optimizerEnabled`
      exactly — interface member, `PersistedUi` `Pick<>` member, default + setter in the creator,
      `partialize` entry. **Do not bump `version: 9`** (`:1750`) and do not write a `migrate` arm:
      `allowForceWithLease`, `launchAndRunEnabled` and `optimizerEnabled` were all added without
      one, because zustand's default merge supplies the default for an older blob. An array default
      merges the same way an boolean does.
- [ ] The setting is applied in **main**, not the renderer: `OptimizerScanRequest`
      ([`schemas.ts:1889`](../../../packages/shared/src/ipc/schemas.ts)) gains
      `disabledEcosystems?: Ecosystem[]`, and `scanWorkspace` filters `DEFAULT_DETECTORS` before
      walking. Filtering after the walk would spend the entry budget finding things the user asked
      not to see.
- [ ] Update the settings page's "What this still never does" list (`:37-42`) with the new boundary
      in one line: *"Only directories a build tool recreates on demand — never source, never
      configuration, never anything outside a repo this app manages."*

### F — Verification (M)

- [ ] `detectors.test.ts` — the ordering invariant from Theme A asserted as a test over
      `DEFAULT_DETECTORS`: no `{kind:'none'}` detector precedes a detector sharing a `match` suffix
      with it.
- [ ] `detectors.test.ts` — a `producer` presence test: every entry in `DEFAULT_DETECTORS` has a
      non-empty `producer`. That is the scope guardrail made mechanical.
- [ ] `scan-service.test.ts` — extend the existing fixture-tree harness (`:83`) with a
      **negative-match fixture set**, which is the half that matters: `bin/` beside a
      `package.json`; `build/` with no `CMakeCache.txt` and no `build.gradle`; `venv/` with no
      `pyvenv.cfg`; `vendor/` with a `Gemfile` but no `bundle/` under it; `.moon/` containing
      `workspace.yml`. **Each must produce zero items.** A test suite for a deleter that only
      asserts what it finds is testing the wrong direction.
- [ ] `scan-service.test.ts` — a positive fixture per ecosystem in Theme B, asserting the item's
      `detectorId`, `ecosystem`, `category` and `reclaim`, not just that something was found.
- [ ] `scan-service.test.ts` — the two ambiguous-name cases explicitly: a `target/` beside
      `Cargo.toml` classifies as Rust, a `target/` beside `pom.xml` as Java, and a `target/` beside
      both resolves deterministically to whichever `DEFAULT_DETECTORS` lists first (assert the
      actual answer, so a reorder is a failing test rather than a behaviour change).
- [ ] `scan-service.test.ts` — `MAX_ENTRIES_PER_ROOT`: a two-root fixture where the first root
      exceeds the per-root budget, asserting the second root still yields items and appears absent
      from `truncatedRoots` while the first appears in it.
- [ ] `scan-service.test.ts` — `disabledEcosystems: ['python']` yields no Python items from a tree
      that otherwise produces them.
- [ ] `optimizer-handlers.test.ts` — the existing `trashItem` assertions (`:44`, `:64`) still pass
      unchanged. This phase must not touch the delete path; a diff in that test is a red flag.
- [ ] `optimizer-store.test.ts` — `removeScanItem` still reconciles correctly with the widened
      `ScanItem`, and the store is still absent from `localStorage` after a scan.
- [ ] Renderer unit test: a `ScanResult` containing one `costly` and two `cheap` items in one
      ecosystem produces a group-Clean confirm whose `blastRadius.count` is **2**, and whose
      `warnings` mention the one item left behind.
- [ ] `packages/app/e2e/optimizer-shots.spec.ts` — refresh the Smart Scan and Storage shots in light
      and dark against a seeded multi-ecosystem fixture, so the grouped list and the two segmented
      bars are both captured.
- [ ] `moon run :typecheck :lint :test` green. The `ScanCategory` rename is the item most likely to
      leave a stale `Record`; the exhaustiveness of `CATEGORY_HUES`/`CATEGORY_LABELS` is what
      catches it, so do not soften either to `Partial`.
- [ ] **Human pass:** run a scan against a checkout containing a real Rust, Gradle and Python
      project and confirm each is found with correct bytes; then confirm a repo with a hand-written
      `build/` and a hand-written `bin/` produces **nothing**.

---

## Files this phase touches

**New**
- `packages/desktop/src/main/optimizer/detectors.ts` — `ArtifactDetector`, `EvidenceRule`,
  `DEFAULT_DETECTORS`, `matchesPathSuffix` (A, B).
- `packages/desktop/src/main/optimizer/detectors.test.ts` — ordering invariant, `producer` presence,
  every evidence arm (A, F).

**Changed**
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `classify` becomes async and detector-returning; `walk` builds the sibling set once per directory;
  `MAX_ENTRIES_PER_ROOT`; `MAX_WALK_ENTRIES` raised; `byEcosystem` roll-up (A, C, E).
  **`cleanItems` and `knownRoots` are unchanged** — that is [Phase 73](phase-73-the-optimizer-leaves-the-repo.md).
- [`packages/desktop/src/main/optimizer/scan-service.test.ts`](../../../packages/desktop/src/main/optimizer/scan-service.test.ts) —
  negative-match fixtures, per-ecosystem positives, ambiguity, per-root budget (F).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `EcosystemSchema`, `ReclaimCostSchema`, widened `ScanCategorySchema` and `ScanItemSchema`,
  `byEcosystem` and `truncatedRoots` on `ScanResultSchema` (C, E).
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) —
  `OptimizerScanRequest` gains `disabledEcosystems?` (E). **No channel added** to
  [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts).
- [`packages/app/src/features/optimizer/category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
  the single `CATEGORY_ORDER`, `ECOSYSTEM_LABELS`, `ECOSYSTEM_HUES` (D).
- [`packages/app/src/features/optimizer/smart-scan-tab.tsx`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx) —
  ecosystem grouping, the `cheap`-only group clean, the producer warning line (D).
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  the second `SegmentedBar`, detector labels on rows (D).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
  per-ecosystem toggles, the reworded boundary line (E).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  `disabledEcosystems`, four edits, **no `version` bump** (E).
- [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts) —
  refreshed shots (F).

**Deliberately unchanged**
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineTree(root, target)` is exactly right for repo-confined deletion and is not touched here.
- [`packages/desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  the `shell.trashItem` wiring at `:58` does not move.
- [`packages/app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  a second call site, not a component change.
- [`packages/git-engine/`](../../../packages/git-engine) — gains nothing, per the guardrail.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `DEFAULT_DETECTORS` contains no entry with an empty `producer` (asserted, not reviewed).
- [ ] Every negative fixture in Theme F produces **zero** items.
- [ ] A scan of this repo finds `.moon/cache` and does **not** find `.moon`.
- [ ] `cleanItems`'s diff is empty; `optimizer-handlers.test.ts` is unchanged.
- [ ] No `ScanItem` produced by any test resolves outside a fixture root.
- [ ] Smart Scan and Storage shots refreshed in both themes.
- [ ] **Human:** real Rust + Gradle + Python checkout found correctly; hand-written `build/`/`bin/`
      found not at all.

---

## Not in this phase

- **Anything outside a repo root.** `~/Library/Caches`, `~/.cargo`, `~/.gradle`, `~/.m2`,
  `~/.nuget`, `GOCACHE`, `GOMODCACHE`, Xcode DerivedData, Homebrew's cache, browser caches — all
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md).
- **Vendor reclaim commands** (`go clean -cache`, `pnpm store prune`, `brew cleanup -s`).
  [Phase 73](phase-73-the-optimizer-leaves-the-repo.md) Theme D, where the caches that require them
  live.
- **Media caches and Empty Trash.** [Phase 74](phase-74-media-caches-and-the-trash.md).
- **PHP (`vendor/` + `composer.json`), Elixir (`_build`, `deps`), Dart/Flutter (`.dart_tool`,
  `build/`), Haskell (`.stack-work`, `dist-newstyle`).** Each is one catalogue entry in the shape
  Theme A defines; none was asked for, and a catalogue nobody has a repo to test against is a
  catalogue of guesses. Add them when someone has the repo.
- **Docker images and volumes.** A different daemon, a different permission model, and a delete
  with no Trash to undo it.
- **`looseObjects`.** Still zero, still for the reason Phase 59's Decision 11 gives: `readHealth`
  returns a combined packed+loose byte figure, and the guardrail says git-engine gains nothing.
- **Automatic or scheduled scanning.** Every scan stays user-initiated.

---

## Decisions / open questions

Every decision below was **chosen without the human on 2026-09-05** — this phase was written from a
single brief with no one available to consult. Each records the recommendation that was taken and
why, so a later refine can reverse it with the reasoning in view.

1. **Four detectors may use `evidence: {kind:'none'}` and no more.** `node_modules`, `__pycache__`,
   and the dotted tool-private names (`.next`, `.turbo`, `.pytest_cache`, `.mypy_cache`,
   `.ruff_cache`, `.parcel-cache`, `.svelte-kit`, `.nuxt`, `.vite`, `.tox`, `.gradle`,
   `.moon/cache`, `.moon/docker`). The rule that admits them: **a leading dot plus a
   tool-namespaced name is not a name a human gives a source directory.** `node_modules` and
   `__pycache__` are grandfathered on the same reasoning — nobody names a source folder either. Any
   *undotted, non-namespaced* basename needs evidence. `dist` is undotted and therefore gated on
   `package.json` even though it is the most common of all.
2. **`classify` becomes async.** The alternative — pre-collect all evidence during the walk and keep
   `classify` pure — was considered and rejected: it moves filesystem knowledge into `walk`, which
   is the security-critical function, to keep purity in the function that is merely a lookup. The
   sibling set stays a pure argument (a `ReadonlySet<string>` the caller builds), so the only
   impurity is the `childAny` `readdir`, and it is confined to one arm.
3. **One `ScanCategory` axis of five, plus an orthogonal `Ecosystem` axis — not twelve categories.**
   A twelve-member category union would need twelve palette hues distinguishable from each other
   *and* from `METRIC_HUES`, which is not achievable, and would put twelve rows in a list. The
   ecosystem axis groups; the category axis colours. Reversing this later means one enum edit and
   one palette rewrite.
4. **`costly` items are excluded from every group/bulk clean and take a per-row action.** The
   alternative — a "select all" with `costly` rows pre-checked — makes the destructive default the
   easy one, which is the opposite of every other confirm in this app. The cost of the chosen
   option is one extra click per `node_modules`; the cost of the alternative is an unintended
   twenty-minute reinstall. Note this is a stronger position than Phase 59 took, where all four
   categories were equally bulk-cleanable — `node_modules` becoming `costly` is a deliberate,
   user-visible behaviour change and belongs in the PR description.
5. **`nodeModules` → `dependencies` is a rename, not an addition.** Keeping `nodeModules` and adding
   a second dependency category would leave the wire contract permanently naming one ecosystem in a
   union that covers nine. The rename touches ~6 files and every one is typecheck-enforced.
6. **`MAX_WALK_ENTRIES` 200k → 500k, and a new 50k per-root cap.** The per-root cap is the real
   fix; the global raise is a consequence of having more roots that actually produce items. If the
   measurement in Theme E says 500k costs more than a second or two, lower it — the per-root cap
   still delivers the fairness property on its own.
7. **No Go detector ships.** Recorded as a decision rather than an omission because "Go is missing"
   is the first thing a reviewer will say. Go's in-repo `vendor/` is checked in and load-bearing;
   its caches are elsewhere.
8. **`detectorId` is `z.string()`, not an enum in `shared/`.** The catalogue lives in `desktop/` and
   grows often; an enum in `shared/` would make every catalogue addition a three-package change.
   The cost is that a typo in a `detectorId` is not caught by the compiler — mitigated by the
   settings key being `Ecosystem` (which *is* an enum) rather than `detectorId`.
9. **Open — should a detector be able to declare a nested exception?** `.moon/cache` is handled by
   making the *match* two segments, which works. A tool that writes regenerable output *and*
   checked-in config into the same directory with no clean split would need an exclusion list per
   detector. No such case exists in Theme B's catalogue, so no mechanism ships. Revisit if one
   appears; do not build it speculatively.
