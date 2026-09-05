# Phase 73 — The optimizer leaves the repo

**Refined: x1** · 2026-09-05 · security & blast radius, data model & IPC contract, testing & verification, UI / empty / loading / error states, sequencing & cross-phase dependencies, per-item acceptance criteria, file-map precision, out-of-scope tightening

**Written directly** (no human in the loop — see Decisions) · 2026-09-05

[Phase 59](phase-59-workspace-optimizer.md) built the Workspace Cleaner and, in the same doc,
drew its own boundary in prose: *"Not a general Mac cleaner. Smart Scan and Storage only ever
look at repos/worktrees Midnite already knows about, plus one user-chosen extra root."*
[Phase 72](phase-72-every-build-systems-leftovers.md) made the walker smarter inside that boundary
— nine build ecosystems instead of three basenames — and named, in its own "Not in this phase"
section, everything the boundary itself still refuses: `~/.cargo`, `~/.gradle`, `~/.m2`,
`~/.nuget`, `GOCACHE`/`GOMODCACHE`, Xcode DerivedData, Homebrew's cache, browser caches, and the
vendor reclaim commands (`go clean -cache`, `pnpm store prune`, `brew cleanup -s`) that could
recover them more surgically than a delete. **This is that phase** — the half Phase 72 could not
do without its own review, because the trust model changes, not just the catalogue.

**This phase explicitly does NOT cover two things Phase 72 already named for a phase after this
one: media-tool caches (Plex and anything shaped like it) and emptying the system Trash.**
[Phase 74](phase-74-media-caches-and-the-trash.md) is that phase — see "Not in this phase" below
for why those two need a still-different review even from the one this phase already needs.
**This phase is also macOS-only, stated rather than assumed** — every path in the catalogue below
is a macOS path, matching this app's own stated scope
([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md): *"Desktop-only, macOS arm64 primary
target"*). Windows/Linux equivalents of every cache here exist and are a real gap, not an oversight
— see Decision 7, the one decision below that stays **Open**.

## The core design problem

**`knownRoots()` is not a confinement mechanism that can be widened — it is a registry, and the
registry is the wrong shape for this job.**
[`scan-service.ts:344-351`](../../../packages/desktop/src/main/optimizer/scan-service.ts):

```ts
/** Every path `cleanItems` may confine against, for the caller to assemble. */
export async function knownRoots(): Promise<string[]> {
  const roots: string[] = [];
  for (const repo of await listRepos()) {
    for (const worktree of await worktreesFor(repo.id)) roots.push(worktree.path);
  }
  return roots;
}
```

It returns every worktree path of every repo the user has opened in Midnite — a list that grows
every time someone opens a new repo, and whose members are *trusted by construction*: **any**
path under **any** registered worktree is fair game for `cleanItems` to trash, because opening a
repo in a git client is itself the user's consent to that repo's tree. That reasoning has no
equivalent for `~/.cargo/registry` or `~/Library/Caches/Homebrew` — the user never "opened" their
home directory in Midnite, and a scan that walked `~/Library/Caches` the way `walk()` walks a
repo (recursing into whatever it finds, sizing whatever basename matches a pattern) would be one
detector bug away from confining against — and therefore being allowed to trash — an arbitrary
path anywhere on the machine. **Widening `knownRoots()` to include `os.homedir()` is the single
most dangerous line this phase could write, and it is not written here.**

The fix is not a smarter walker. It is a **completely separate, allowlist-only confinement
primitive** that never takes a root from `listRepos()`, never takes a user-picked `extraRoot`, and
never descends into a directory looking for evidence the way [Phase
72](phase-72-every-build-systems-leftovers.md)'s `childAny`/`siblingAny` detectors do. Every
candidate this phase can ever produce is one of a **fixed, reviewed, hand-written list** of
absolute paths — a registry entry, not a discovery. See Theme A and Decision 1.

### And exact-match confinement is not, on its own, enough

This is the finding the refinement pass added, and it changes Theme A. `confineTree`
([`fs-scope-write.ts:215-225`](../../../packages/desktop/src/main/fs-scope-write.ts)) `realpath`s
**both** sides before comparing — which is exactly right for a repo tree, and is what
`confineAllowlist` inherits. But it means an allowlist entry that is *itself a symlink* resolves to
its target on both sides of the comparison: if `~/.cargo/registry` is a symlink to `~/Documents`,
then the registry entry and the delete target both realpath to `~/Documents`, they compare `===`,
**exact match passes, and this app trashes the user's Documents folder.** Exact-match confinement
prevents a path *nobody reviewed* from being reached by prefix; it does not prevent a reviewed path
from *pointing somewhere nobody reviewed*.

So the allowlist has a second rule, and it is a `lstat`, not a `realpath`: **an entry whose own
final segment is a symlink is dropped from the allowlist entirely, never followed.** The registry's
promise is "this exact, reviewed directory"; a symlink there means the real target was never
reviewed. `cleanItems` already makes precisely this refusal for repo-scoped items
([`scan-service.ts:313-316`](../../../packages/desktop/src/main/optimizer/scan-service.ts):
`if (stat.isSymbolicLink()) { skipped.push({ path, reason: 'is now a symlink' }); continue; }`) —
this phase applies it one level earlier, at resolve time, and again at clean time. See Theme A and
Decision 10.

**Builds on — read before writing code.** Every line number below was re-verified against the tree
during this refinement; where the previous draft was wrong, the correction is called out.

- [`desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `cleanItems(paths, roots, trash)` (`:297`), `knownRoots()` (`:345`), `MAX_WALK_DEPTH = 12`
  (`:22`), `MAX_WALK_ENTRIES = 200_000` (`:24`), `CleanOutcome` (`:275`).
  - **Correction to the previous draft:** `dirBytes(root, state, signal, log)` (`:101`),
    `readDirSafe(dir, log)` (`:83`) and `newWalkState()` (`:63`) are **not exported** today. The
    previous draft's claim that this file is "deliberately unchanged" was therefore impossible —
    Theme B cannot call `dirBytes`. It is changed, by exactly four `export` keywords; see Theme A's
    last item and Decision 13.
  - `PROGRESS_EVERY_ENTRIES = 50` (`:26`, not exported) is the progress cadence; `onProgress`'s
    `total` argument is always `MAX_WALK_ENTRIES`, a fixed denominator, not a real total.
- [`desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineTree(root, target)` (`:215`), verbatim:
  ```ts
  export async function confineTree(root: string, target: string): Promise<string | null> {
    let rootReal: string;
    let targetReal: string;
    try {
      [rootReal, targetReal] = await Promise.all([realpath(root), realpath(target)]);
    } catch {
      return null; // either side does not exist, or a stat raced it away
    }
    if (targetReal === rootReal) return null; // the root itself is never a target
    return targetReal.startsWith(rootReal + sep) ? targetReal : null;
  }
  ```
  **The shape this phase's `confineAllowlist` is modelled on, with one rule tightened and one
  added**: `confineTree` accepts anything *strictly under* its root (correct for a repo tree, where
  the root is trusted and everything inside it is fair game); `confineAllowlist` accepts only an
  **exact match** against a registry entry (Decision 1), *and* refuses a symlinked entry outright
  (Decision 10) — there is no equivalent of "the user opened this repo" to extend trust downward
  from, or through, a home-directory path. Note the contract to copy: **async, `null` on refusal
  including a nonexistent path, never a throw, and the resolved realpath on success.**
  [`confine-tree.test.ts`](../../../packages/desktop/src/main/confine-tree.test.ts) is its dedicated
  spec and is the file Theme F's own suite sits beside.
- [`desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  the full call chain this phase's new channels mirror:
  `registerOptimizerHandlers(getWindow)` → `handle(CHANNELS.optimizerClean, …)` (`:52`) →
  `knownRoots()` (`:57`) → `cleanItems(req.paths, roots, (path) => shell.trashItem(path))` (`:58`).
  Confirms in code exactly what the brief said: **the only delete route is `shell.trashItem`,
  confined by `cleanItems` against `knownRoots()`, and there is no other path from a renderer click
  to a filesystem write.** Also note the single-flight seam at `:18` (`let currentScan:
  AbortController | null = null;` then `currentScan?.abort()` at `:24`) — Theme B copies the shape
  but **not** the variable (Decision 14).
- [`desktop/src/main/ipc/handle.ts:21`](../../../packages/desktop/src/main/ipc/handle.ts) —
  `handle<S, R>(channel, schema, handler, onInvalid)`. It **resolves, never rejects**, on a schema
  failure; the optimizer's `onInvalid` arm is always `(issue) => ({ ok: false as const, message: issue })`.
- [`desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  `runProcess<T>(command, args, cwd, deps)` (`:126`), `realSpawn` (`:44`): `shell: false`, a fixed
  argument vector, `DEFAULT_TIMEOUT_MS = 120_000` (`:116`), `SIGKILL` on the whole process group
  (`:76`). **Theme D's vendor reclaim commands run through this, unmodified** — it already is
  "spawn one trusted command with no shell and a deadline," which is exactly what a `brew cleanup`
  or `go clean -cache` needs, and nothing else in the repo shells a command at all outside
  diagnostics/testing/video.
  - **Three corrections to the previous draft, each of which a Sonnet executor would otherwise have
    to invent.** (1) `runProcess` takes a **required `cwd`** and a **required `sink: ProcessSink<T>`**
    — there is no zero-config call. (2) A **non-zero exit is `{ok: true}`**, with the code in
    `exitCode`: `ProcessOutcome<T>` is
    `{ok:true; data:T; stderr:string; exitCode:number|null; ranAt; durationMs} | {ok:false; reason:'not-installed'|'timed-out'|'parse-failed'; hint:string}`
    (`:99-101`), so a caller that does not check `exitCode` will report a failed `brew cleanup` as a
    success. (3) `OUTPUT_TAIL_CAP = 200_000` (`:25`) is real and exported, but it caps **stderr
    only** — stdout is uncapped, so Theme D caps its own. `firstLine(text)` (`:216`) is the exported
    helper for turning stderr into one user-facing sentence.
- [`app/src/features/settings/settings-pages/git-safety-page.tsx`](../../../packages/app/src/features/settings/settings-pages/git-safety-page.tsx) —
  the shape Theme C's consent gate copies: its docblock's own reasoning, *"a switch that turns on a
  real force-push is a different weight of decision… it deserves a page a user has to go looking
  for"*, and its `"What this still never does"` box (`:37-44`), whose exact markup
  (`space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground`
  + `<p class="font-medium text-foreground">` + a `list-disc` `<ul>`) Theme C reuses verbatim.
  - **Correction to the previous draft:** `allowForceWithLease` is a **seven**-edit pattern across
    **two** files, not the six-in-one-file the previous draft listed. `ui-store.ts:1093` (interface
    field), `:1094` (interface setter), `:1286` (`PersistedUi` `Pick` member), `:1349` (default),
    `:1350` (setter impl), `:1826` (`partialize` entry), **and
    [`persisted-keys.ts:34`](../../../packages/app/src/store/persisted-keys.ts)**. The seventh is not
    optional: `persisted-keys.ts:158-163`'s `AssertExactPartition` makes an unclassified persisted key
    a **typecheck** failure, and `persisted-keys.test.ts:92-97` makes a `PREFERENCE_KEY` that never
    appears under `features/settings/` a **test** failure. `optimizerEnabled` is the same seven, at
    `ui-store.ts:1112,1113,1288,1359,1360,1828` and `persisted-keys.ts:46`.
  - **No `version` bump and no `migrate` arm** for either, and none for this phase's two — the store
    is on `version: 9` (`ui-store.ts:1750`) and its custom `merge` (`:1918-1947`) spreads a persisted
    blob over the defaults, so an older blob missing a scalar key picks up the default rather than
    arriving `undefined`. The reasoning is stated in the tree at
    [`ui-store.test.ts:419-429`](../../../packages/app/src/store/ui-store.test.ts).
- [`app/src/features/graph/use-graph-actions.ts:452-461`](../../../packages/app/src/features/graph/use-graph-actions.ts) —
  `allowForceWithLease && nonFastForward[ref.fullName] && ref.upstream`: **the setting is never the
  only gate.** Theme C's equivalent AND is `optimizerEnabled && allowSystemCacheClean &&
  systemCacheConsentGiven` (three, not two — see Decision 4).
- [`app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BLAST_RADIUS_COPY` (`:32-43`) has exactly **two** arms today (`commits`, `files`);
  `blastRadiusKind?: keyof typeof BLAST_RADIUS_COPY` (`:53`) derives its type from that object, so
  adding a third arm widens the union with no second edit. `ConfirmRequest` (`:45-81`) carries
  `title`, `body?`, `confirmLabel`, `danger?`, `blastRadius?`, `blastRadiusKind?`, `warnings?`,
  `hideCancel?`, `onConfirm`, `secondaryLabel?`, `onSecondary?`. Requested through
  `useDialogs().confirm(request)`
  ([`dialog-host.tsx:36-40`](../../../packages/app/src/components/dialog-host.tsx)); the real call
  site to copy is [`smart-scan-tab.tsx:40-65`](../../../packages/app/src/features/optimizer/smart-scan-tab.tsx).
  Gains a third arm; see Theme E.
- [`app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  **not reusable as-is**, which the previous draft assumed. Its props are
  `segments: readonly { id: ScanCategory; bytes: number }[]` (`:17-25`) and it looks up
  `CATEGORY_LABELS[segment.id]` and `categoryColor(segment.id)` *internally*. A bar segmented by
  `Ecosystem` cannot pass through it without either widening `ScanCategory` (refused — Decision 3)
  or generalising the component (chosen — Decision 12).
- [`app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) — a plain
  `create()`, **deliberately not persisted**, and
  [`optimizer-store.test.ts:49-57`](../../../packages/app/src/store/optimizer-store.test.ts) enforces
  it with `expect(localStorage.length).toBe(0)`. `OptimizerScanState` (`:15-20`) is
  `{state: 'idle'|'scanning'|'done'|'error'; progress: number; result: ScanResult | null; message: string | null}`
  — the exact shape Theme B's `systemScan` slice mirrors.
- [Phase 72](phase-72-every-build-systems-leftovers.md)'s `ArtifactDetector` shape (`producer`,
  `evidence`, `reclaim: 'cheap'|'costly'`) and its `EcosystemSchema`/`ReclaimCostSchema` — this
  phase imports both types and extends `EcosystemSchema` by one member (`'go'`; Decision 8) rather
  than inventing a parallel taxonomy. Phase 72 ships
  `EcosystemSchema = z.enum(['node','multi','rust','cpp','dotnet','python','java','swift','ruby','git'])`
  — **ten members, in exactly that order**, confirmed by Phase 72's own refinement — and
  `ReclaimCostSchema = z.enum(['cheap','costly'])`, and widens `ScanItemSchema` with
  `detectorId: z.string()` — **a plain string, deliberately not an enum**, because the catalogue
  grows in `desktop/` and a `shared/` enum edit per addition is the coupling that split exists to
  avoid. This phase's `entryId` follows that precedent exactly.

**Sequencing guardrail — this phase depends on a doc, not (yet) on code, and that is verified.**
`git log -- packages/desktop/src/main/optimizer/` returns exactly two commits (`d742bea`, `e38563d`,
both Phase 59); the directory holds only `scan-service`, `gpu-service` and `kill-service` (plus
tests). There is no `detectors.ts`, no `EcosystemSchema`, no `ReclaimCostSchema` — `.midnite/tasks/done.md`
has zero Phase 72 entries and the index has Phase 72 at `0/65 · ◻ TODO`. So:

- **Land Phase 72 Themes A–C before starting this phase's Theme B**, or `EcosystemSchema` and
  `ReclaimCostSchema` do not exist to import. If Phase 72 is still `◻ TODO` when this phase is picked
  up, either wait or absorb those two schema additions here instead — **do not silently duplicate
  them under different names.**
- **Themes A (registry + `confineAllowlist`) and C (the consent gate) have no Phase 72 dependency
  at all** beyond the two type imports, and Theme C has none whatsoever. If only one theme can land,
  land A: it is the security primitive everything else is gated by, and [Phase
  74](phase-74-media-caches-and-the-trash.md)'s Theme A is blocked on it specifically.
- **A partial landing must not leave a half-gate.** Theme C's booleans without Theme E's UI are inert
  and harmless (a setting nothing reads). Theme E's UI without Theme C's gate is a shipped, ungated
  system-wide delete button — **E must never land before C**, and Theme F asserts the gate rather
  than trusting the ordering.

**Scope guardrails.**
- **A registry, not a scanner.** Every candidate path in this phase comes from a fixed,
  hand-written list in source — never a `readdir` walk of an unbounded directory like
  `~/Library/Caches` itself looking for subfolders to guess about. Phase 72's `evidence`-gated
  walker earns its trust by requiring proof beside an ambiguous basename; this phase has no
  basename to disambiguate because it never walks anything above the registry entries themselves.
- **No generic size-threshold heuristic, anywhere.** "Delete anything under `~/Library` older than
  N days / bigger than N bytes" is explicitly rejected as a mechanism — it is how this feature
  deletes something load-bearing the one time the heuristic is wrong, and there is no undo for
  "wrong" the way `shell.trashItem` provides one for "wrong repo path." Every entry needs a named
  `producer` exactly as Phase 72 requires, with no exception.
- **Confinement never touches `knownRoots()` or `confineTree`.** A completely separate function,
  a completely separate registry, a completely separate IPC surface (Theme B) — see the core
  design problem above and Decision 1.
- **Nothing this phase resolves may escape `os.homedir()`.** Both resolver arms are bounded by it:
  a `fixed` path is *defined* as homedir-relative, and a `queryTool` path — which is a string a
  *user-controlled environment variable* can produce (`CARGO_HOME`, `GOCACHE`, `PNPM_HOME`) — is
  refused unless it resolves strictly under the home directory. See Theme A and Decision 11.
- **`shell.trashItem` stays the only delete**, unchanged from Phase 59 and Phase 72. Vendor
  reclaim commands (Theme D) are an *alternative* action offered beside the delete, never a
  replacement for the confirm-and-trash path. No `fs.rm`, no `unlink`, anywhere in this phase.
- **Three-factor consent, not one checkbox.** See Theme C and Decision 4.
- **No new dependency, no shell string.** `runProcess`/`realSpawn` already forbids a shell
  (`shell: false`) and takes an argument vector, never a template string — Theme D's commands are
  literal `readonly string[]` arrays, never built by concatenation, and never sourced from the
  renderer.
- **`ScanCategory` does not widen.** Not for a `'systemCache'` member, not for anything. It is a
  closed union consumed by two exhaustive `Record`s
  ([`category-palette.ts:19,38`](../../../packages/app/src/features/optimizer/category-palette.ts))
  and two hand-written `CATEGORY_ORDER` literals (`storage-tab.tsx:9-14`, `smart-scan-tab.tsx:14-19`),
  and widening it is precisely the merge Theme B exists to refuse.
- **`git-engine` gains nothing.** Same guardrail as Phase 59 and 72; nothing here is a git
  operation.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus. **Theme B is re-tagged
M → L** by this refinement: it grew from five items to ten, and it now owns five channels, a
renderer store slice and the per-entry walk budget rather than just a pair of schemas.

---

## Deliverables

### A — The system cache registry and its own confinement primitive (L) — ✅ DONE (PR #191, 2026-09-05)

- [x] Add `packages/desktop/src/main/optimizer/system-cache-registry.ts` — a new module, not an
      extension of [Phase 72](phase-72-every-build-systems-leftovers.md)'s `detectors.ts`.
  - The two catalogues answer different questions ("what's this repo's build output" vs. "what's
    this *machine's* tool cache") and mixing them risks exactly the accidental-widening bug the core
    design problem describes.
  - **Acceptance:** the file imports `Ecosystem`/`ReclaimCost` from `@midnite/studio-shared` and
    nothing from `detectors.ts`; `detectors.ts` imports nothing from it. Asserted by inspection in
    review, not by a test — an import-direction test here would be ceremony.
- [x] Export the id union and the entry shape:
      ```ts
      /** Every id in DEFAULT_SYSTEM_CACHE_ENTRIES, as a closed union. Adding an entry is
       *  two edits in this file: a member here, an object there. */
      export type SystemCacheEntryId =
        | 'cargo-registry'  | 'go-build-cache'    | 'go-mod-cache'   | 'gradle-caches'
        | 'maven-repository'| 'nuget-packages'    | 'xcode-deriveddata'
        | 'cocoapods-cache' | 'pip-cache'         | 'npm-cache'
        | 'pnpm-store'      | 'yarn-cache'        | 'homebrew-cache';

      export type SystemCacheEntry = {
        /** Stable, kebab, never reused — settings key, test name, and the wire's `entryId`. */
        id: SystemCacheEntryId;
        label: string;                 // "Cargo registry"
        ecosystem: Ecosystem;          // from shared/src/domain/optimizer.ts (Phase 72), widened — Decision 8
        producer: string;              // "cargo build / cargo install (re-downloads on demand)"
        reclaim: ReclaimCost;          // 'cheap' | 'costly', from Phase 72
        /** How the real path is obtained. See the two arms below and Decision 2. */
        resolve: PathResolver;
      };
      ```
  - **The cost field is named `reclaim`, not `cost`** — it is Phase 72's `ReclaimCost`, imported, not
    a parallel grading. [Phase 74](phase-74-media-caches-and-the-trash.md) writes its two Plex
    entries against this exact spelling.
  - `SystemCacheEntryId` is an **explicit union**, deliberately, where Phase 72 writes a `DetectorId`
    it never defines. A typo'd `entryId` in `DEFAULT_RECLAIM_COMMANDS` (Theme D) or in a test then
    fails to compile rather than failing to match at runtime. On the **wire** it degrades to
    `z.string()` — same reasoning Phase 72 gives for `detectorId`: the catalogue lives in `desktop/`
    and must not force a `shared/` enum edit per addition.
- [x] Export `PathResolver` as a two-arm union, and say in the docblock which is preferred:
      ```ts
      export type PathResolver =
        /** A fixed, well-known location, expressed RELATIVE TO THE HOME DIRECTORY:
         *  no leading `~`, no leading `/`. Resolved as join(os.homedir(), path).
         *  Only for a location the tool has never made configurable. */
        | { kind: 'fixed'; path: string }
        /** Ask the tool itself, read-only, via the existing runProcess/realSpawn primitive.
         *  Preferred whenever the tool exposes one: hardcoding a configurable path is how this
         *  registry drifts out of date the day someone customises their `CARGO_HOME`. */
        | { kind: 'queryTool'; command: string; args: readonly string[]; timeoutMs?: number;
            parse: (stdout: string) => string | null };
      ```
  - **The path-form rule is absolute and tested**: a `fixed` path beginning with `~` or `/` is a
    registry authoring bug, not a path to be normalised. `system-cache-registry.test.ts` asserts
    `every(e => e.resolve.kind !== 'fixed' || (!e.resolve.path.startsWith('~') && !isAbsolute(e.resolve.path)))`.
    One rule, one join site, no per-entry normalisation to get subtly wrong.
  - `queryTool` never has side effects — `go env GOCACHE`, `pnpm store path`, `brew --cache` are
    pure reads. Each runs through `runProcess` with `timeoutMs` defaulting to **`5_000`, not
    `DEFAULT_TIMEOUT_MS`**: a hung `go env` must not stall a scan for two minutes, and a probe that
    slow is indistinguishable from a broken one.
  - **Any failure means the entry contributes zero, silently to the user and loudly to the log** —
    missing binary (`{ok:false, reason:'not-installed'}`), timeout, **non-zero `exitCode` on an
    otherwise-`ok:true` outcome**, unparsable output, or a `parse` returning `null`. The in-repo
    precedent is `readDirSafe`
    ([`scan-service.ts:83-92`](../../../packages/desktop/src/main/optimizer/scan-service.ts)), which
    logs and returns `[]` rather than failing a whole scan over one unreadable directory. The rule
    this phase states in its own words: **a miss is silence, a false match is a data-loss incident.**
    (The previous draft attributed this phrasing to Phase 59's `looseObjects` posture; Phase 59 does
    not say it — the honest citation is `readDirSafe`'s behaviour above.)
- [x] Export `resolveSystemCacheEntries(entries, log): Promise<ResolvedSystemCacheEntry[]>` where
      `ResolvedSystemCacheEntry = { entry: SystemCacheEntry; path: string }` — the **only** place a
      `queryTool` command is ever run, and the only place a registry entry becomes a real path.
  - Per entry, in order, dropping the entry (and logging one line) at the first failure:
    1. Resolve — `join(homedir(), entry.resolve.path)` for `fixed`; `runProcess` + `parse` for
       `queryTool`.
    2. **Absolute-path check** — a `queryTool` result that is not absolute is dropped.
    3. **Home containment check** — `resolved === homedir` is dropped (the home directory itself is
       never an entry, mirroring `confineTree`'s "the root itself is never a target"), and
       `!resolved.startsWith(homedir + sep)` is dropped. This is what bounds a *user-environment-
       supplied* string: `GOCACHE=/` or `CARGO_HOME=/Users/me/Documents/..` cannot produce an entry.
    4. **`lstat`** — a path that does not exist is dropped (a tool that is installed but has never
       run has no cache, and that is not an error). **A path whose own final segment is a symlink is
       dropped** — see the core design problem and Decision 10. A path that is not a directory is
       dropped.
  - **Never throws.** The return is the surviving entries; the caller cannot distinguish "not
    installed" from "nothing cached", and does not need to.
  - **Acceptance:** with a fake `homedir` containing only `.npm`, the function returns exactly one
    entry, and calling it with every `queryTool` command stubbed to fail returns only the surviving
    `fixed` entries.
- [x] Export `DEFAULT_SYSTEM_CACHE_ENTRIES: readonly SystemCacheEntry[]`, seeded with the catalogue
      below — thirteen entries, every path verified against the tool's own documentation or its own
      `env`/`config` command, not guessed. Paths are written **homedir-relative**, per the rule above.
      - **Rust** — `cargo-registry` (`fixed`, `.cargo/registry`, ecosystem `rust`, producer
        `cargo build / cargo install`, **costly** — a full re-download, not a rebuild).
      - **Go** — `go-build-cache` (`queryTool: go env GOCACHE`, ecosystem `go`, producer `go build`,
        **cheap** — a local recompile); `go-mod-cache` (`queryTool: go env GOMODCACHE`, ecosystem
        `go`, producer `go build`/`go mod download`, **costly**). Both fall back to nothing (not a
        hardcoded guess) if `go` is not on `PATH`. `parse` is `(out) => out.trim() || null` for both
        — `go env` prints one bare path and a trailing newline.
      - **Gradle** — `gradle-caches` (`fixed`, `.gradle/caches`, ecosystem `java`, producer
        `gradle build`, **costly**).
      - **Maven** — `maven-repository` (`fixed`, `.m2/repository`, ecosystem `java`, producer
        `mvn package`, **costly**).
      - **.NET** — `nuget-packages` (`fixed`, `.nuget/packages`, ecosystem `dotnet`, producer
        `dotnet build`/`dotnet restore`, **costly**).
      - **Swift/Xcode** — `xcode-deriveddata` (`fixed`, `Library/Developer/Xcode/DerivedData`,
        ecosystem `swift`, producer `xcodebuild`, **cheap** — the shared counterpart to Phase 72's
        project-local `DerivedData` entry, which only ever caught the override); `cocoapods-cache`
        (`fixed`, `Library/Caches/CocoaPods`, ecosystem `swift`, producer `pod install`, **costly**).
      - **Python** — `pip-cache` (`fixed`, `Library/Caches/pip`, ecosystem `python`, producer
        `pip install`, **costly**).
      - **Node/web** — `npm-cache` (`fixed`, `.npm`, ecosystem `node`, producer `npm install`,
        **costly**); `pnpm-store` (`queryTool: pnpm store path`, ecosystem `node`, producer
        `pnpm install`, **costly** — pnpm's content-addressable store is shared across every
        project on the machine, the single most consequential `costly` entry in this catalogue);
        `yarn-cache` (`fixed`, `Library/Caches/Yarn`, ecosystem `node`, producer `yarn install`,
        **costly**).
      - **Homebrew** — `homebrew-cache` (`queryTool: brew --cache` with no argument, which prints
        the cache **directory**, not a package path; ecosystem `multi`, producer
        `brew install`/`brew upgrade`, **costly**). Not `brew cleanup`'s target list — that is
        Theme D, which runs the command instead of trashing the directory (Decision 6).
  - **Every ecosystem used here already exists** in the ten-member union Phase 72 ships, plus this
    phase's `'go'`: `rust`, `go`, `java`, `dotnet`, `swift`, `python`, `node`, `multi`. No entry
    invents a label. See Decision 8 for exactly *where* `'go'` is inserted — the position is part of
    the contract, not a stylistic choice.
  - **Deliberately absent**: anything under `~/Library/Caches` for a non-build-tool application
    (browsers, Slack, Zoom, …). "Common system caches" beyond dev tools is real scope from the
    original ask, but every entry here is independently verified against source documentation —
    a browser's cache directory is not, and a wrong guess there is exactly the failure mode this
    phase's whole design exists to refuse. Add them one at a time, each with its own verified
    path, the way Phase 72 added ecosystems one at a time with a real repo to test against.
- [x] Add `confineAllowlist(allowed: readonly string[], target: string): Promise<string | null>`
      to [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts), beside (not
      replacing) `confineTree`.
  - **The rule, exactly:** `realpath` the target; `realpath` every entry in `allowed`; return the
    resolved target **only if it is `===` one resolved entry**. No `startsWith`, no `+ sep`, no
    descent, no prefix match of any kind. Refusal is `null`, never a throw — including when either
    side does not exist, matching `confineTree`'s own `try/catch` (`:218-222`).
  - It takes **already-resolved absolute path strings**, not registry objects. The caller
    (`cleanSystemCaches`) builds that array fresh from `resolveSystemCacheEntries` at clean time; a
    function that took `SystemCacheEntry[]` would invite a caller to pass a stale, pre-scan list.
  - Docblock states explicitly why this is stricter than `confineTree`: there is no "the user
    opened this" trust to extend downward from a home-directory path, so nothing is trusted
    beyond the literal registry entry itself — **and** why exact-match alone is insufficient
    (the symlinked-entry hole in the core design problem), pointing at `resolveSystemCacheEntries`
    as the place that closes it.
  - **Acceptance:** exact match returns the resolved path; a subpath, a parent, a sibling whose name
    shares a prefix, and a path outside every entry each return `null`.
- [x] Export `dirBytes` (`:101`), `readDirSafe` (`:83`), `newWalkState` (`:63`) and the `WalkState`
      type (`:55`) from
      [`scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) — **four
      `export` keywords, no behaviour change, no signature change, no budget change.**
  - Chosen over the alternative (copy the iterative walker into `system-cache-service.ts`) because
    `dirBytes` is security-and-budget-critical machinery whose symlink skip (`:119`), abort checks
    (`:111`, `:117`) and entry-budget accounting are exactly what a second copy would drift on. A
    keyword-only diff is reviewable at a glance; a duplicated walker is not.
  - **This phase owns this edit**, agreed on the coordination board: [Phase
    74](phase-74-media-caches-and-the-trash.md) Theme B needs the same four symbols for its Trash
    walk and would otherwise spec the identical change. `readDirSafe` and `WalkState` are exported
    here even though this phase does not itself call them, precisely so Phase 74's item becomes a
    no-op rather than a second edit to the same file.
  - Say so in the PR description: **"`scan-service.ts` changes by four `export` keywords and nothing
    else"** is a claim a reviewer can verify from the diff, per Phase 72's own precedent for the
    same style of claim.
- [x] `system-cache-registry.test.ts` — the registry's own spec, colocated in
      `packages/desktop/src/main/optimizer/`.
  - Every `fixed` entry's path resolves under a fake `homedir` and none begins with `~` or `/`.
  - Every `queryTool` entry's `parse` returns the right path from a **captured real stdout** —
    `go env GOCACHE`'s actual output shape, `pnpm store path`'s, `brew --cache`'s — and returns
    `null` for empty output and for multi-line noise.
  - A `queryTool` whose spawn reports `not-installed` yields no entry and **no thrown error**; so
    does one that exits non-zero with output on stdout.
  - A `queryTool` result outside the home directory is dropped; `homedir()` itself is dropped.
  - An entry whose resolved path is a **symlink** is dropped (the Decision 10 case, asserted
    directly rather than left implied).
  - Every `id` in `DEFAULT_SYSTEM_CACHE_ENTRIES` is unique and is a member of `SystemCacheEntryId`;
    every entry has a non-empty `producer` (the scope guardrail, enforced).

### B — A parallel wire contract, never merged with the repo-scoped one (L) — ✅ DONE (PR #191, 2026-09-05)

- [x] Add `packages/shared/src/domain/system-optimizer.ts` — **not** an edit to
      `domain/optimizer.ts`, and add `export * from './system-optimizer';` to
      [`domain/index.ts`](../../../packages/shared/src/domain/index.ts) between `'./status'` and
      `'./tests'` (the barrel is alphabetical apart from a trailing `'./battery'`).
      `SystemCacheItemSchema` and `ScanItemSchema` must never be structurally interchangeable, so
      that no future call site can hand a system-wide path to code that assumes it sits under
      `knownRoots()` by mistake.
      ```ts
      export const SYSTEM_SCAN_ITEMS_CAP = 200;

      export const SystemCacheItemSchema = z.object({
        /** Display only. Never echoed back to main — a clean names entryIds. */
        path: z.string(),
        bytes: z.number().nonnegative(),
        /** True when the walk hit its budget: `bytes` is a floor, not a total. */
        approximate: z.boolean(),
        entryId: z.string(),           // matches SystemCacheEntry.id — no repoId field exists here
        ecosystem: EcosystemSchema,    // imported from domain/optimizer.ts (Phase 72)
        reclaim: ReclaimCostSchema,    // imported from domain/optimizer.ts (Phase 72)
        label: z.string(),
        producer: z.string(),
      });
      export const SystemScanResultSchema = z.object({
        totalBytes: z.number().nonnegative(),
        /** True if any item is approximate — the tab's own banner keys on this. */
        approximate: z.boolean(),
        byEcosystem: z.record(EcosystemSchema, z.number().nonnegative()),
        items: z.array(SystemCacheItemSchema).max(SYSTEM_SCAN_ITEMS_CAP),
      });
      /** What the renderer may know about the catalogue before any scan — no paths. */
      export const SystemCacheCatalogueEntrySchema = z.object({
        entryId: z.string(), label: z.string(), producer: z.string(),
        ecosystem: EcosystemSchema, reclaim: ReclaimCostSchema,
      });
      ```
  - `SYSTEM_SCAN_ITEMS_CAP = 200` — an allowlist this small never needs Phase 72's 2,000-item cap; a
    cap two orders of magnitude tighter is itself a signal if it is ever hit. There is no `truncated`
    field: a thirteen-entry registry cannot produce 200 items, and a `truncated` flag nothing can set
    is a flag nobody tests.
  - `byEcosystem` mirrors the roll-up Phase 72 Theme C adds to `ScanResultSchema`, and for the same
    reason: **it is computed in main during the walk**, so the renderer's bar renders from totals
    rather than re-aggregating items on every render.
  - **`path` is display-only and is never accepted back.** Stated in the schema's own docblock,
    enforced by the request shape below. This is the field a future call site would otherwise feed
    into a confinement check.
  - **`label` and `producer` ride on every item here, deliberately, where Phase 72 hoists them into a
    `detectors` map on `ScanResultSchema`.** Phase 72 does that because repeating two prose strings
    across up to `SCAN_ITEMS_CAP = 2_000` items puts ~100 KB of duplicated text on the wire; this
    result is capped at 200 and can never exceed the registry's thirteen entries, so a map keyed by
    `entryId` would be pure indirection for a payload measured in bytes. Say so in the schema comment,
    because the asymmetry with `ScanResultSchema` will otherwise read as an oversight.
- [x] Add **five** channels following the `mstudio:<domain>:<verb>` rule
      ([`channels.ts:1-9`](../../../packages/shared/src/ipc/channels.ts) states the convention) —
      four invoke, one event, in the **two separate objects** the file actually uses:
      ```ts
      // CHANNELS (closes at :681)
      optimizerSystemCatalogue: 'mstudio:optimizer:system-catalogue',
      optimizerSystemScan:      'mstudio:optimizer:system-scan',
      optimizerSystemClean:     'mstudio:optimizer:system-clean',
      optimizerSystemReclaim:   'mstudio:optimizer:system-reclaim',
      // EVENT_CHANNELS (opens at :683)
      optimizerSystemScanProgress: 'mstudio:optimizer:system-scan-progress',
      ```
  - **Never reuse `optimizerScan`/`optimizerClean`** — a shared channel would need a shared
    request/response schema, which is the merge this theme exists to refuse.
  - The previous draft named three and omitted both the catalogue read (Theme C's dialog needs it —
    the renderer may not import `packages/desktop`, so it cannot read the registry directly;
    Decision 11) and Theme D's reclaim channel, which the draft specified a function for but no way
    to call.
  - `EVENT_CHANNELS` is a **separate exported object** from `CHANNELS`, not a prefix convention —
    putting the progress channel in `CHANNELS` compiles and then silently never fires.
  - Schemas in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) beside the Phase 59
    block (`:1887-1922`), following its exact one-line response convention
    `export const XResponse = OptimizerResultOf(SomeSchema);`:
    `OptimizerSystemCatalogueResponse`, `OptimizerSystemScanRequest` (an empty `z.object({})` — there
    is no `extraRoot` here and never will be), `OptimizerSystemScanResponse`,
    `OptimizerSystemScanProgressEventSchema` (`{done, total}`, identical to Phase 59's),
    `OptimizerSystemCleanRequest`, `OptimizerSystemCleanResponse`, `OptimizerSystemReclaimRequest`,
    `OptimizerSystemReclaimResponse`.
  - **Acceptance:** `ipc.test.ts:26-38`'s two global assertions (no duplicate channel name; every
    name starts with `mstudio:`) pass unchanged. There is no `covers every optimizer channel` test
    today — Theme F adds one.
- [x] `OptimizerSystemCleanRequest` carries `entryIds: z.array(z.string().min(1)).min(1)` — **not
      raw paths.** The renderer names *which registry entries* to clean, and main re-resolves +
      re-confines each one fresh at clean time rather than trusting a path the renderer remembers
      from its last scan.
  - This is the TOCTOU rule, and it is stronger than Phase 59's. Phase 59 Theme C re-validates the
    path the renderer sent (`confineTree` + `lstat` + symlink refusal, `scan-service.ts:305-326`,
    the reasoning in Phase 59's Decision 8 — **not** its Decision 9, which is about `trashItem` vs
    `fs.rm`; the previous draft miscited it). Here the renderer cannot send a path at all, so the
    window is not merely re-checked, it is closed: the only thing that can name a delete target is
    the hand-written registry, re-read at the moment of the delete.
  - **Acceptance:** a clean request naming an `entryId` not in `DEFAULT_SYSTEM_CACHE_ENTRIES` is
    refused with `{ok:false}` before any filesystem call — asserted with a `trash` spy that must
    never be invoked.
- [x] Extend the bridge and the preload, copying the existing optimizer group verbatim in shape.
  - [`bridge.ts:896-916`](../../../packages/shared/src/ipc/bridge.ts) — add to the existing
    `optimizer: { … }` group (not a new top-level group): `systemCatalogue()`, `systemScan(req)`,
    `onSystemScanProgress(handler): Unsubscribe`, `systemClean(req)`, `systemReclaim(req)`.
    Requests use the file's `In<typeof S.X>` (`z.input`) helper; responses use `z.infer`.
  - [`preload/index.ts:502-509`](../../../packages/desktop/src/preload/index.ts) — five lines in the
    same object, using the file's `call(...)` and `subscribe(...)` helpers. **Adding to the bridge
    type without adding here is a compile error**, by the `Pick<MidniteStudioBridge, … | 'optimizer' | …>`
    annotation at `:93-146` — that is the whole parity mechanism, and it is why no separate parity
    test is needed.
- [x] Add `packages/desktop/src/main/optimizer/system-cache-service.ts` with two functions plus
      Theme D's third:
      ```ts
      export async function scanSystemCaches(opts: {
        signal: AbortSignal;
        onProgress: (done: number, total: number) => void;
        log?: Logger;
      }): Promise<SystemScanResult>;

      export async function cleanSystemCaches(
        entryIds: readonly string[],
        trash: (path: string) => Promise<void>,
        log?: Logger,
      ): Promise<CleanOutcome>;
      ```
  - `scanSystemCaches` calls `resolveSystemCacheEntries`, then `dirBytes` per surviving entry,
    accumulating `totalBytes` and `byEcosystem`. `CleanOutcome` is imported from `scan-service.ts`
    (`:275`) — a desktop-internal type reuse with no boundary implication, and its wire form is the
    **existing** `OptimizerCleanResultSchema`, reused rather than duplicated: an outcome report
    carries `freedBytes` and `skipped[].path` and nothing re-submittable, so Decision 3's refusal to
    merge — which is about *item and scan* shapes, the ones a call site could feed back into a
    confinement check — does not apply to it. Say this in the code comment so a later reader does
    not "fix" it in either direction.
  - `cleanSystemCaches` is the same three-step shape as `cleanItems`, over the allowlist instead of
    `knownRoots()`, and in this order: (1) `resolveSystemCacheEntries` fresh — which re-applies the
    symlink and home-containment refusals; (2) `lstat` the resolved path and skip a symlink or a
    vanished path with a reason, exactly as `cleanItems` does at `:305-316`; (3) `confineAllowlist`
    against the freshly-resolved paths, then `dirBytes` for the freed figure, then `trash`.
    An `entryId` the registry does not know is skipped with `reason: 'not a known system cache'`.
- [x] **Per-entry walk budgets, so one enormous cache cannot silently zero the rest.**
      `scanSystemCaches` gives **each entry its own `newWalkState()`**, and adds
      `MAX_ENTRIES_PER_SYSTEM_ENTRY = 50_000` to `system-cache-service.ts`.
  - This is Phase 72 Theme E's own fairness argument, applied to a strictly worse case: a shared
    walk state would let `~/Library/Developer/Xcode/DerivedData` — routinely hundreds of thousands
    of files — consume the entire 200,000-entry budget and make every later entry report zero. Phase
    72 chose `MAX_ENTRIES_PER_ROOT = 50_000` for repos; this matches it rather than inventing a
    second number.
  - When an entry hits its budget, its item carries `approximate: true` and the result's top-level
    `approximate` is `true`. **The under-report is visible, not silent** — that is the whole point,
    and Theme E renders it.
  - `MAX_WALK_DEPTH` is untouched and `MAX_WALK_ENTRIES` is irrelevant here (each entry has its own
    state); no existing budget constant changes.
  - **Acceptance:** a fixture entry with more than `MAX_ENTRIES_PER_SYSTEM_ENTRY` files yields
    `approximate: true` and a **non-zero** `bytes`, and a second entry scanned after it still
    reports its own real size.
- [x] Register four handlers in
      [`optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts), in the
      same file beside the existing ones, using the same `handle(channel, schema, fn, onInvalid)`
      pattern and the same `(issue) => ({ ok: false as const, message: issue })` arm.
  - The system scan gets its **own** single-flight controller, `let currentSystemScan: AbortController | null = null`,
    **not** the existing `currentScan`. Sharing one would mean starting a system scan silently aborts
    an in-flight Smart Scan (and vice versa), which the user experiences as "my scan stopped for no
    reason." Two independent surfaces, two controllers — Decision 14.
  - Progress is emitted with the same window-guarded pattern as Phase 59's
    (`const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.optimizerSystemScanProgress, { done, total })`).
  - The clean handler's `trash` argument is `(path) => shell.trashItem(path)` — the same one line as
    `:58`, and the only delete route this phase has.
- [x] Add a `systemScan` slice and a `systemCatalogue` field to
      [`optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts), reusing the
      existing `OptimizerScanState` type verbatim (`{state, progress, result, message}`) with
      `result: SystemScanResult | null`, plus `systemCatalogue: SystemCacheCatalogueEntry[] | null`
      and the four actions mirroring `startScan`/`scanProgress`/`scanDone`/`scanError`.
  - The store stays **unpersisted**, and `optimizer-store.test.ts:49-57`'s
    `expect(localStorage.length).toBe(0)` is the assertion that keeps it that way — it must still
    pass with the new slice, which is a real check that nobody reached for `persist` out of habit.
  - `systemCatalogue` is fetched once when the settings page or the System section mounts, not per
    scan — it is a list of thirteen constants.
- [x] `system-cache-service.test.ts`: a scan produces `totalBytes` matching a fixture's real size
      and a `byEcosystem` that sums to it; an entry whose resolved path no longer exists is silently
      absent, not an error; a clean request naming an unknown `entryId` never reaches `trash`; a
      clean whose entry has become a symlink between scan and clean is skipped with a reason rather
      than followed; an aborted scan resolves with a partial result rather than throwing (the
      cooperative-abort contract `scanWorkspace` already keeps).

### C — A stronger consent gate than a checkbox (M) — ✅ DONE (PR #191, 2026-09-05)

Phase 22's `allowForceWithLease` and Phase 59's `optimizerEnabled` are each one persisted boolean
plus a runtime AND. The blast radius here is qualitatively larger — the whole machine's dev
tooling, not one ref or one repo — so this theme adds a second factor beyond the checkbox itself.

- [x] Add `allowSystemCacheClean: boolean` (default `false`) following `allowForceWithLease`'s
      **seven**-edit pattern across **two** files: `ui-store.ts` ×6 (interface field, interface
      setter, `PersistedUi` `Pick` member, default, setter impl, `partialize` entry) **plus
      [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts)** as a
      `PREFERENCE_KEY` with a `// optimizer-settings-page.tsx` trailing comment, matching `:46`.
  - **No `version` bump, no `migrate` arm** — the store's custom `merge` (`ui-store.ts:1918-1947`)
    already spreads a persisted blob over the defaults, so an older blob picks up `false`. The
    reasoning is written down in the tree at `ui-store.test.ts:419-429`; do not add a tenth version.
  - Omitting the `persisted-keys.ts` edit is a **typecheck** failure
    (`persisted-keys.ts:158-163`'s `AssertExactPartition`), and a `PREFERENCE_KEY` whose identifier
    never appears under `features/settings/` is a **test** failure (`persisted-keys.test.ts:92-97`)
    — both are satisfied by writing this theme's settings control.
- [x] Add `systemCacheConsentGiven: boolean` (default `false`) as a second, separate persisted
      field, the same seven edits again — **14 edits across two files for the pair**, not the "eight
      edits total" the previous draft claimed.
  - Set once, the first time the user confirms the one-time acknowledgment dialog. **Toggling the
    setting off and back on does not re-ask**; a fresh install or a fresh profile does. This is the
    second factor: a user who flips the switch without reading anything still has to click through
    one dialog that names, in plain language, what just got unlocked.
  - **Turning `allowSystemCacheClean` off does NOT clear `systemCacheConsentGiven`.** Consent
    records a fact about what the user was shown, not a live permission; the live permission is the
    three-way AND. Clearing it would re-prompt on every toggle, which trains people to dismiss the
    dialog — the opposite of what it is for.
- [x] **The checkbox opens the dialog; the dialog sets the checkbox.** Clicking the unchecked box
      does **not** call `setAllowSystemCacheClean(true)` — it calls
      `dialogs.confirm(consentRequest)`, and only `onConfirm` sets **both** booleans true.
      Unchecking (true → false) is immediate and asks nothing.
  - Chosen over "set optimistically, revert on cancel" because that leaves a real window — however
    brief, and however much longer if a render is slow — in which `allowSystemCacheClean` is `true`
    with no consent recorded, and it makes the checkbox visibly flicker on cancel. Neither is
    acceptable for the switch that unlocks a machine-wide delete.
  - **Acceptance:** in a renderer test, firing a click on the unchecked box leaves
    `useUiStore.getState().allowSystemCacheClean === false` until the dialog's confirm is invoked.
- [x] The one-time dialog is a `ConfirmRequest` with `danger: true` and **no `blastRadius`** —
      nothing has been scanned yet, and `confirm-dialog.tsx:164` renders an absent radius as
      *"Checking what this affects…"*, which would be a lie here; pass `blastRadius: null` so the
      `noEffect` branch is skipped and only `body` + `warnings` render.
  - `title`: `"Allow Midnite to clean caches outside your repos?"` · `confirmLabel`:
    `"I understand — allow it"`.
  - `body`, in substance: *"Midnite can now scan and clean caches outside any repo it manages, in
    your home directory. Nothing outside the named list below is ever touched, deletes still go to
    the Trash first, and this never reaches Photos, Documents, Desktop, or any repo's actual
    source."*
  - `warnings` carries **the enumeration, derived from the catalogue, not written as prose** — the
    joined `label`s of `systemCatalogue` (fetched over `optimizerSystemCatalogue`). See the next
    item and Decision 9.
  - Cancelling leaves both booleans `false`.
- [x] **The enumeration is derived, never hardcoded — in the dialog and on the settings page.**
      The dialog's list and a permanent list beside the checkbox both render from
      `systemCatalogue`.
  - The dialog's whole design promise is that it names *exactly* what got unlocked. Hardcoded prose
    silently drifts the first time the catalogue grows — which is precisely [Phase
    74](phase-74-media-caches-and-the-trash.md)'s Theme A, two Plex entries. Deriving it means a
    catalogue addition updates the consent copy by construction.
  - The renderer **cannot** read `DEFAULT_SYSTEM_CACHE_ENTRIES` directly — `packages/app` may not
    import `packages/desktop` (`eslint.config.mjs`'s per-package `no-restricted-imports`). That is
    why `optimizerSystemCatalogue` exists as its own channel rather than the labels riding on a scan
    result: consent is asked *before* any scan, and the gate blocks scanning, so a scan-carried list
    would be circular.
  - The permanent list on the settings page is what makes Decision 9 (re-consent on catalogue
    growth) unnecessary: the covered set is always visible without a modal.
- [x] Add a "System caches" `Accordion` section to
      [`optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
      **not a new settings page** (Decision 5). Phase 72 Theme E already put per-ecosystem opt-outs
      on this page; System caches is one more section on the same page.
  - Structure copies the existing section exactly: `<Accordion title="System caches" icon={<LuHardDrive className="h-4 w-4" />}>`
    (`Accordion` from `@bilo-io/ui`, already imported at `:1`), a `<Field label hint>` from
    `./controls` (**`hint` is required**, not optional — `field.tsx:14`), and the same checkbox
    markup: `<label className="flex items-center gap-2 text-xs">` wrapping
    `<input type="checkbox" className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />` with the label
    text repeated as the accessible name, exactly as `optimizer-settings-page.tsx:22-33` does.
  - The whole section is rendered **only when `optimizerEnabled`** is true — the switch that unlocks
    a machine-wide delete should not even be visible to someone who has not turned the Optimizer on.
  - Include a "What this still never does" box reusing `git-safety-page.tsx:37-44`'s exact classes:
    *"Never `~/Library` wholesale — only the named list above. Never a path that is a symlink, even
    a named one. Never the system Trash (a separate review). Never Plex or another media tool's cache
    (a separate review). Never a path this registry doesn't name, and never one from a repo-scan
    `extraRoot` picker."*
- [x] The System section's scan action (Theme E) only renders once **all three** are true:
      `optimizerEnabled && allowSystemCacheClean && systemCacheConsentGiven` — matching the
      `use-graph-actions.ts:452-461` "the setting is never the only gate" pattern with a third
      condition instead of two. The same AND guards the main-side handlers is **not** true and must
      not be assumed: main has no view of renderer settings, which is exactly why the registry and
      `confineAllowlist` are the real defence and the gate is the second one.
- [x] `system-cache-consent.test.tsx` in
      `packages/app/src/features/settings/settings-pages/` (an RTL test — `.tsx`, matching
      `mcp-page.test.tsx`'s naming and its `installBridge` + local `createWrapper` idiom; there is no
      shared renderer mock bridge, and `vitest.config.ts` has no `setupFiles`, so the file does its
      own `afterEach(cleanup)` and deletes `window.midniteStudio`).
  - Clicking the toggle without confirming leaves both booleans false and the System section's action
    hidden; confirming sets both; the pair survives a simulated reload (assert `partialize` output,
    not a real reload).
  - The rendered enumeration contains every `label` the stubbed `systemCatalogue` returns — the
    assertion that the derivation actually holds.
  - Gating is driven with `useUiStore.setState({ … })`, the precedent at
    `use-graph-actions.test.tsx:90,96,120`.

### D — Vendor reclaim commands, run through the existing trusted-spawn primitive (M)

- [ ] Add `packages/desktop/src/main/optimizer/reclaim-commands.ts` exporting a fixed table:
      ```ts
      export type ReclaimCommand = {
        entryId: SystemCacheEntryId;  // which SystemCacheEntry this offers an alternative to
        label: string;                // "Run brew cleanup -s"
        command: string;
        args: readonly string[];      // never built by concatenation or user input
      };
      export const DEFAULT_RECLAIM_COMMANDS: readonly ReclaimCommand[] = [
        { entryId: 'homebrew-cache', label: 'Run brew cleanup -s', command: 'brew', args: ['cleanup', '-s'] },
        { entryId: 'go-build-cache', label: 'Run go clean -cache', command: 'go', args: ['clean', '-cache'] },
        { entryId: 'go-mod-cache', label: 'Run go clean -modcache', command: 'go', args: ['clean', '-modcache'] },
        { entryId: 'pnpm-store', label: 'Run pnpm store prune', command: 'pnpm', args: ['store', 'prune'] },
      ];
      ```
  - Typing `entryId` as `SystemCacheEntryId` rather than `string` makes a typo here a compile error
    rather than a silently-never-offered command.
  - Cargo's `cargo cache -a` is deliberately **not** in the default table: it needs the
    `cargo-cache` subcommand installed separately (not part of a stock `cargo`), and this
    catalogue does not offer a command whose own absence would need a second "is it installed"
    probe beyond the existing `runProcess` "binary not found" outcome. Add it once `cargo-cache`'s
    prevalence is checked, not speculatively.
- [ ] Run every command through **the existing** `runProcess`/`realSpawn`
      ([`process-runner.ts:44,126`](../../../packages/desktop/src/main/process-runner.ts)),
      unmodified — no shell, a fixed argv, `DEFAULT_TIMEOUT_MS` (2 minutes), `SIGKILL` on the
      process group at timeout. This is the same primitive `diagnostics/runner.ts` and
      `testing/runner.ts` already trust; a vendor reclaim command is a **fourth** caller (the three
      today are [`video/render-service.ts:202`](../../../packages/desktop/src/main/video/render-service.ts),
      [`testing/runner.ts:46`](../../../packages/desktop/src/main/testing/runner.ts),
      [`diagnostics/runner.ts:79`](../../../packages/desktop/src/main/diagnostics/runner.ts), each
      with its own private buffer sink), not a new execution model. [Phase
      74](phase-74-media-caches-and-the-trash.md)'s `osascript` call is the fifth — neither doc
      should claim to be "the third".
  - `runProcess` requires a `cwd` and a `sink`, neither of which has a default. **`cwd` is
    `os.homedir()`** — a directory guaranteed to exist and deliberately not a repo, so nothing here
    can pick up a repo-local tool configuration. **`sink` is a small `collectStdout(): ProcessSink<string>`**
    defined in `system-cache-service.ts`: `push` appends, `finish` returns `{ok: true, data: joined}`.
    It never fails to parse, so `reason: 'parse-failed'` is unreachable for these callers.
- [ ] Add `runReclaimCommand(entryId): Promise<OptimizerResultOf<{ stdout: string; stderr: string; exitCode: number | null }>>`
      in `system-cache-service.ts`, looked up against `DEFAULT_RECLAIM_COMMANDS` by `entryId` —
      **never accepts a command or args from the renderer.** The IPC request carries only an
      `entryId` string; the actual argv is resolved main-side from the fixed table.
  - **A non-zero exit is a failure and must be mapped as one.** `runProcess` returns `{ok: true}`
    with the code in `exitCode` for a command that ran and failed (`process-runner.ts:185-190`), so
    `runReclaimCommand` checks `outcome.ok && outcome.exitCode === 0` before reporting success, and
    otherwise returns `{ok: false, message: firstLine(outcome.stderr) || \`\${command} exited \${exitCode}\`}`
    using the exported `firstLine` helper (`:216`). A caller that skips this reports a failed
    `brew cleanup` as a success — the single most likely bug in this theme.
  - `reason: 'not-installed'` maps to `{ok:false, message: 'brew is not installed or not on PATH.'}`
    — the tool being absent is a normal outcome, not a crash. `'timed-out'` maps to the hint
    `runProcess` already writes.
  - Gated main-side by nothing (main has no view of renderer settings) and renderer-side by the same
    three-way AND as everything else in Theme C.
- [ ] Cap the output this phase shows. `ProcessOutcome.stderr` is already tail-capped at
      `OUTPUT_TAIL_CAP = 200_000` (`process-runner.ts:25`) — **stdout is not**, contrary to the
      previous draft's claim. Add `RECLAIM_OUTPUT_CAP = 8_000` in `system-cache-service.ts` and
      slice both streams to their last `RECLAIM_OUTPUT_CAP` characters before they cross IPC.
  - 8 KB is the tail, not the head: `brew cleanup`'s useful line ("Removed N files, M MB") is at the
    end, and a truncated head would hide exactly the summary the user wants.
- [ ] A `costly` entry with a registered reclaim command offers it as the **default** action ahead
      of a plain trash-delete of the whole directory — see Decision 6 for why (targeted reclaim
      beats bulk delete for a shared, content-addressable store like pnpm's). An entry with no
      registered command only ever offers delete.
  - Concretely: the row's primary button is the reclaim command's `label`; the trash-delete is the
    `secondaryLabel` on the confirm (`ConfirmRequest.secondaryLabel`/`onSecondary`, `:75-81`, which
    exists precisely for "a third way out"). An entry with no command has no secondary and a
    primary of `"Move to Trash"`.
- [ ] The confirm dialog for a reclaim command shows the **exact argv** in its `body` — the literal
      string `brew cleanup -s`, not "clean up Homebrew's cache" — so the user is never surprised by
      what literally runs. It carries **no `blastRadius`** (`blastRadius: null`): the command decides
      what it removes and this app cannot count it in advance, and inventing a number here would be
      the one dishonest confirm in the app.
  - Output is shown after the fact in the result toast/panel, never silently discarded; a
    `{ok:false}` renders its `message` in the same place.
- [ ] `reclaim-commands.test.ts`: every command in `DEFAULT_RECLAIM_COMMANDS` names an `entryId`
      present in `DEFAULT_SYSTEM_CACHE_ENTRIES`; `runReclaimCommand` for an unknown `entryId`
      returns `{ok:false}` **before spawning anything** (a fake `spawn` that must never be called);
      a fake `spawn` proves the argv passed to `runProcess` is exactly the table's `command`/`args`,
      never mutated and never concatenated; a stubbed outcome with `exitCode: 1` returns
      `{ok:false}` carrying the first line of stderr; a stubbed `reason: 'not-installed'` returns
      `{ok:false}` rather than throwing; output longer than `RECLAIM_OUTPUT_CAP` is sliced from the
      **end**.

### E — UI: a System section that never looks like "your project's stuff" (M)

- [ ] **Consume [Phase 72](phase-72-every-build-systems-leftovers.md)'s generic `SegmentedBar` —
      do not generalise it here.** Phase 72 Theme D turns
      [`segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx)
      into `SegmentedBar<Id extends string>({ segments, total, label, color, name })` where
      `color: (id: Id) => string` and `name: (id: Id) => string` are injected lookups and the
      width/scale maths is untouched. It also updates the existing call site (`storage-tab.tsx:34`)
      and `components/segmented-bar.test.tsx`.
  - This phase's System bar therefore passes `color={ecosystemColor}` and `name={(id) => ECOSYSTEM_LABELS[id]}`
    explicitly, with `Id = Ecosystem`. **It writes no change to the component itself.**
  - The earlier draft of this refinement proposed a different generalisation (per-segment `label`/`color`
    *fields* rather than injected *functions*). Phase 72 owns this component and chose the function
    form; two competing generalisations of one component is exactly the collision the shared
    contract exists to prevent, so this defers. Decision 12.
  - **If Phase 72 Theme D has not landed**, its `SegmentedBar` change is a prerequisite for this item
    specifically — not for the rest of Theme E. Render the System list without a bar rather than
    generalising the component independently.
  - **Acceptance:** the System bar renders with `label="System caches by ecosystem"` and no edit to
    `segmented-bar.tsx` appears in this phase's diff.
- [ ] Add **one** `ECOSYSTEM_HUES` entry and **one** `ECOSYSTEM_LABELS` entry, for `'go'`, to
      [`category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
      Phase 72 Theme D creates both `Record<Ecosystem, …>` maps and fills the other ten members.
  - **`'go'` → hue `195`** (Go's own cyan), `ECOSYSTEM_LABELS.go = 'Go'`.
  - Phase 72 also adds `category-palette.test.ts`, which asserts every `ECOSYSTEM_HUES` hue sits
    **≥12° (shortest arc)** from every `CATEGORY_HUES` hue and every `METRIC_HUES` hue (cpu 210,
    memory 280, gpu 160, disk 35). `195` sits inside the free 192–197 band Phase 72 published and is
    unclaimed; picking any other value is likely to fail that test rather than a review.
  - Both maps are exhaustive `Record<Ecosystem, …>`, so adding `'go'` to `EcosystemSchema` without
    these two entries is a **typecheck** failure — they land in the same commit as Decision 8's
    enum edit, not later.
- [ ] Add a "System" section to
      [`storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx), gated on the
      Theme C three-way AND and rendered only when true; otherwise the tab is exactly as Phase 72
      left it.
  - **Not a fifth top-level Optimizer tab** — the existing four (`optimizer-layout.tsx:12-17`:
    Smart Scan, Storage, Memory, GPU) are all repo/machine-monitoring surfaces already; System caches
    is a variant of Storage's "what's taking up space" question, not a new question. Decision 5.
  - Its `SegmentedBar` gets `label="System caches by ecosystem"` — a **distinct** accessible name,
    because `optimizer-shots.spec.ts:175,185` locates the existing bar by
    `getByRole('img', { name: 'Reclaimable storage by category' })` and two bars sharing a name break
    that locator.
- [ ] Give the System section its own **empty, loading, error and approximate** states, with literal
      copy. `storage-tab.tsx` today has exactly one non-happy branch (`:20-26`, the "run a scan
      first" paragraph) and no loading or error branch at all — the Smart Scan tab owns those
      (`smart-scan-tab.tsx:125-127`). The System section cannot borrow them, so it states its own:
  - **Idle/empty (no scan yet):** *"Scan your system caches to see what's reclaimable outside your
    repos."* beside the scan button.
  - **Loading:** the existing `CircularGauge` driven by `systemScan.progress`, with
    *"Checking your tool caches…"*. Progress arrives over `optimizerSystemScanProgress`; the `total`
    is a fixed denominator exactly as Phase 59's is.
  - **Empty result (scan ran, nothing found):** *"None of the caches Midnite knows about are present
    on this machine."* — the honest reading, because an absent entry means "not installed or never
    used", not "zero bytes".
  - **Error:** `systemScan.message` rendered in the destructive style the Smart Scan tab uses, with
    the `{ok:false}` envelope's `message` verbatim and no invented prefix.
  - **Approximate:** when `result.approximate`, a line above the list — *"One or more caches were too
    large to measure completely; the figures below are minimums."* — and every affected row's byte
    figure is prefixed `at least `. An under-report is visible, never silent.
- [ ] A persistent banner above the System section: *"Outside any repo Midnite manages — your Cargo,
      Gradle, Homebrew, and other tool caches."* — visually distinct (a different accent, not just a
      label) from the repo-scoped rows above it, so a user scanning the page cannot mistake a
      home-directory cache for something inside a project they opened.
  - Distinct **accent**, deliberately not a warning/destructive colour: [Phase
    74](phase-74-media-caches-and-the-trash.md)'s Trash card reserves full destructive styling for
    the one operation with no undo, and if this section already shouts, that distinction is lost.
- [ ] Add `blastRadiusKind: 'systemCache'` to `BLAST_RADIUS_COPY` in
      [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx):
      `subject: (n) => \`\${n} cache\${n === 1 ? '' : 's'}\``,
      `consequence: 'will be moved to the trash. These sit outside any repo Midnite manages.'`,
      `noEffect: 'Nothing is left to clean.'`
  - Adding the arm is the only edit — `blastRadiusKind` is typed `keyof typeof BLAST_RADIUS_COPY`
    (`:53`), so the union widens with no second change. The one sentence Theme C's gate promised
    would always be visible at the moment of the decision, not only in Settings.
- [ ] Each row shows the entry's `label` and `producer`, never a raw path standing alone — *"Cargo
      registry · will need `cargo build` / `cargo install` to redownload"* — with the resolved path
      available but secondary (the existing row's `font-mono text-xs` treatment, `storage-tab.tsx:56`).
      A row is **not** a `selectRepo` deep link the way a Storage row is (`:44-48`): a system cache
      has no `repoId`, and the button must be absent rather than disabled-with-no-explanation.
- [ ] Every icon from `react-icons`, imported per set (`react-icons/lu`), never `lucide-react` —
      unchanged repo rule, enforced by `eslint.config.mjs` and `components/icons/icon-names.test.ts`.
- [ ] Teach the e2e mock bridge the new methods:
      [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) — one field per method in
      `MockFixtures['optimizer']` (`:522-540`) and one handler in the object at `:2396-2470`, beside
      `scan`/`onScanProgress`/`clean`.
  - **Rebase onto Phase 72 before touching this file or the two e2e specs.** Phase 72 Theme C renames
    the wire value `'nodeModules'` → `'dependencies'` and adds `'toolCache'`, and that literal appears
    in `mock-bridge.ts` (`:525`, `:2400`), `optimizer.spec.ts` (`:16`, `:21`, `:24`) and
    `optimizer-shots.spec.ts` (`:24`, `:34`, `:40`, `:46`). Resolving a literal-string conflict by
    hand in three files is how one of them silently keeps the dead value.
- [ ] [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts):
      the System section, light and dark, **with the gate on**.
  - Turn the gate on by adding both booleans to `seedOptimizerEnabled`'s
    `persisted.state = { ...persisted.state, optimizerEnabled: true }` spread (`:113-121`) — that
    helper is duplicated verbatim in `optimizer.spec.ts:35-43`, so update both or the functional spec
    stays ungated. (Note both hardcode `version: 8` against a store on `version: 9`; harmless today,
    but do not add a `migrate` arm without revisiting it.)
  - Follow the file's own light/dark sequence: `goDark` before navigation, `paintDark` after, and
    `SETTLE_MS` for light.
  - The default-off state means the un-gated shot (today's) stays the common case and needs no new
    coverage.

### F — Verification (M)

- [ ] `system-cache-registry.test.ts`, `system-cache-service.test.ts`, `reclaim-commands.test.ts`,
      `system-cache-consent.test.tsx` — all from Themes A, B, D, C above, each asserting the
      acceptance criteria named there.
- [ ] `packages/desktop/src/main/confine-allowlist.test.ts`, beside the existing
      [`confine-tree.test.ts`](../../../packages/desktop/src/main/confine-tree.test.ts) and following
      its setup exactly (`realpath` the tmpdir first — macOS resolves `/var` → `/private/var`, and a
      test that skips this fails for the wrong reason):
  - a path outside every entry is refused;
  - a path *under* an entry is refused (the descent case);
  - a path that is a **parent** of an entry is refused — this is the one a `startsWith`-based mistake
    would pass, and it is the single most important assertion in this phase;
  - a sibling whose name shares a prefix with an entry (`.cargo/registry-old` against
    `.cargo/registry`) is refused;
  - a symlink pointing an entry's own path at somewhere else is refused **by
    `resolveSystemCacheEntries`, before `confineAllowlist` ever sees it** — assert at that layer, not
    at `confineAllowlist`, because `confineAllowlist` alone would accept it (the core design problem);
  - a nonexistent path returns `null` rather than throwing;
  - two entries resolving to the same real path (a customised `CARGO_HOME` colliding with another
    tool) does not double-confine or double-count — assert the dedup rule explicitly rather than
    leaving it implied: `resolveSystemCacheEntries` keeps the **first** entry in array order and
    drops the later one with a logged line.
- [ ] `optimizer-handlers.test.ts`: the existing `optimizerScan`/`optimizerClean` assertions are
      **unchanged** — a diff there is a red flag, per Phase 72's own precedent for the same claim.
      New assertions for the four new handlers use the same "look up the registered `ipcMain.handle`
      listener by channel" helper the file already has (`:25-31`).
- [ ] Add a `covers every optimizer channel with a schema` block to
      [`ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts), matching the shape used for
      `metrics` (`:779-797`), `video` (`:1551`) and `db` (`:1599`): filter
      `[...Object.keys(CHANNELS), ...Object.keys(EVENT_CHANNELS)]` by the `optimizer` prefix, assert
      the sorted key list equals a hardcoded map, and assert each named schema exists on `schemas`.
  - There is **no such block today** (`grep -i optimizer ipc.test.ts` returns zero hits), so the
    five new channels would otherwise be covered only by the two global assertions. Adding it makes
    a future sixth channel that forgets its schema a test failure rather than a runtime `undefined`.
- [ ] Renderer test: the System section is absent with any one of the three Theme C conditions
      false, and present only with all three true — all four cases, driven by
      `useUiStore.setState({ … })`.
- [ ] Renderer test: each of the System section's five states (idle, loading, empty result, error,
      approximate) renders its named copy, driven by `useOptimizerStore.setState({ systemScan: … })`
      following `optimizer-store.test.ts`'s own `beforeEach` reset idiom.
- [ ] `optimizer-store.test.ts`: the existing `expect(localStorage.length).toBe(0)` still passes with
      the `systemScan`/`systemCatalogue` additions — the assertion that nobody reached for `persist`.
- [ ] `persisted-keys.test.ts` passes with both new `PREFERENCE_KEYS` — which requires each
      identifier to appear literally under `features/settings/`, satisfied by Theme C's controls.
- [ ] `moon run :typecheck :lint :test` green.
- [ ] **Human pass, on a real machine with several of these tools installed:** confirm the scan
      reports real, correct byte figures for at least Homebrew, one of Node's stores, and one of
      Rust/Go/Gradle; confirm a clean actually only touches the reported path (check the Trash);
      confirm a vendor reclaim command's output is legible and that a *failing* one (e.g. `brew` not
      installed) reads as a failure; confirm the one-time consent dialog's copy reads as an honest
      description of the blast radius to someone who has not read this doc.
- [ ] **Human pass, the symlink case, by hand:** `mv ~/.npm ~/.npm-real && ln -s ~/.npm-real ~/.npm`,
      then scan. The `npm-cache` entry must be **absent** from the results, and a line must appear in
      the log saying why. Restore afterwards. This is Decision 10's whole reason for existing and it
      cannot be proven by a unit test alone.

---

## Files this phase touches

**New**
- `packages/desktop/src/main/optimizer/system-cache-registry.ts` — `SystemCacheEntryId`,
  `SystemCacheEntry`, `PathResolver`, `ResolvedSystemCacheEntry`, `resolveSystemCacheEntries`,
  `DEFAULT_SYSTEM_CACHE_ENTRIES` (A).
- `packages/desktop/src/main/optimizer/system-cache-service.ts` — `scanSystemCaches`,
  `cleanSystemCaches`, `runReclaimCommand`, `collectStdout`, `MAX_ENTRIES_PER_SYSTEM_ENTRY`,
  `RECLAIM_OUTPUT_CAP` (B, D).
- `packages/desktop/src/main/optimizer/reclaim-commands.ts` — `ReclaimCommand`,
  `DEFAULT_RECLAIM_COMMANDS` (D).
- `packages/desktop/src/main/optimizer/system-cache-registry.test.ts`,
  `system-cache-service.test.ts`, `reclaim-commands.test.ts` (A, B, D, F).
- `packages/desktop/src/main/confine-allowlist.test.ts` — beside the existing
  [`confine-tree.test.ts`](../../../packages/desktop/src/main/confine-tree.test.ts) (F).
- [`packages/shared/src/domain/system-optimizer.ts`](../../../packages/shared/src/domain/system-optimizer.ts) —
  `SystemCacheItemSchema`, `SystemScanResultSchema`, `SystemCacheCatalogueEntrySchema`,
  `SYSTEM_SCAN_ITEMS_CAP` (B).
- `packages/app/src/features/settings/settings-pages/system-cache-consent.test.tsx` (C, F).

**Changed**
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineAllowlist`, beside `confineTree` (A). **`confineTree` itself is unchanged.**
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  **four `export` keywords only**, on `dirBytes` (`:101`), `readDirSafe` (`:83`), `newWalkState`
  (`:63`) and the `WalkState` type (`:55`). No signature, no behaviour, no budget change;
  `cleanItems`, `knownRoots`, `walk` and `classify` are untouched. Phase 74 Theme B needs the same
  four and defers to this edit (A).
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) — four
  entries in `CHANNELS`, one in `EVENT_CHANNELS` (B). **No existing channel changes shape.**
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts),
  [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — the
  five new request/response/event schemas and the five bridge+preload methods, inside the **existing**
  `optimizer` group (B).
- [`packages/shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) —
  `export * from './system-optimizer';`, alphabetically between `'./status'` and `'./tests'` (B).
- [`packages/shared/src/ipc/ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts) — a new
  `covers every optimizer channel with a schema` block (F).
- [`packages/desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  four new handlers and a second `currentSystemScan` controller, in the same file beside the
  existing ones (B, D).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  `allowSystemCacheClean`, `systemCacheConsentGiven`, six edits each, **no `version` bump** (C).
- [`packages/app/src/store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) —
  both new keys as `PREFERENCE_KEYS`; the seventh edit of the pattern and a typecheck gate (C).
- [`packages/app/src/store/optimizer-store.ts`](../../../packages/app/src/store/optimizer-store.ts) —
  the `systemScan` slice and `systemCatalogue`, still unpersisted (B).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
  the "System caches" accordion, the derived catalogue list, and the one-time consent dialog
  trigger (C).
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  a third `BLAST_RADIUS_COPY` arm, `'systemCache'` (E).
- [`packages/app/src/features/optimizer/components/segmented-bar.tsx`](../../../packages/app/src/features/optimizer/components/segmented-bar.tsx) —
  segments carry their own `label`/`color`; the component drops its palette imports (E).
- [`packages/app/src/features/optimizer/category-palette.ts`](../../../packages/app/src/features/optimizer/category-palette.ts) —
  `ECOSYSTEM_HUES`/`ecosystemColor`/`ECOSYSTEM_LABELS`, unless Phase 72 Theme D shipped them (E).
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  the gated System section with its own five states, and the palette lookup moved into its existing
  `SegmentedBar` call (E).
- [`packages/app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) — five fixtures and
  five handlers in the existing `optimizer` group (E).
- [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts),
  [`packages/app/e2e/optimizer.spec.ts`](../../../packages/app/e2e/optimizer.spec.ts) — both copies
  of `seedOptimizerEnabled` gain the two new booleans; the shots spec gains the gated-on System
  section shot (E).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `EcosystemSchema` gains `'go'` (Decision 8), **once Phase 72 has landed it** — see the
  sequencing guardrail.

**Deliberately unchanged**
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts)'s
  *behaviour* — `cleanItems`, `knownRoots`, `walk`, `classify`, every Phase 72 detector, and every
  budget constant. This phase adds a sibling module and four `export` keywords, nothing else
  (**unchanged** in every sense a reviewer cares about).
- [`packages/desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  reused as-is for Theme D; not one line changes (**unchanged**).
- [`packages/desktop/src/main/fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) — the
  *read* jail (`joinWithin`, `confineToRoot`). Load-bearing and out of scope; `confineAllowlist`
  belongs beside the write jail's `confineTree`, not here (**unchanged**).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts)'s
  `ScanCategorySchema`, `ScanItemSchema`, `ScanResultSchema`, `SCAN_ITEMS_CAP` — the repo-scoped
  family. Not widened, not shared, not given a `'systemCache'` member (**unchanged**, and asserted).
- [`packages/git-engine/`](../../../packages/git-engine) — gains nothing, per the guardrail
  (**unchanged**).

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `confineAllowlist` rejects every case in Theme F's list — outside, under, parent, prefix-sibling,
      nonexistent — and `confineTree`/`cleanItems`'s own tests are unchanged (diff-empty).
- [ ] `resolveSystemCacheEntries` drops a symlinked entry, a `queryTool` path outside
      `os.homedir()`, `os.homedir()` itself, a non-directory, and a duplicate resolving to an
      already-claimed real path — each asserted individually.
- [ ] No `SystemCacheItem` produced by any test resolves to a path that is not exactly one of
      `DEFAULT_SYSTEM_CACHE_ENTRIES`'s resolved paths.
- [ ] Every `fixed` entry's `resolve.path` is homedir-relative — no leading `~`, no leading `/` —
      asserted over the whole catalogue in one test.
- [ ] Every entry has a non-empty `producer`, and every `DEFAULT_RECLAIM_COMMANDS.entryId` exists in
      `DEFAULT_SYSTEM_CACHE_ENTRIES`.
- [ ] The System section is unreachable with any one of the three Theme C gates off, and the
      one-time consent dialog cannot be bypassed by toggling the setting alone — the toggle does not
      set the boolean at all until confirm fires.
- [ ] The consent dialog's and the settings page's enumerations both contain every label the
      catalogue channel returns — the assertion that the derivation, not prose, is what renders.
- [ ] Every `ReclaimCommand.args` is a literal array asserted never to contain renderer input, and a
      non-zero `exitCode` is asserted to produce `{ok:false}`.
- [ ] An entry that exceeds `MAX_ENTRIES_PER_SYSTEM_ENTRY` reports `approximate: true` with a
      non-zero `bytes`, and the entry scanned after it still reports its own real size.
- [ ] `ipc.test.ts` covers all five new channels by name and asserts each has a schema.
- [ ] `optimizer-store.test.ts`'s `localStorage.length === 0` still passes; `persisted-keys.test.ts`
      passes with both new preference keys.
- [ ] Storage tab shots refreshed, gate-on state, light and dark, with the two bars carrying distinct
      accessible names.
- [ ] **Human:** real-machine pass per Theme F.
- [ ] **Open, for a human:** the by-hand symlink case in Theme F's last item — the one refusal no
      unit test proves end to end.

---

## Not in this phase

- **Media-tool caches (Plex and anything shaped like it) and emptying the system Trash.**
  [Phase 74](phase-74-media-caches-and-the-trash.md), matching the cross-reference already landed
  in [Phase 72](phase-72-every-build-systems-leftovers.md). Both need a review this phase's model
  does not cover on its own:
  - **Plex's own directory tree mixes cache and library in one root** —
    `~/Library/Application Support/Plex Media Server/` holds a `Cache/` subfolder that genuinely is
    disposable transcode/thumbnail cache, sitting beside `Metadata/` (posters/artwork, expensive to
    rebuild) and `Plug-in Support/` (the Plex database itself) in the **same parent directory**.
    This phase's registry model — one entry, one exact path, no descent — is the right shape for
    it (an entry pointing at `Cache/` specifically, never at `Plex Media Server/` itself), but it
    is a domain this phase's author has not verified path-by-path the way Rust/Gradle/Go are
    verified above, and "a media library" carries a different emotional and practical cost to get
    wrong than a recompilable build cache. It deserves its own catalogue pass with real paths
    checked against Plex's own support docs, not inherited from this phase's dev-tool list by
    analogy.
  - **Emptying the Trash is a different operation shape entirely**, not a delete: this app has
    never emptied a trash it did not itself fill, `shell.trashItem`'s whole safety story is "there
    is still an undo," and "empty the Trash" removes that undo for *everything* in it — including
    whatever a different app put there an hour ago.
- **Windows/Linux equivalents of this catalogue** (`%LOCALAPPDATA%`, `~/.cache`, XDG base dirs).
  Genuinely out of scope rather than silently dropped — Decision 7, the one decision below that
  stays Open.
- **Docker images and volumes.** A different daemon, a different permission model, and (for
  volumes) a delete with no per-file Trash undo at all.
- **A generic `~/Library/Caches` sweep.** Rejected as a *mechanism*, not merely undone — see the
  scope guardrails. There is no size or age threshold anywhere in this phase.
- **Widening `ScanCategory`, `ScanItemSchema` or `ScanResultSchema`.** The repo-scoped family stays
  exactly as Phase 72 leaves it; a `'systemCache'` category is the merge Theme B exists to refuse,
  and it would touch five call sites for a cosmetic saving. Decision 3.
- **A new settings page, a new Optimizer tab, a new `ViewId`, a new nav entry or a new chord.**
  Everything this phase adds lives inside the existing Optimizer settings page and the existing
  Storage tab. Decision 5.
- **A second bar component.** `SegmentedBar` is generalised, not forked — one clamping-and-scaling
  implementation, two domains. Decision 12.
- **Versioned or re-asked consent.** No mechanism ships to re-prompt when the catalogue grows; the
  enumeration is derived instead, so it can never be stale. Decision 9.
- **Automatic or scheduled scanning.** Every scan in this app stays user-initiated, System caches
  included. There is no background timer and no scan-on-launch.
- **Any `fs.rm`, `unlink` or `rmdir`.** `shell.trashItem` remains the only delete this app performs,
  and a vendor reclaim command's own deletes are the vendor's, not this app's.

---

## Decisions / open questions

Decisions 1–9 were chosen without a human in the loop, running this brainstorm the same way
the interrupted prior session ran Phase 72's — see the task's own instruction to record rather
than silently pick. **Decisions 10–14 were added by the first refinement pass**, each forced by a
fact found in the tree rather than by a preference. Each names the recommendation taken and why, so
a later refine can reverse it with the reasoning in view. **Decisions 1 and 10 are the two a
reviewer most needs to check by hand.**

1. **Resolved — confinement is a hand-written allowlist checked for exact equality, never a widened
   `knownRoots()` and never a path-prefix check.** The alternative — add `os.homedir()` (or a
   handful of `~/Library/…` roots) to `knownRoots()` and reuse `confineTree` — was seriously
   considered and rejected: `confineTree` trusts *anything strictly under* its root, which is
   correct when the root is "a repo the user opened" and catastrophic when the root is "the user's
   entire home directory." `confineAllowlist`'s exact-match rule means a bug in this phase's own
   code can, at worst, mis-report or refuse an entry — it structurally cannot be tricked into
   confining a path nobody reviewed, because there is no recursive "is this strictly under" check
   to fool. The cost is that every new cache needs a code change (a new registry entry) rather than
   being auto-discovered; that cost is the entire point. **See Decision 10 for the hole exact-match
   does not close on its own.**
2. **Resolved — a registry entry's path is resolved by asking the tool when the tool exposes a way
   to ask (`go env`, `pnpm store path`, `brew --cache`), and hardcoded only where the location has
   never been made configurable.** The alternative — hardcode every path — was rejected because
   several of these are genuinely user-configurable (`CARGO_HOME`, a customised pnpm store location
   via `PNPM_HOME`), and a hardcoded guess that misses a customised path is a silent under-report,
   which is the safe failure direction, but a hardcoded guess that happens to collide with
   something else the user put at that path is not. Asking the tool costs one more `runProcess`
   call per scan and removes the ambiguity entirely. **The refinement adds the bound this needs:**
   a tool-reported path is a string a user-controlled environment variable produced, so it is
   refused unless it is absolute, exists, is a directory, is not a symlink, and resolves strictly
   under `os.homedir()` — see Decision 11.
3. **Resolved — a second, separate wire-contract family
   (`SystemCacheItemSchema`/`SystemScanResultSchema`), never a widened `ScanItemSchema`.** Considered
   and rejected: adding `repoId: null` support and a `'systemCache'` category to the existing
   `ScanCategorySchema` would let a `ScanItem` represent either kind of thing, and the entire value
   of Theme A's stricter confinement is undermined if a later change can hand a system-wide path to
   code written assuming every `ScanItem.path` sits under `knownRoots()`. Two schemas that cannot be
   confused by the type system are worth the duplication of a few field names. **One narrow
   exception, added by the refinement:** `cleanSystemCaches` reuses the existing
   `OptimizerCleanResultSchema` for its *outcome*, because an outcome carries `freedBytes` and
   `skipped[].path` and nothing a call site could feed back into a confinement check. The refusal to
   merge is about item and scan shapes, and it stays absolute for those.
4. **Resolved — three-factor gate: `optimizerEnabled` (existing) AND `allowSystemCacheClean` (new
   checkbox) AND `systemCacheConsentGiven` (new, set only by confirming a one-time dialog).** The
   alternative — a single new checkbox, mirroring `allowForceWithLease` exactly — was rejected
   because the blast-radius jump from "one ref" to "the whole machine's dev tooling" is
   qualitatively larger than the jump `allowForceWithLease` itself represents, and a plain checkbox
   in a settings page a user may never fully read is the same shape of consent as the thing that got
   `node_modules` deleted with no producer field in Phase 72's own prehistory. The one-time dialog is
   friction exactly once, not a standing tax on every clean. **The refinement adds the ordering
   rule:** the checkbox does not set its own boolean — the dialog's confirm sets both — so there is
   no window in which the setting is on without consent recorded.
5. **Resolved — the System section lives inside the existing Storage tab, not a new tab and not a new
   `ViewId`, and its settings live in an accordion on the existing Optimizer settings page, not a new
   page.** Considered and rejected: a fifth Optimizer tab for one gated, usually-hidden section adds
   a permanent piece of chrome (an always-visible tab that renders "off" for most users) for a
   feature this phase expects to be off by default for a long time. A gated section within an
   existing tab costs nothing when off and needs no nav/chord work at all. A separate settings page
   would additionally mean edits to four registration sites (`SettingsPageId`, `SETTINGS_PAGES`,
   `SETTINGS_PAGE_ICON`, `PAGE_CONTENT`), two of them exhaustive `Record`s — cost with no reader
   benefit, since a user looking for optimizer settings looks on the optimizer page. **This differs
   deliberately from `git-safety-page.tsx`'s own reasoning**, which earned a whole page because it
   had no existing page to sit on; this one does.
6. **Resolved — a `costly` entry with a registered vendor reclaim command offers it as the default
   action; plain trash-delete stays available as the confirm's secondary.** Recommended over "always
   offer trash-delete first": pnpm's store, in particular, is a single content-addressable directory
   shared by every pnpm project on the machine — deleting the whole thing forces a full re-download
   for every project, where `pnpm store prune` removes only what nothing currently references. The
   vendor almost always knows its own cache's internal structure better than a directory-level
   delete can.
7. **Open — Windows and Linux equivalents of this catalogue.** This app's own scope statement
   ([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md)) is "Desktop-only, macOS arm64
   primary target," and every path in Theme A's catalogue is a macOS path. Windows equivalents
   (`%USERPROFILE%\.cargo`, `%LOCALAPPDATA%`) and Linux equivalents (`~/.cache`, XDG base dirs)
   exist and are a real, named gap. This is the one decision here that genuinely needs a human,
   because it is a product-scope call, not a technical one, and it is not reversible cheaply once a
   second platform's paths are in the registry.
   *Recommendation:* **leave it out, and do not design for it now.** The `PathResolver` union is
   already the right seam — a `fixed` path is homedir-relative and a `queryTool` arm is inherently
   portable — so a future cross-platform pass adds entries and a `platform?: NodeJS.Platform` filter
   field, not a redesign. Building it speculatively means shipping a dozen unverified Windows paths
   into the one feature whose entire design premise is that every path was verified. Revisit if and
   when the app itself ships on a second platform; until then the honest statement is the one in the
   preamble.
8. **Resolved — `EcosystemSchema` gains one member, `'go'`, once Phase 72 lands it.** Phase 72's
   Decision 7 shipped no Go *detector* because Go's only in-repo candidate (`vendor/`) is checked in
   and load-bearing — that decision was about the repo-confined scanner, not about whether "go" is a
   valid ecosystem label. This phase's Go entries (`GOCACHE`/`GOMODCACHE`) are genuinely
   out-of-repo caches with nowhere else to be labelled, so the taxonomy widens here instead of
   staying incomplete. **The refinement found the confirming precedent:** this repo already uses
   `'go'` as an ecosystem label, in
   [`shared/src/domain/diagnostics.ts:40`](../../../packages/shared/src/domain/diagnostics.ts)'s
   `DiagnosticsEcosystemSchema`. Adding it to `EcosystemSchema` aligns two vocabularies rather than
   inventing one, and the two schemas sit in the same `domain/` barrel without colliding.
   **The insertion position is part of the contract, not a style choice.** Phase 72 ships
   `z.enum(['node','multi','rust','cpp','dotnet','python','java','swift','ruby','git'])` — the first
   nine are its catalogue's own listing order, and `'git'` is last because nothing in the catalogue
   produces it. `'go'` is appended **immediately before `'git'`**, giving
   `…,'swift','ruby','go','git']`; [Phase 74](phase-74-media-caches-and-the-trash.md)'s `'media'`
   then goes between `'go'` and `'git'`. Do not alphabetise and do not append after `'git'`:
   `ECOSYSTEM_ORDER` in `category-palette.ts` is asserted to be a permutation of the enum and the
   Storage-tab legend renders in enum order, so `'git'` must stay the last row.
9. **Resolved — no versioned or re-asked consent; the enumeration is derived from the catalogue
   instead, and is also shown permanently on the settings page.** The question was whether
   `allowSystemCacheClean` should require re-confirmation after an app update adds new registry
   entries — a real concern, since a user who consented to a dialog naming Cargo and Gradle has not
   consented to whatever a later phase adds. Building versioned consent was considered and rejected
   as machinery for a thirteen-entry list. The chosen fix is cheaper and strictly better: the dialog
   renders the catalogue's own `label`s at the moment it is shown, so it can never name a stale set,
   and the settings page renders the same live list beside the checkbox, so the covered set is
   visible at any time without a modal. A catalogue addition therefore updates the consent surface by
   construction rather than by a copy edit someone must remember. **This resolution changes what
   [Phase 74](phase-74-media-caches-and-the-trash.md) has to do** — its Theme A's "update the consent
   dialog copy" item becomes an assertion that the derivation holds, not a copy edit.
10. **Resolved (new) — an allowlist entry whose own final segment is a symlink is dropped, never
    followed.** This is the hole exact-match confinement does not close, and it is the most important
    thing this refinement found. `confineAllowlist` inherits `confineTree`'s `realpath`-both-sides
    comparison, so if `~/.cargo/registry` is a symlink to `~/Documents`, the allowlist entry and the
    delete target both resolve to `~/Documents`, compare `===`, and **exact match passes**. The
    alternatives were: compare unresolved paths (rejected — that reintroduces every `..`/symlink
    traversal `realpath` exists to defeat), or accept the risk (rejected — it is a total-data-loss
    outcome from a single symlink an installer or a user could have created for entirely innocent
    reasons, such as moving a cache to an external disk). The chosen rule is a `lstat` at resolve
    time and again at clean time: the registry's promise is "this exact, reviewed directory", and a
    symlink means the real target was never reviewed. It is the same refusal `cleanItems` already
    makes for repo-scoped items (`scan-service.ts:313-316`), applied one layer earlier. The cost is
    that a user who has legitimately symlinked a cache elsewhere sees it silently absent — the safe
    direction, and Theme F's human pass exists to confirm the silence is at least logged.
11. **Resolved (new) — a `queryTool` result is treated as untrusted input and bounded by
    `os.homedir()`.** `go env GOCACHE` prints whatever `GOCACHE` says, and `GOCACHE` is an
    environment variable; the same is true of `CARGO_HOME` and `PNPM_HOME`. So a tool-reported path
    is not a fact about the machine, it is a string the environment produced, and treating it as
    trusted would mean `GOCACHE=/` produces a registry entry for the root of the filesystem. The
    alternative — trust the tool, on the grounds that anyone who can set `GOCACHE` can already delete
    their own files — was rejected because it makes this app the instrument, and because the whole
    phase is premised on every path being reviewed. Every catalogue entry's real default sits under
    the home directory (`~/Library/Caches/go-build`, `~/Library/Caches/Homebrew`, `~/Library/pnpm`),
    so the bound costs nothing today and is a hard ceiling on a class of surprise.
12. **Resolved (new) — `SegmentedBar` is generalised, but by [Phase
    72](phase-72-every-build-systems-leftovers.md), and this phase consumes it rather than doing it.**
    The problem is real and this refinement found it independently: the component's props are
    `id: ScanCategory` and it looks up `CATEGORY_LABELS`/`categoryColor` *internally*, so an
    ecosystem-keyed bar cannot pass through it. Widening `ScanCategory` was rejected by Decision 3 and
    the scope guardrail; a second `EcosystemBar` was rejected because the clamping and
    proportional-scaling logic (`segmented-bar.tsx:26-28`, the "a scan racing a delete can produce
    exactly this" case its own docblock describes) is subtle enough that two copies will drift. This
    refinement first specified per-segment `label`/`color` **fields**; Phase 72's own refinement
    landed injected `color`/`name` **functions** on a generic `SegmentedBar<Id extends string>` in the
    same pass. Phase 72 owns the component and updates its existing call site and its test, so this
    phase defers to that shape and simply passes the two lookups. Two competing generalisations of one
    component would be a merge conflict dressed as a design difference; there is no technical
    advantage to either form worth that.
13. **Resolved (new) — `dirBytes` and `newWalkState` are exported rather than copied.** The previous
    draft claimed `scan-service.ts` was "deliberately unchanged" while Theme B called `dirBytes`,
    which is not exported — the two claims cannot both hold. Copying the walker into
    `system-cache-service.ts` was the alternative and was rejected: `dirBytes` carries the symlink
    skip, the abort checks and the entry-budget accounting that make it safe, and a second copy is
    exactly where those drift apart. Two `export` keywords is a diff a reviewer can verify at a
    glance, which is the property that matters for a file this security-critical.
14. **Resolved (new) — the system scan gets its own `AbortController`, not the existing
    `currentScan`.** Sharing Phase 59's single-flight variable would mean starting a system scan
    silently aborts an in-flight Smart Scan and vice versa. They are independent surfaces on
    independent data, and the shared-variable version has no upside — the single-flight property that
    matters (one system scan at a time) is preserved by a second variable of the same shape.
