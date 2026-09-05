# Phase 73 — The optimizer leaves the repo

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
is a macOS path (`~/Library/…`), matching this app's own stated scope
([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md): *"Desktop-only, macOS arm64 primary
target"*). Windows/Linux equivalents of every cache here exist and are a real gap, not an oversight
— see Decision 7.

## The core design problem

**`knownRoots()` is not a confinement mechanism that can be widened — it is a registry, and the
registry is the wrong shape for this job.**
[`scan-service.ts:345-351`](../../../packages/desktop/src/main/optimizer/scan-service.ts):

```ts
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

**Builds on — read before writing code.**
- [`desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `cleanItems(paths, roots, trash)` (`:297`), `knownRoots()` (`:345`), `dirBytes(root, state, signal, log)`
  (`:101`), `readDirSafe(dir, log)` (`:83`), `MAX_WALK_ENTRIES = 200_000` (`:24`). **None of these three
  functions changes in this phase** — Theme A adds a sibling, not an edit.
- [`desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineTree(root, target)` (`:215`): resolves both sides through `realpath`, refuses unless
  `targetReal.startsWith(rootReal + sep)` and `targetReal !== rootReal`. **The shape this phase's
  `confineAllowlist` is modelled on, with one rule tightened**: `confineTree` accepts anything
  *strictly under* its root (correct for a repo tree, where the root is trusted and everything
  inside it is fair game); `confineAllowlist` accepts only an **exact match** against a registry
  entry (Decision 1) — there is no equivalent of "the user opened this repo" to extend trust
  downward from a home-directory path.
- [`desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  the full call chain this phase's new channels mirror:
  `registerOptimizerHandlers` → `handle(CHANNELS.optimizerClean, …)` (`:49`) → `knownRoots()` (`:53`) →
  `cleanItems(req.paths, roots, (path) => shell.trashItem(path))` (`:54`). Confirms in code exactly
  what the brief said: **the only delete route is `shell.trashItem`, confined by `cleanItems`
  against `knownRoots()`, and there is no other path from a renderer click to a filesystem write.**
- [`desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  `runProcess<T>` (`:126`), `realSpawn` (`:42`): `shell: false`, a fixed argument vector, a 2-minute
  timeout (`DEFAULT_TIMEOUT_MS`, `:116`), `SIGKILL` on the whole process group. **Theme D's vendor
  reclaim commands run through this, unmodified** — it already is "spawn one trusted command with no
  shell and a deadline," which is exactly what a `brew cleanup` or `go clean -cache` needs and
  nothing else in the repo shells a command at all outside diagnostics/testing.
- [`app/src/features/settings/settings-pages/git-safety-page.tsx`](../../../packages/app/src/features/settings/settings-pages/git-safety-page.tsx) —
  the shape Theme C's consent gate copies: **its own page** (not a row on an existing one — the
  docblock's own reasoning, *"a switch that turns on a real force-push is a different weight of
  decision… it deserves a page a user has to go looking for"*, applies with more force here), a
  single labelled checkbox, and a "What this still never does" box. `allowForceWithLease`
  (`ui-store.ts:1093` declaration, `:1286` `PersistedUi` member, `:1349-1350` default + setter,
  `:1826` `partialize` entry) is the seven-edit pattern Theme C's `allowSystemCacheClean` repeats.
- [`app/src/features/graph/use-graph-actions.ts:452-461`](../../../packages/app/src/features/graph/use-graph-actions.ts) —
  `allowForceWithLease && nonFastForward[ref.fullName] && ref.upstream`: **the setting is never the
  only gate.** Theme C's equivalent AND is `optimizerEnabled && allowSystemCacheClean &&
  systemCacheConsentGiven` (three, not two — see Decision 4).
- [`app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `BLAST_RADIUS_COPY` (`:32`), `blastRadiusKind` (`:53`), `warnings?: string[]` (`:64`). Gains a
  third arm; see Theme E.
- [Phase 72](phase-72-every-build-systems-leftovers.md)'s `ArtifactDetector` shape (`producer`,
  `evidence`, `reclaim: 'cheap'|'costly'`) and its `EcosystemSchema`/`ReclaimCostSchema` — this
  phase imports both types and extends `EcosystemSchema` by one member (`'go'`; Decision 8) rather
  than inventing a parallel taxonomy. **These types do not exist in the tree yet** — Phase 72 is
  itself an unbuilt doc as of this writing (0/65, `◻ TODO`). See the sequencing guardrail below.

**Sequencing guardrail — this phase depends on a doc, not (yet) on code.** Unlike Phase 72, which
built on Phase 59's already-shipped code, this phase's Theme B cites `EcosystemSchema` and
`ReclaimCostSchema` as things [Phase 72](phase-72-every-build-systems-leftovers.md) *will* add.
**Land Phase 72 Themes A–C before starting this phase's Theme B**, or `EcosystemSchema` does not
exist to import and Theme B is blocked on a phase that has not shipped. If Phase 72 is still
`◻ TODO` when this phase is picked up, either wait or absorb the two schema additions here instead
— do not silently duplicate them.

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
- **`shell.trashItem` stays the only delete**, unchanged from Phase 59 and Phase 72. Vendor
  reclaim commands (Theme D) are an *alternative* action offered beside the delete, never a
  replacement for the confirm-and-trash path.
- **Two-factor consent, not one checkbox.** See Theme C and Decision 4.
- **No new dependency, no shell string.** `runProcess`/`realSpawn` already forbids a shell
  (`shell: false`) and takes an argument vector, never a template string — Theme D's commands are
  literal `readonly string[]` arrays, never built by concatenation.
- **`git-engine` gains nothing.** Same guardrail as Phase 59 and 72; nothing here is a git
  operation.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Deliverables

### A — The system cache registry and its own confinement primitive (L)

- [ ] Add `packages/desktop/src/main/optimizer/system-cache-registry.ts` — a new module, not an
      extension of [Phase 72](phase-72-every-build-systems-leftovers.md)'s `detectors.ts`. The two
      catalogues answer different questions ("what's this repo's build output" vs. "what's this
      *machine's* tool cache") and mixing them risks exactly the accidental-widening bug the core
      design problem describes.
- [ ] Export the entry shape:
      ```ts
      export type SystemCacheEntry = {
        /** Stable, kebab, never reused — settings key, test name, and the store's per-entry state. */
        id: string;
        label: string;                 // "Cargo registry"
        ecosystem: Ecosystem;          // from shared/src/domain/optimizer.ts (Phase 72), widened — Decision 8
        producer: string;              // "cargo build / cargo install (re-downloads on demand)"
        reclaim: ReclaimCost;          // 'cheap' | 'costly', from Phase 72
        /** How the real path is obtained. See the two arms below and Decision 2. */
        resolve: PathResolver;
      };
      ```
- [ ] Export `PathResolver` as a two-arm union, and say in the docblock which is preferred:
      ```ts
      export type PathResolver =
        /** A fixed, well-known path. Only for a location the tool has never made configurable. */
        | { kind: 'fixed'; path: string }               // path is `~`-relative; resolved via os.homedir()
        /** Ask the tool itself, read-only, via the existing runProcess/realSpawn primitive.
         *  Preferred whenever the tool exposes one: hardcoding a configurable path is how this
         *  registry drifts out of date the day someone customises their `CARGO_HOME`. */
        | { kind: 'queryTool'; command: string; args: readonly string[]; parse: (stdout: string) => string | null };
      ```
      `queryTool` never has side effects — `go env GOCACHE`, `pnpm store path`, `brew --cache` are
      pure reads, run through `runProcess` with a short timeout and treated as "entry contributes
      zero" on any failure (missing binary, non-zero exit, unparsable output), exactly Phase 59's
      posture for `looseObjects` and Phase 72's for a missing Go detector: **a miss is silence, a
      false match is a data-loss incident.**
- [ ] Export `resolveSystemCacheEntries(entries, log): Promise<{ entry: SystemCacheEntry; path: string }[]>`
      — resolves every entry's `resolve` rule, drops any that failed to resolve or whose resolved
      path does not exist, and is the **only** place a `queryTool` command is ever run.
- [ ] Export `DEFAULT_SYSTEM_CACHE_ENTRIES: readonly SystemCacheEntry[]`, seeded with the catalogue
      below — every path verified against the tool's own documentation or its own `env`/`config`
      command, not guessed:
      - **Rust** — `cargo-registry` (`fixed`, `~/.cargo/registry`, ecosystem `rust`, producer
        `cargo build / cargo install`, **costly** — a full re-download, not a rebuild).
      - **Go** — `go-build-cache` (`queryTool: go env GOCACHE`, ecosystem `go`, producer `go build`,
        **cheap** — a local recompile); `go-mod-cache` (`queryTool: go env GOMODCACHE`, ecosystem
        `go`, producer `go build`/`go mod download`, **costly**). Both fall back to nothing (not a
        hardcoded guess) if `go` is not on `PATH`.
      - **Gradle** — `gradle-caches` (`fixed`, `~/.gradle/caches`, ecosystem `java`, producer
        `gradle build`, **costly**).
      - **Maven** — `maven-repository` (`fixed`, `~/.m2/repository`, ecosystem `java`, producer
        `mvn package`, **costly**).
      - **.NET** — `nuget-packages` (`fixed`, `~/.nuget/packages`, ecosystem `dotnet`, producer
        `dotnet build`/`dotnet restore`, **costly**).
      - **Swift/Xcode** — `xcode-deriveddata` (`fixed`,
        `~/Library/Developer/Xcode/DerivedData`, ecosystem `swift`, producer `xcodebuild`,
        **cheap** — the shared counterpart to Phase 72's project-local `DerivedData` entry, which
        only ever caught the override); `cocoapods-cache` (`fixed`,
        `~/Library/Caches/CocoaPods`, ecosystem `swift`, producer `pod install`, **costly**).
      - **Python** — `pip-cache` (`fixed`, `~/Library/Caches/pip`, ecosystem `python`, producer
        `pip install`, **costly**).
      - **Node/web** — `npm-cache` (`fixed`, `~/.npm`, ecosystem `node`, producer `npm install`,
        **costly**); `pnpm-store` (`queryTool: pnpm store path`, ecosystem `node`, producer
        `pnpm install`, **costly** — pnpm's content-addressable store is shared across every
        project on the machine, the single most consequential `costly` entry in this catalogue);
        `yarn-cache` (`fixed`, `~/Library/Caches/Yarn`, ecosystem `node`, producer `yarn install`,
        **costly**).
      - **Homebrew** — `homebrew-cache` (`queryTool: brew --cache` with no argument, which prints
        the cache **directory**, not a package path; ecosystem `multi`, producer
        `brew install`/`brew upgrade`, **costly**). Not `brew cleanup`'s target list — that is
        Theme D, which runs the command instead of trashing the directory (Decision 6).
      **Deliberately absent**: anything under `~/Library/Caches` for a non-build-tool application
      (browsers, Slack, Zoom, …). "Common system caches" beyond dev tools is real scope from the
      original ask, but every entry here is independently verified against source documentation —
      a browser's cache directory is not, and a wrong guess there is exactly the failure mode this
      phase's whole design exists to refuse. Add them one at a time, each with its own verified
      path, the way Phase 72 added ecosystems one at a time with a real repo to test against.
- [ ] Add `confineAllowlist(entries: readonly { path: string }[], target: string): Promise<string | null>`
      to [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts), beside (not
      replacing) `confineTree`: resolves `target` via `realpath` and returns it **only if it is
      exactly equal** to one resolved entry path — no `startsWith`, no descent, no prefix match.
      Docblock states explicitly why this is stricter than `confineTree`: there is no "the user
      opened this" trust to extend downward from a home-directory path, so nothing is trusted
      beyond the literal registry entry itself.
- [ ] `system-cache-registry.test.ts`: every `fixed` entry's path resolves under a fake `homedir`;
      every `queryTool` entry parses a captured real command's stdout (`go env GOCACHE`'s actual
      output shape, `pnpm store path`'s, `brew --cache`'s); a failing/missing tool yields no entry,
      never a thrown error; `confineAllowlist` accepts an exact match, refuses a subpath, refuses a
      parent, refuses a path that resolves through a symlink to somewhere else, refuses `target ===
      root` the same way `confineTree` does for its own root.

### B — A parallel wire contract, never merged with the repo-scoped one (M)

- [ ] Add `packages/shared/src/domain/system-optimizer.ts` — **not** an edit to
      `domain/optimizer.ts`. `SystemCacheItemSchema` and `ScanItemSchema` must never be
      structurally interchangeable, so that no future call site can hand a system-wide path to
      code that assumes it sits under `knownRoots()` by mistake.
      ```ts
      export const SystemCacheItemSchema = z.object({
        path: z.string(),
        bytes: z.number().nonnegative(),
        entryId: z.string(),           // matches SystemCacheEntry.id — no repoId field exists here
        ecosystem: EcosystemSchema,    // imported from domain/optimizer.ts (Phase 72)
        reclaim: ReclaimCostSchema,    // imported from domain/optimizer.ts (Phase 72)
        label: z.string(),
        producer: z.string(),
      });
      export const SystemScanResultSchema = z.object({
        totalBytes: z.number().nonnegative(),
        items: z.array(SystemCacheItemSchema).max(SYSTEM_SCAN_ITEMS_CAP), // 200 — an allowlist this
        // small never needs Phase 72's 2,000-item cap; a cap two orders of magnitude tighter is
        // itself a signal if it's ever hit.
      });
      ```
- [ ] Add three channels following the `mstudio:<domain>:<verb>` rule in
      [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts): `optimizerSystemScan`,
      `optimizerSystemScanProgress` (event), `optimizerSystemClean`. **Never reuse
      `optimizerScan`/`optimizerClean`** — a shared channel would need a shared request/response
      schema, which is the merge this theme exists to refuse.
- [ ] `OptimizerSystemCleanRequest` carries `entryIds: string[]` (not raw paths) — the renderer
      names *which registry entries* to clean, and main re-resolves + re-confines each one fresh
      at clean time (mirroring `cleanItems`'s re-validation, Phase 59 Decision 9's TOCTOU
      reasoning) rather than trusting a path the renderer remembers from its last scan.
- [ ] Add `packages/desktop/src/main/optimizer/system-cache-service.ts`:
      `scanSystemCaches(opts: { signal: AbortSignal }): Promise<SystemScanResult>` (calls
      `resolveSystemCacheEntries` then `dirBytes` per entry, reusing Phase 72's raised
      `MAX_WALK_ENTRIES`/`MAX_WALK_DEPTH` budgets unchanged — no new budget constants, an allowlist
      of a dozen entries needs no larger bound than a single repo does) and
      `cleanSystemCaches(entryIds, trash): Promise<CleanOutcome>` (re-resolves, `confineAllowlist`s,
      trashes — the same three-step shape as `cleanItems`, over the allowlist instead of
      `knownRoots()`).
- [ ] `system-cache-service.test.ts`: a scan produces `totalBytes` matching a fixture's real size;
      an entry whose resolved path no longer exists is silently absent, not an error; a clean
      request naming an `entryId` not in `DEFAULT_SYSTEM_CACHE_ENTRIES` is refused before any
      filesystem call.

### C — A stronger consent gate than a checkbox (M)

Phase 22's `allowForceWithLease` and Phase 59's `optimizerEnabled` are each one persisted boolean
plus a runtime AND. The blast radius here is qualitatively larger — the whole machine's dev
tooling, not one ref or one repo — so this theme adds a second factor beyond the checkbox itself.

- [ ] Add `allowSystemCacheClean: boolean` (default `false`) to `ui-store.ts`, following
      `allowForceWithLease`'s exact seven-edit pattern (interface + setter, `PersistedUi` member,
      default + setter in the creator, `partialize` entry) — **no `version` bump, no `migrate`
      arm**, identical reasoning to every prior boolean addition in this file.
- [ ] Add `systemCacheConsentGiven: boolean` (default `false`) as an **eighth**, separate
      persisted field — set once, the first time `allowSystemCacheClean` is switched from `false`
      to `true` and the one-time acknowledgment dialog (below) is confirmed. Toggling the setting
      off and back on does **not** re-ask; a fresh install or a fresh profile does. This is the
      second factor: a user who flips the switch without reading anything still has to click
      through one dialog that names, in plain language, what just got unlocked.
- [ ] The one-time dialog (a `ConfirmRequest` with `danger: true`, no `blastRadius` — nothing has
      been scanned yet) reads, in substance: *"Midnite can now scan and clean caches outside any
      repo it manages — in your home directory: Cargo, Gradle, Maven, NuGet, Xcode DerivedData,
      Homebrew, pip, npm/pnpm/yarn. Nothing outside this named list is ever touched, deletes still
      go to the Trash first, and this never reaches Photos, Documents, Desktop, or any repo's
      actual source."* Confirming sets `systemCacheConsentGiven = true`; cancelling reverts
      `allowSystemCacheClean` to `false` rather than leaving the checkbox checked with no consent
      recorded.
- [ ] Add a "System caches" `Accordion` section to
      [`optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
      not a new settings page. Phase 72 Theme E already put per-ecosystem opt-outs on this page;
      System caches is one more section on the same page, gated visually and functionally behind
      `optimizerEnabled` already being on (the page itself is unreachable otherwise). Include a
      "What this still never does" box mirroring `git-safety-page.tsx`'s: *"Never `~/Library`
      wholesale — only the named list above. Never the system Trash (a separate review). Never
      Plex or another media tool's cache (a separate review). Never a path this registry doesn't
      name, and never one from a repo-scan `extraRoot` picker."*
- [ ] The System tab's scan action (Theme E) only renders once **all three** are true:
      `optimizerEnabled && allowSystemCacheClean && systemCacheConsentGiven` — matching the
      `use-graph-actions.ts:452-461` "the setting is never the only gate" pattern with a third
      condition instead of two.
- [ ] `optimizer-store.test.ts` / a new `system-cache-consent.test.ts`: toggling
      `allowSystemCacheClean` on without confirming the dialog leaves `systemCacheConsentGiven`
      false and the System tab's action hidden; confirming sets it and it survives a
      simulated reload (persisted); cancelling reverts the toggle.

### D — Vendor reclaim commands, run through the existing trusted-spawn primitive (M)

- [ ] Add `packages/desktop/src/main/optimizer/reclaim-commands.ts` exporting a fixed table:
      ```ts
      export type ReclaimCommand = {
        entryId: string;             // which SystemCacheEntry this offers an alternative to
        label: string;               // "Run `brew cleanup -s`"
        command: string;
        args: readonly string[];     // never built by concatenation or user input
      };
      export const DEFAULT_RECLAIM_COMMANDS: readonly ReclaimCommand[] = [
        { entryId: 'homebrew-cache', label: 'Run brew cleanup -s', command: 'brew', args: ['cleanup', '-s'] },
        { entryId: 'go-build-cache', label: 'Run go clean -cache', command: 'go', args: ['clean', '-cache'] },
        { entryId: 'go-mod-cache', label: 'Run go clean -modcache', command: 'go', args: ['clean', '-modcache'] },
        { entryId: 'pnpm-store', label: 'Run pnpm store prune', command: 'pnpm', args: ['store', 'prune'] },
      ];
      ```
      Cargo's `cargo cache -a` is deliberately **not** in the default table: it needs the
      `cargo-cache` subcommand installed separately (not part of a stock `cargo`), and this
      catalogue does not offer a command whose own absence would need a second "is it installed"
      probe beyond the existing `runProcess` "binary not found" outcome. Add it once `cargo-cache`'s
      prevalence is checked, not speculatively.
- [ ] Run every command through **the existing** `runProcess`/`realSpawn`
      ([`process-runner.ts:42,126`](../../../packages/desktop/src/main/process-runner.ts)),
      unmodified — no shell, a fixed argv, `DEFAULT_TIMEOUT_MS` (2 minutes), `SIGKILL` on the
      process group at timeout. This is the same primitive `diagnostics/runner.ts` and
      `testing/runner.ts` already trust; a vendor reclaim command is a third caller, not a new
      execution model.
- [ ] Add `runReclaimCommand(entryId): Promise<OptimizerResultOf<{ stdout: string; stderr: string }>>`
      in `system-cache-service.ts`, looked up against `DEFAULT_RECLAIM_COMMANDS` by `entryId` —
      **never accepts a command or args from the renderer.** The IPC request carries only an
      `entryId` string; the actual argv is resolved main-side from the fixed table.
- [ ] A `costly` entry with a registered reclaim command offers it as the **default** action ahead
      of a plain trash-delete of the whole directory — see Decision 6 for why (targeted reclaim
      beats bulk delete for a shared, content-addressable store like pnpm's). An entry with no
      registered command only ever offers delete.
- [ ] The confirm dialog for a reclaim command shows the **exact argv** in its body — `brew cleanup
      -s`, not "clean up Homebrew's cache" — so the user is never surprised by what literally runs.
      Output (`stdout`/`stderr`, capped at `OUTPUT_TAIL_CAP`) is shown in the result toast/panel,
      not silently discarded.
- [ ] `reclaim-commands.test.ts`: every command in `DEFAULT_RECLAIM_COMMANDS` names an `entryId`
      present in `DEFAULT_SYSTEM_CACHE_ENTRIES`; `runReclaimCommand` for an unknown `entryId`
      returns `{ok:false}` before spawning anything; a fake `spawn` proves the argv passed to
      `runProcess` is exactly the table's `args`, never mutated.

### E — UI: a System section that never looks like "your project's stuff" (M)

- [ ] Add a "System" section to
      [`storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) — reusing
      `SegmentedBar` for a third instance (category, then Phase 72's ecosystem, then this), gated
      on the Theme C three-way AND and rendered only when true; otherwise the tab is exactly as
      Phase 72 left it. **Not a fifth top-level Optimizer tab** — the existing four (Smart Scan,
      Storage, Memory, GPU) are all repo/machine-monitoring surfaces already; System caches is a
      variant of Storage's "what's taking up space" question, not a new question.
- [ ] A persistent banner above the System section: *"Outside any repo Midnite manages — your
      Cargo, Gradle, Homebrew, etc."* — visually distinct (a different accent, not just a label)
      from the repo-scoped rows above it, so a user scanning the page cannot mistake a home-
      directory cache for something inside a project they opened.
- [ ] Add `blastRadiusKind: 'systemCache'` to `BLAST_RADIUS_COPY` in
      [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx): *"will be
      moved to the trash. This is outside any repo Midnite manages."* — the same `files` copy plus
      the one sentence Theme C's gate promised would always be visible at the moment of the
      decision, not only in Settings.
- [ ] Each row shows the entry's `label` and `producer` exactly as Phase 72's rows show detector
      `label` — *"Cargo registry · will need cargo build / cargo install to redownload"* — never a
      raw path standing alone.
- [ ] Every icon from `react-icons`, imported per set, never `lucide-react` — unchanged repo rule.
- [ ] `packages/app/e2e/optimizer-shots.spec.ts`: the System section, light and dark, **with the
      gate on** — the default-off state means the un-gated shot (today's) stays the common case and
      needs no new coverage.

### F — Verification (M)

- [ ] `system-cache-registry.test.ts`, `system-cache-service.test.ts`,
      `reclaim-commands.test.ts`, `system-cache-consent.test.ts` — all from Themes A, B, D, C
      above.
- [ ] `confine-allowlist.test.ts` (or folded into `fs-scope-write.test.ts`): a path outside every
      entry is refused; a path that is a *parent* of an entry is refused (this is the one a
      `startsWith`-based mistake would pass); a symlink pointing an entry's own path at something
      else is refused; two entries resolving to the same real path (e.g. a customised `CARGO_HOME`
      colliding with another tool) does not double-confine or double-count — assert the dedup rule
      explicitly rather than leaving it implied.
- [ ] `optimizer-handlers.test.ts` (or a new `system-optimizer-handlers.test.ts`): the existing
      `optimizerScan`/`optimizerClean` assertions are unchanged — a diff there is a red flag, per
      Phase 72's own precedent for the same claim.
- [ ] Renderer test: the System section is absent with any one of the three Theme C conditions
      false, and present only with all three true.
- [ ] `moon run :typecheck :lint :test` green.
- [ ] **Human pass, on a real machine with several of these tools installed:** confirm the scan
      reports real, correct byte figures for at least Homebrew, one of Node's stores, and one of
      Rust/Go/Gradle; confirm a clean actually only touches the reported path (check the Trash);
      confirm a vendor reclaim command's output is legible; confirm the one-time consent dialog's
      copy reads as an honest description of the blast radius to someone who has not read this doc.

---

## Files this phase touches

**New**
- `packages/desktop/src/main/optimizer/system-cache-registry.ts` — `SystemCacheEntry`,
  `PathResolver`, `resolveSystemCacheEntries`, `DEFAULT_SYSTEM_CACHE_ENTRIES` (A).
- `packages/desktop/src/main/optimizer/system-cache-service.ts` — `scanSystemCaches`,
  `cleanSystemCaches`, `runReclaimCommand` (B, D).
- `packages/desktop/src/main/optimizer/reclaim-commands.ts` — `DEFAULT_RECLAIM_COMMANDS` (D).
- `packages/desktop/src/main/optimizer/system-cache-registry.test.ts`,
  `system-cache-service.test.ts`, `reclaim-commands.test.ts` (A, B, D, F).
- [`packages/shared/src/domain/system-optimizer.ts`](../../../packages/shared/src/domain/system-optimizer.ts) —
  `SystemCacheItemSchema`, `SystemScanResultSchema`, `SYSTEM_SCAN_ITEMS_CAP` (B).
- `packages/app/src/features/settings/settings-pages/system-cache-consent.test.ts` (C, F).

**Changed**
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineAllowlist`, beside `confineTree` (A). **`confineTree`, `cleanItems`, `knownRoots` are
  unchanged.**
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts),
  [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts),
  [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) —
  `optimizerSystemScan`, `optimizerSystemScanProgress`, `optimizerSystemClean` (B). **No existing
  channel changes shape.**
- [`packages/desktop/src/main/ipc/optimizer-handlers.ts`](../../../packages/desktop/src/main/ipc/optimizer-handlers.ts) —
  three new handlers registered in the same file, beside the existing ones, following the same
  `handle(...)` pattern (B, D).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
  `allowSystemCacheClean`, `systemCacheConsentGiven`, eight edits total, **no `version` bump** (C).
- [`packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx`](../../../packages/app/src/features/settings/settings-pages/optimizer-settings-page.tsx) —
  the "System caches" accordion + the one-time consent dialog trigger (C).
- [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  `blastRadiusKind: 'systemCache'` added to `BLAST_RADIUS_COPY` (E).
- [`packages/app/src/features/optimizer/storage-tab.tsx`](../../../packages/app/src/features/optimizer/storage-tab.tsx) —
  the gated System section, third `SegmentedBar` (E).
- [`packages/app/e2e/optimizer-shots.spec.ts`](../../../packages/app/e2e/optimizer-shots.spec.ts) —
  the gated-on System section shot (E).
- [`packages/shared/src/domain/optimizer.ts`](../../../packages/shared/src/domain/optimizer.ts) —
  `EcosystemSchema` gains `'go'` (Decision 8), **once Phase 72 has landed it** — see the
  sequencing guardrail.

**Deliberately unchanged**
- [`packages/desktop/src/main/optimizer/scan-service.ts`](../../../packages/desktop/src/main/optimizer/scan-service.ts) —
  `cleanItems`, `knownRoots`, `walk`, `classify`, every Phase 72 detector. This phase adds a
  sibling module, never edits this one.
- [`packages/desktop/src/main/process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) —
  reused as-is for Theme D (D).
- [`packages/git-engine/`](../../../packages/git-engine) — gains nothing, per the guardrail.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `confineAllowlist` rejects every case in Theme F's list; `confineTree`/`cleanItems`'s own
      tests are unchanged (diff-empty).
- [ ] No `SystemCacheItem` produced by any test resolves to a path that is not exactly one of
      `DEFAULT_SYSTEM_CACHE_ENTRIES`'s resolved paths.
- [ ] The System section is unreachable with any one of the three Theme C gates off, and the
      one-time consent dialog cannot be bypassed by toggling the setting alone.
- [ ] Every `ReclaimCommand.args` is a literal array asserted never to contain renderer input.
- [ ] Storage tab shots refreshed, gate-on state, light and dark.
- [ ] **Human:** real-machine pass per Theme F.

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
    whatever a different app put there an hour ago. Whether that goes through `osascript`/Finder
    (deferring irreversibility to the OS's own confirm) or a lower-level API, and what confirm
    surface replaces "N items, M bytes" when the count is unknowable without walking `~/.Trash`
    itself, is Phase 74's own design question.
- **Windows/Linux equivalents of this catalogue** (`%LOCALAPPDATA%`, `~/.cache`, etc.). Genuinely
  out of scope rather than silently dropped — see Decision 7.
- **Docker images and volumes.** A different daemon, a different permission model, and (for
  volumes) a delete with no per-file Trash undo at all.
- **A generic `~/Library/Caches` sweep.** Rejected as a mechanism, not merely undone — see the
  scope guardrails.
- **Automatic or scheduled scanning.** Every scan in this app stays user-initiated, System caches
  included.
- **Wiring `optimizerSystemScan` behind its own `ViewId` or nav entry.** It lives inside the
  existing Storage tab; no new rail item, no new chord.

---

## Decisions / open questions

Every decision below was chosen without a human in the loop, running this brainstorm the same way
the interrupted prior session ran Phase 72's — see the task's own instruction to record rather
than silently pick. Each names the recommendation taken and why, so a later refine can reverse it
with the reasoning in view. **Decision 1 is the one a reviewer most needs to check by hand.**

1. **Confinement is a hand-written allowlist checked for exact equality, never a widened
   `knownRoots()` and never a path-prefix check.** The alternative — add `os.homedir()` (or a
   handful of `~/Library/…` roots) to `knownRoots()` and reuse `confineTree` — was seriously
   considered and rejected: `confineTree` trusts *anything strictly under* its root, which is
   correct when the root is "a repo the user opened" and catastrophic when the root is "the user's
   entire home directory." `confineAllowlist`'s exact-match rule means a bug in this phase's own
   code can, at worst, mis-report or refuse an entry — it structurally cannot be tricked into
   confining a path nobody reviewed, because there is no recursive "is this strictly under" check
   to fool. The cost is that every new cache needs a code change (a new registry entry) rather than
   being auto-discovered; that cost is the entire point.
2. **A registry entry's path is resolved by asking the tool when the tool exposes a way to ask
   (`go env`, `pnpm store path`, `brew --cache`), and hardcoded only where the location has never
   been made configurable.** The alternative — hardcode every path — was rejected because several
   of these are genuinely user-configurable (`CARGO_HOME`, a customised pnpm store location via
   `PNPM_HOME`), and a hardcoded guess that misses a customised path is a silent under-report,
   which is the safe failure direction, but a hardcoded guess that happens to collide with
   something else the user put at that path is not. Asking the tool costs one more `runProcess`
   call per scan and removes the ambiguity entirely.
3. **A second, separate wire-contract family (`SystemCacheItemSchema`/`SystemScanResultSchema`),
   never a widened `ScanItemSchema`.** Considered and rejected: adding `repoId: null` support and a
   `'systemCache'` category to the existing `ScanCategorySchema` would let a `ScanItem` represent
   either kind of thing, and the entire value of Theme A's stricter confinement is undermined if a
   later change can hand a system-wide path to code written assuming every `ScanItem.path` sits
   under `knownRoots()`. Two schemas that cannot be confused by the type system are worth the
   duplication of a few field names.
4. **Three-factor gate: `optimizerEnabled` (existing) AND `allowSystemCacheClean` (new checkbox)
   AND `systemCacheConsentGiven` (new, set only by confirming a one-time dialog).** The alternative
   — a single new checkbox, mirroring `allowForceWithLease` exactly — was rejected because the
   blast-radius jump from "one ref" to "the whole machine's dev tooling" is qualitatively larger
   than the jump `allowForceWithLease` itself represents, and a plain checkbox in a settings page a
   user may never fully read is the same shape of consent as the thing that got `node_modules`
   deleted with no producer field in Phase 72's own prehistory. The one-time dialog is friction
   exactly once, not a standing tax on every clean.
5. **The System section lives inside the existing Storage tab, not a new tab or a new `ViewId`.**
   Considered and rejected: a fifth Optimizer tab for one gated, usually-hidden section adds a
   permanent piece of chrome (an always-visible tab that renders "off" for most users) for a
   feature this phase expects to be off by default for a long time. A gated section within an
   existing tab costs nothing when off and needs no nav/chord work at all.
6. **A `costly` entry with a registered vendor reclaim command offers it as the default action;
   plain trash-delete stays available as a fallback.** Recommended over "always offer trash-delete
   first": pnpm's store, in particular, is a single content-addressable directory shared by every
   pnpm project on the machine — deleting the whole thing forces a full re-download for every
   project, where `pnpm store prune` removes only what nothing currently references. The vendor
   almost always knows its own cache's internal structure better than a directory-level delete can.
7. **macOS-only, stated rather than silent.** This app's own scope statement
   ([`docs/INITIAL_PLAN.md:18`](../../../docs/INITIAL_PLAN.md)) is "Desktop-only, macOS arm64
   primary target," and every path in Theme A's catalogue is a macOS path. Windows equivalents
   (`%USERPROFILE%\.cargo`, `%LOCALAPPDATA%`) and Linux equivalents (`~/.cache`, XDG base dirs)
   exist and are a real, named gap — not silently dropped, and not built speculatively for
   platforms this app does not yet ship on. A follow-on phase should add them if/when the app
   itself goes cross-platform, not before.
8. **`EcosystemSchema` gains one member, `'go'`, once Phase 72 lands it.** Phase 72's Decision 7
   shipped no Go *detector* because Go's only in-repo candidate (`vendor/`) is checked in and
   load-bearing — that decision was about the repo-confined scanner, not about whether "go" is a
   valid ecosystem label. This phase's Go entries (`GOCACHE`/`GOMODCACHE`) are genuinely
   out-of-repo caches with nowhere else to be labelled, so the taxonomy widens here instead of
   staying incomplete.
9. **Open — should `allowSystemCacheClean` require re-confirmation after an app update that adds
   new registry entries?** Not built here: `systemCacheConsentGiven`'s copy names specific tools
   (Cargo, Gradle, …) and a future entry (say, a new build ecosystem's cache) added in a later
   phase would technically be covered by a consent the user gave before that entry existed. No
   mechanism ships to re-ask on catalogue growth; revisit if the catalogue changes meaningfully
   after this phase, rather than building versioned consent speculatively for a catalogue that is
   currently ~11 entries.
