# Phase 149 — Midnite game standard, game doctor and game management

Planned 2026-11-17 with the user from a bug report ("GTACT shows no scenes in the Level editor") · grounded against
`5c3162b1b`.

Media ▸ Games only fully works for a game that Studio's own **New game** made with kit 0.12.0 or later. Three of the
user's real games show what goes wrong with any other game:

| Game | What the user sees | Why |
|---|---|---|
| GTACT (`~/GameDev/gtact`) | Lists, but the Level editor says **No levels yet** | kit `0.11.0`; the world is code (`src/scenes/level.js`, 3,908 lines, plus `src/world/*`); no `levels/`, no manifest `levels` key |
| Starbreaker (`~/GameDev/starbreaker`) | Lists with a bare ⚠️ | `vendored: true` (the schema wants an object); `genre: "shmup"` is not in `GAME_GENRES` |
| SynthSurf (`~/GameDev/synthsurf`) | Never lists; Open Game refuses it | No `midnite-game.json`; Vite + TypeScript, so its `index.html` cannot be served as-is |

Nothing says *what* a game must be for every Games feature to work, and nothing says what a given game is missing. On
top of that, a game in the list cannot be renamed, removed, revealed in Finder or deleted. This phase writes the
standard down, adds a **game doctor** that checks a game against it and names each gap with a fix, adds safe one-click
fixes, runs bundled games from their build output, lets Open Game adopt a folder that has no manifest yet, and gives
each game row a context menu.

> **Builds on.**
> - **The manifest:** `GameManifestSchema`, `parseGameManifest` and `GameManifestIssue` in
>   [`shared/src/media-game.ts`](../../../packages/shared/src/media-game.ts). `GAME_ENGINES = ['phaser','three']`,
>   `GAME_GENRES` (10 values), and `vendored` as an object of engine versions. `GameSummarySchema.issue` holds only the
>   **first** issue, and that is the ⚠️ tooltip in
>   [`game-explorer.tsx`](../../../packages/features/media-game/renderer/game-explorer.tsx) (~L111).
> - **Open Game:** `resolveGameFolder` in
>   [`game-open.ts`](../../../packages/features/media-game/main/games/game-open.ts) refuses a folder with no manifest
>   (`No midnite-game.json in "<name>"…`). Phase 132 Decision 17 left "Remove from list" open; Theme I closes it.
> - **Levels:** Phase 132 C/F. `levels/<scene>.tmj`, `GAME_LEVELS_DIR`, `manifest.levels`, and
>   [`game-levels.ts`](../../../packages/features/media-game/main/games/game-levels.ts) `levels()`, which answers
>   `readsLevels`. The pre-0.12 migration recipe lives in the `midnite-media-game-build` skill's **Levels** section.
> - **The kit:** `GAME_KIT_VERSION = '0.12.0'`, and
>   [`kit-upgrade.ts`](../../../packages/features/media-game/main/games/kit-upgrade.ts) `upgradeKit` on a branch, which
>   refuses a dirty tree. `window.__midnite` is installed by `kit/core/hook.js`.
> - **The runner:** [`game-runner.ts`](../../../packages/features/media-game/main/games/game-runner.ts) serves
>   `game.root` through `gameProtocolHandler(root, …)`
>   ([`game-protocol.ts`](../../../packages/features/media-game/main/games/game-protocol.ts)), and a file watcher
>   hot-reloads on change.
> - **Hosts:** `GamesRuntimeDeps` in
>   [`games-runtime.ts`](../../../packages/features/media-game/main/games/games-runtime.ts) (`registerRepo`,
>   `listRepoPaths`). Gamer's `createOpenedGamesStore`
>   ([`modules/gamer/main/opened-games.ts`](../../../packages/modules/gamer/main/opened-games.ts)).
>   `GamesChangedSchema.reason` already has `'removed'`.
> - **MCP:** `GAME_MCP_TOOL_IDS`, `GAME_MCP_READ_TOOL_IDS` and `GAME_AGENT_TOOL_IDS` in
>   [`media-game-mcp.ts`](../../../packages/shared/src/media-game-mcp.ts); adapters in
>   [`game-mcp.ts`](../../../packages/features/media-game/main/games/game-mcp.ts).
> - **Menus:** `KitContextMenu` / `FrameMenuEntry` from `packages/frame/src/kit/context-menu.tsx` (a feature may import
>   the frame).

> **Scope guardrails.** The standard is checked, never enforced at list time: a game that fails a rule still lists,
> runs if it can, and shows its findings. The doctor is **read-only**. Only Theme D's named fixes write. Each fix is
> one commit naming only the files it touched, through `writeQueue`, and refuses a dirty tree for any file it would
> touch. **No code migration**: moving a hard-coded world into `levels/*.tmj` stays agent work, which the doctor *links
> to* but never does. **No dev servers**: a bundled game runs from its build output; Vite HMR, `localhost` and ports are
> out. Engines stay `phaser` and `three`. Every IPC op answers `GitOpResult` and never throws; native dialogs and
> `shell` stay in main. A feature imports only the frame and `shared`. macOS only. Icons come from `react-icons` only.
> New tests are vitest. No committed screenshots.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Any game can say what it is, any game can be told what it is missing, and any game in the list can be managed._
Planned 2026-11-17. Build order: **A** and **B** first, in parallel. Then **C** and **I** in parallel. Then **D**,
**E** and **F**. Then **G**, then **H**.

**Theme A — The Midnite game standard.** ✅ `docs/GAME_STANDARD.md`: the contract, one rule per section, each with a
stable rule id (`manifest.*`, `entry.*`, `kit.*`, `levels.*`, `assets.*`), a level (`error` / `warn` / `info`), what it
unlocks and how to fix it. The same ids are exported from `shared` (`game-standard.ts`: `GAME_RULE_IDS`, `GAME_RULES`, `GameFixIdSchema`) and `game-standard.test.ts` fails if the doc's rule table drifts. The `midnite-media-game-build` skill links it from all seven copies.

**Theme B — Manifest schema additions.** ✅ An optional `build: { command, out }`, `shmup` and other genres added to
`GAME_GENRES`, `genre: null` documented as "custom", and `vendored: true` accepted as a legacy shape and normalised to
`{}`, with a doctor finding to replace it. Landed: five genres appended, `GENRES_WITH_STARTER`/`hasStarter` (the template matrix is keyed by `StarterGenre`; the wizard filters by it), `rawManifestHasLegacyVendored`, and `build` with a no-`..` refine.

**Theme C — The game doctor.** ◻ `game-doctor.ts` in main: `diagnoseGame(path) → GameDiagnosis` (findings, a
per-area score, a summary), behind `mstudio:games:doctor` and the read-only `game_doctor` MCP tool. Each finding names
its rule id and a fix hint, and when one exists, a `fixId`.

**Theme D — Safe fixes.** ◻ `applyGameFix(path, fixId)`, one commit per fix: write a missing manifest, normalise
`vendored`, set the genre, add a `build` block, add `levels` once `levels/*.tmj` exists, and start a kit upgrade
(delegating to `upgradeKit`). Exposed as `mstudio:games:doctor-fix` and the write tool `game_doctor_fix`.

**Theme E — Build-output entry.** ✅ A game with `build` runs `build.command` in its repo before Run, streams the output to
the console drawer as `source: 'build'` entries, and serves `build.out` instead of the repo root. Landed: `serveRoot`
(`gameServeRoot` in `game-build.ts`, via `joinWithin`) feeds the protocol handler and export; `runGameBuild` spawns
with `shell: true`, the login-shell `PATH` and `MOON_*` stripped, a 5-minute timeout and an abort signal, and refuses
with the install hint when `package.json` exists without `node_modules`; a failed build leaves the runner host in a
build-failure state (`GAME_BUILD_REASON_PREFIX`) with the last 20 lines; the watcher ignores `build.out` and rebuilds
then reloads on a 400 ms debounced source change, cancelling a build in flight; Reload rebuilds when a source changed
or the last build failed.

**Theme F — Adopt a folder with no manifest.** ◻ Open Game on a git repo with no `midnite-game.json` stops refusing.
It answers `needs-manifest` with a manifest *inferred* from `package.json`, `index.html` and vendored engines, and the
renderer shows it for a one-click "Write and add". SynthSurf is the case it is built for.

**Theme G — Doctor panel in the Games tab.** ◻ The ⚠️ tooltip becomes a status dot (red / amber / green) that opens a
**Doctor** panel listing every finding, grouped by area, each with its fix hint and a **Fix** button where a `fixId`
exists. The Level editor's "No levels yet" state says *why* (from `levels.*` findings) and links to the panel.

**Theme H — Verification and adoption.** ◻ The CI gate, plus a human pass adopting Starbreaker (manifest fixes),
SynthSurf (Open Game → build entry) and GTACT (kit upgrade → doctor shows the levels migration as the only gap).

**Theme I — Game management: rename, remove, reveal, delete.** ✅ A context menu on every game row (right-click and a
⋯ button on hover/focus): **Rename…** (inline, Enter commits `chore(midnite): rename to <name>` for `manifest.name` only),
**Reveal in Finder**, **Copy path**, **Remove from list** (disabled with the doc's tooltip for a game directly under the
games root; in Studio it also leaves the repos panel and the label says so) and **Delete game…** (type-the-name confirm
showing path, size, uncommitted files and unpushed commits, or "No remote" in red; always `shell.trashItem`, never `rm`,
and a refused Trash puts the game back in the list). New channels `gamesRename/Forget/Reveal/DeleteInfo/Delete`, ports
`forgetRepo`/`revealPath`/`trashPath` wired in Studio and Gamer, `createOpenedGamesStore().remove`. "Run doctor" joins the
menu when Theme G supplies a handler. Closes Phase 132 Decision 17.

## Build order

1. **A** and **B** in parallel. A is a doc plus a `shared` rules file. B is a `shared` schema change. Their only
   shared file is `media-game.ts`: A adds a new file and only re-exports.
2. **C** (needs A's rule ids and B's schema) and **I** (independent: list, service and menu) in parallel.
3. **D**, **E** and **F** in parallel once C is in. D needs C's `fixId`s. E needs B's `build`. F reuses D's
   `inferManifest`, so if F lands first it owns `infer-manifest.ts` and D imports it.
4. **G** after C and D. **H** last.

A partial landing is safe at every step. Without C, the ⚠️ shows the first issue as it does today. Without E, a
`build` game shows `entry.bundled-without-build`, and Run serves the root as today. Without I, rows have no menu, as
today.

## Deliverables

### A — The Midnite game standard [S · 1-2h]

- [x] Net-new `docs/GAME_STANDARD.md`, linked from `docs/APPS.md` and from the `midnite-media-game-build` skill's
      opening paragraph. Sections, in order:
  1. **What a Midnite game is**: its own git repo, with `midnite-game.json` at the root.
  2. **Manifest**: required fields, the engine/dimension/perspective/genre enums, `vendored` as an object, `entry`,
     and the optional `build` and `levels`.
  3. **Entry**: either no-bundler (ES modules plus an import map plus `vendor/`) or `build: { command, out }`, with an
     `index.html` in `out`.
  4. **Kit and hook**: `kitVersion` ≥ `GAME_KIT_VERSION`, `kit/` present, `window.__midnite` installed (an
     `installHook` call reachable from the entry).
  5. **Levels**: `levels/<scene>.tmj` plus `manifest.levels.start`. Procedural content may stay in code. Links to the
     skill's migration recipe.
  6. **Assets**: `assets/<kind>/…`, each listed in `manifest.assets` with `sha256`.
  7. **Rule table**: every rule id, level, one-line check, and fix (the table generated in the next item must match).
- [x] Net-new `packages/shared/src/game-standard.ts`, re-exported from the `shared` barrel:
  - `GAME_RULE_IDS` (as const) — exactly:
    `manifest.missing`, `manifest.invalid-json`, `manifest.schema` (one finding per schema issue),
    `manifest.vendored-legacy`, `manifest.genre-unknown`,
    `entry.missing`, `entry.bundled-without-build`, `entry.build-out-missing`,
    `kit.missing`, `kit.outdated`, `kit.hook-missing`,
    `levels.none`, `levels.not-declared`, `levels.start-missing`, `levels.invalid`,
    `assets.unlisted`, `assets.missing-file`, `assets.hash-mismatch`.
  - `GameRuleLevelSchema = z.enum(['error','warn','info'])`.
  - `GAME_RULES: Record<GameRuleId, { level: GameRuleLevel; area: 'manifest'|'entry'|'kit'|'levels'|'assets'; title:
    string; unlocks: string; fix: string }>`. `unlocks` names the feature that needs the rule: "Run", "Level editor",
    "Scene jump", "Asset resync", and so on.
  - `GameFixIdSchema = z.enum(['write-manifest','normalise-vendored','set-genre','add-build','declare-levels','upgrade-kit'])`.
- [x] `game-standard.test.ts`: every id has a `GAME_RULES` entry; every rule id appears in `docs/GAME_STANDARD.md`'s
      rule table (read the file with `fs`, as the skills-copies test does).

### B — Manifest schema additions [M · 2-3h]

- [x] `GAME_GENRES` gains `shmup`, `platformer-action`, `racing`, `puzzle` and `arcade`. Append them; never reorder.
      The wizard's genre list (`game-wizard-model.ts`) does **not** show them until a starter exists. Filter it by
      `GENRES_WITH_STARTER`, a new const beside `GAME_GENRES`.
- [x] `GameManifestSchema.genre` stays `GameGenreSchema.nullable()`. JSDoc: `null` means custom, so no genre template
      applies.
- [x] `vendored`: `z.union([z.literal(true).transform(() => ({})), <existing object>]).prefault({})`. Parsing
      Starbreaker's manifest succeeds, and `rawManifestHasLegacyVendored(raw: unknown): boolean` (exported) lets the
      doctor raise `manifest.vendored-legacy`.
- [x] Optional `build: z.object({ command: z.string().min(1).max(500), out: z.string().min(1).regex(/^[^/][^\0]*$/,
      'must be relative') }).optional()`. `out` must not contain `..` segments (a `refine`), so it resolves inside the
      game.
- [x] `media-game.test.ts` cases: Starbreaker's literal manifest parses, a `shmup` genre parses, `build.out` of
      `../x` or `/abs` is refused, and an unknown genre still fails with its path `genre`.

### C — The game doctor [M · 3-4h]

- [ ] Contract in `media-game.ts`:
  - `GameFindingSchema = z.object({ rule: GameRuleIdSchema, level: GameRuleLevelSchema, area, message: z.string(),
    path: z.string().nullable(), fixId: GameFixIdSchema.nullable() })`.
  - `GameDiagnosisSchema = z.object({ path, hasManifest: z.boolean(), findings: z.array(GameFindingSchema),
    counts: z.object({ error, warn, info }), status: z.enum(['ok','warn','error']) })`.
  - `CHANNELS.gamesDoctor: 'mstudio:games:doctor'` (after `gamesKitUpgrade`); `schemas.GamesDoctorRequest = {
    gameId?: string; path?: string }` (exactly one); `games.doctor(req)` on the bridge, in Studio's preload and
    Gamer's bridge.
- [ ] Net-new `packages/features/media-game/main/games/game-doctor.ts`:
      `diagnoseGame(path: string): Promise<GameDiagnosis>`. It never throws (any fs error becomes a finding or is
      skipped). Each check, in order:
  - **manifest**: missing → `manifest.missing` (`fixId: 'write-manifest'`); not JSON → `manifest.invalid-json`; each
    `parseGameManifest` issue → `manifest.schema` with its `path`; legacy `vendored: true` →
    `manifest.vendored-legacy` (`normalise-vendored`); genre not in the enum → `manifest.genre-unknown`
    (`set-genre`), *and* stop raising the matching `manifest.schema` issue so it is not reported twice.
  - **entry**: no `index.html` at the root (or in `build.out` when `build` is set) → `entry.missing`. A
    `package.json` whose `dependencies`/`devDependencies` include `vite`, `webpack`, `esbuild`, `parcel` or
    `typescript`, *and* an `index.html` with a `<script type="module" src="…ts">` or bare-specifier import, with no
    `build` → `entry.bundled-without-build` (`add-build`). `build` set but `build.out/index.html` absent →
    `entry.build-out-missing` (`info`: "Run builds it").
  - **kit**: no `kit/` → `kit.missing` (`info` for a `build` game, else `warn`); `kitVersion` < `GAME_KIT_VERSION`
    (semver compare; reuse the helper `kit-upgrade.ts` uses, or add `compareSemver` to `shared`) → `kit.outdated`
    (`upgrade-kit`); no `installHook` text match under `src/` (bounded walk: 2,000 files, skipping `node_modules`,
    `vendor`, `dist`, `.git`) → `kit.hook-missing`.
  - **levels**: no `levels/*.tmj` → `levels.none` (`info`, with the message linking the skill recipe); files but no
    `manifest.levels` → `levels.not-declared` (`declare-levels`); `levels.start` names no file →
    `levels.start-missing`; reuse `game-levels.ts`'s parse so an invalid level → `levels.invalid` with its first issue.
  - **assets**: a file under `assets/<kind>/` not in `manifest.assets` → `assets.unlisted` (`info`); a listed path that
    is missing → `assets.missing-file`; a `sha256` mismatch → `assets.hash-mismatch`. Hash only files ≤ 50 MB, and skip
    the rest with no finding.
  - `status`: `error` if any error, else `warn` if any warn, else `ok`.
- [ ] The games service: `doctor(req)` resolves `gameId` through `resolve`, or takes `path` (used by F, before a game is
      listed), and confines `path` to an existing absolute directory.
- [ ] `GameSummarySchema` gains `status: z.enum(['ok','warn','error']).nullable()` and `findingCount: z.number()`.
      `listGames` fills them from a **cheap** diagnosis (manifest, entry and kit only; no asset hashing or source walk),
      so the list stays fast. `issue` stays for back-compat.
- [ ] MCP: `game_doctor` (`{ game }` → the diagnosis JSON) in `GAME_MCP_TOOL_IDS` and `GAME_MCP_READ_TOOL_IDS`, and
      the adapter in `game-mcp.ts`. The id union in `shared/src/mcp.ts` updates. `mcp.test.ts`'s read set gains it.
- [ ] `game-doctor.test.ts` against three fixtures under `main/games/__fixtures__/doctor/`: `legacy-3d` (GTACT-shaped:
      kit 0.11, no levels), `shmup-legacy` (Starbreaker-shaped manifest) and `vite-no-manifest` (SynthSurf-shaped:
      `package.json` with vite and typescript, `index.html` with `src/main.ts`). Assert exact rule ids per fixture, and
      a clean fixture made by `composeStarter` that answers `status: 'ok'` with no `error`/`warn`.

### D — Safe fixes [M · 3-4h]

- [ ] Contract: `CHANNELS.gamesDoctorFix: 'mstudio:games:doctor-fix'`, `GameFixRequestSchema = { gameId?: string;
      path?: string; fixId: GameFixIdSchema; genre?: GameGenre | null; build?: { command; out } }`, answering
      `GitOpResult<{ commit: string | null; branch?: string; diagnosis: GameDiagnosis }>`.
- [ ] Net-new `main/games/infer-manifest.ts`: `inferManifest(path): Promise<GameManifest>`.
  - name: `package.json` `name` humanised, else the folder name.
  - engine: a vendored or `package.json` `three` → `three`, `phaser` → `phaser`; neither → refuse with
    `Only Phaser and three.js games are supported.`
  - dimension: `three` → `3d`, `phaser` → `2d`. perspective: `third-person` for 3D, `top-down` for 2D (the doctor
    and the F sheet let the user change both).
  - genre: `null`. starter: `custom`. kitVersion: the game's `kit/` version if present, else `'0.0.0'` (raises
    `kit.outdated`).
  - vendored: versions read from `vendor/` or `package.json`. build: from F's detection (`pnpm build` / `npm run
    build` / `yarn build` by lockfile, `out: 'dist'`, or `vite.config.*`'s `build.outDir` when it is a string literal).
- [ ] Net-new `main/games/game-fixes.ts`: `applyGameFix(path, req, deps)`. Each fix:
      reads, then changes only its fields, then writes the manifest with 2-space JSON and a trailing newline, keeping
      unknown keys (the schema is `passthrough`), then `git add -- midnite-game.json` and commits
      `chore(midnite): <fix title>` through `writeQueue`. A fix whose target file is dirty refuses with
      `Commit or discard your changes to midnite-game.json first.`
  - `write-manifest`: `inferManifest`. Refuses if a manifest exists.
  - `normalise-vendored`: `true` → the inferred `vendored` object.
  - `set-genre`: `req.genre` (a `GameGenre` or `null`).
  - `add-build`: `req.build` or the inferred one.
  - `declare-levels`: `levels: { dir: 'levels', start }`, where `start` is `level` if it exists, else the first scene
    alphabetically.
  - `upgrade-kit`: calls `upgradeKit` (its own branch and dirty-tree rule) and answers `{ branch }`.
  - After any fix: emit `gamesChanged { reason: 'manifest' }` and answer the fresh diagnosis.
- [ ] MCP `game_doctor_fix` (`{ game, fixId, genre?, build? }`). It is a write, so it is refused while `allowGames` is
      off, and is in `GAME_AGENT_TOOL_IDS`.
- [ ] Tests: `infer-manifest.test.ts` (the three fixtures, the non-phaser/three refusal) and `game-fixes.test.ts` (each
      fix on a temp repo: one commit, one path in it, unknown manifest keys kept, the dirty refusal).

### E — Build-output entry [L · 4-6h]

- [x] `game-runner.ts`: when `manifest.build` is set, `serveRoot = joinWithin(root, build.out)` (refuse
      `Build output is outside the game.` if it is null). `gameProtocolHandler(serveRoot, …)` for the session.
      `importMapHashes` reads `serveRoot/index.html`.
- [x] Net-new `main/games/game-build.ts`: `runGameBuild(root, build, onLine, signal): Promise<GitOpResult<{ ms }>>`.
  - Spawns `build.command` with `shell: true`, `cwd: root`, and the login-shell `PATH` (reuse the runtime's shell-env
    helper). Strip inherited `MOON_*` env (see commit `014fc9a62`).
  - Streams stdout/stderr lines to the console drawer as `source: 'build'` entries (`GameConsoleEntry` gains that
    source). Times out after 5 min (`Build took longer than 5 minutes.`). A non-zero exit → `failure('Build failed
    (exit N).', lastLines)`.
- [x] Run order for a build game: build, then load. If a build fails, Run stops in the runner host's existing error
      state with the last 20 lines. No `node_modules` → the first build line says `Run your package manager's install
      in <path> first.`, and the build refuses (never auto-install).
- [x] Watcher: ignore `build.out`. A change elsewhere (outside `.git`, `node_modules`, `vendor`, `playtests`) debounces
      400 ms, rebuilds, then reloads. A rebuild already running is cancelled through its `AbortSignal`.
- [x] Export (`game-export.ts`) bundles from `serveRoot`.
- [x] Tests: `game-build.test.ts` (an `echo`/`exit 1` command, timeout via a fake timer, abort) and runner cases
      (`serveRoot` used, `out` escaping refused, watcher ignores `out`).

### F — Adopt a folder with no manifest [M · 2-3h]

- [ ] `resolveGameFolder`: when the work-tree top has no manifest (and `path` has none), answer
      `ok({ root: top, needsManifest: true })` instead of the `No midnite-game.json` refusal. The other refusals are
      unchanged.
- [ ] `GameAddResultSchema` gains `z.object({ status: z.literal('needs-manifest'), path, proposed: GameManifestSchema,
      diagnosis: GameDiagnosisSchema })`. `service.add` answers it with `inferManifest(top)` and **does not register**
      the repo yet. An `inferManifest` refusal comes back as `failure`.
- [ ] `GameAddRequestSchema` gains `confirmManifest?: GameManifest`. When present, the service writes it through
      `applyGameFix('write-manifest')` (with the user's edits), then registers, and answers `added`.
- [ ] Renderer: net-new `renderer/adopt-game-sheet.tsx`. It shows the proposed name, engine, dimension, perspective,
      genre (with a "Custom" option for `null`) and build command/out as editable fields, the diagnosis findings
      under them, and **Write manifest and add** / **Cancel**.
- [ ] Tests: `game-open.test.ts` (the no-manifest folder now resolves with `needsManifest`),
      `game-service-add.test.ts` (`needs-manifest` then `confirmManifest` → one commit and `added`), and
      `adopt-game-sheet.test.tsx`.

### G — Doctor panel in the Games tab [M · 2-3h]

- [ ] `game-explorer.tsx`: replace the ⚠️ with a status dot (`status` from the summary: green `ok` is hidden, amber
      `warn`, red `error`), with `aria-label="<n> findings"`. Clicking it opens the Doctor panel.
- [ ] Net-new `renderer/game-doctor-panel.tsx` (a side panel in the right column, the same slot as the detail panel):
      calls `games.doctor`, groups findings by area in the order manifest → entry → kit → levels → assets, and gives
      each row a level icon (`LuCircleX` / `LuTriangleAlert` / `LuInfo`), the message, `unlocks` in muted text, the fix
      hint, and a **Fix** button when `fixId` is set. `set-genre` and `add-build` open a small inline form first.
      `upgrade-kit` says it makes a branch. **Re-check** reruns the diagnosis.
- [ ] Level editor empty state (`level/level-editor.tsx`): when the diagnosis has `levels.none` *and* the code has
      scenes (`kit.outdated` or any `src/scenes/*.js`), the body reads "This game builds its levels in code. Move the
      layout into levels/ to edit it here." with **Open Doctor**. `levels.not-declared` → "Levels found but not
      declared" with a **Declare levels** fix button.
- [ ] Tests: `game-doctor-panel.test.tsx` (grouping, the Fix call and a refresh, inline genre form),
      `game-explorer.test.tsx` (dot per status) and `level-editor.test.tsx` (the two new empty states).

### H — Verification and adoption [S · 1-2h]

- [ ] CI green (`moon run :typecheck :lint :test` via CI; see [no local gate](../../../CLAUDE.md)).
- [ ] Human pass, Studio:
  - Starbreaker: the dot is amber → Fix `normalise-vendored` → set genre `shmup` → green; it runs as before.
  - SynthSurf: Open Game → adopt sheet → Write manifest and add → Run builds and plays from `dist/`; editing a `.ts`
    rebuilds and reloads.
  - GTACT: the doctor shows `kit.outdated` and `levels.none`; Fix `upgrade-kit` makes its branch; the Level editor
    shows the "levels in code" state.
- [ ] Human pass, Gamer: the same three, with the context menu's Remove from list and re-open (I).
- [ ] `midnite-media-game-build` skill (all byte-identical copies): a **Standard** section pointing at
      `docs/GAME_STANDARD.md`, `game_doctor` and `game_doctor_fix`, and "run `game_doctor` first in an unfamiliar game".

### I — Game management: rename, remove, reveal, delete [M · 3-4h]

- [x] Contract in `media-game.ts` and the IPC files:
  - `CHANNELS.gamesRename: 'mstudio:games:rename'` — `{ gameId, name: z.string().trim().min(1).max(80) }`. Writes
    `manifest.name` only (the folder is **not** renamed), as one commit `chore(midnite): rename to <name>`, and emits
    `gamesChanged { reason: 'manifest' }`.
  - `CHANNELS.gamesForget: 'mstudio:games:forget'` — `{ gameId }`. Removes the game from the list without touching the
    disk, and emits `gamesChanged { reason: 'removed' }`.
  - `CHANNELS.gamesReveal: 'mstudio:games:reveal'` — `{ gameId }` → `shell.showItemInFolder(path)` through a host port.
  - `CHANNELS.gamesDeleteInfo: 'mstudio:games:delete-info'` — `{ gameId }` → `{ path, name, uncommitted: number,
    unpushed: number | null, hasRemote: boolean, bytes: number }`. Uses `git status --porcelain -z` count,
    `rev-list --count @{u}..HEAD` (null with no upstream), and a bounded size walk.
  - `CHANNELS.gamesDelete: 'mstudio:games:delete'` — `{ gameId, confirmName: string }`. Refuses unless `confirmName ===
    name`. Stops a running game first, forgets it, then `shell.trashItem(path)` through a host port (**Trash, never
    `rm`**), and emits `removed`.
- [x] `GamesRuntimeDeps` gains `forgetRepo(path): Promise<GitOpResult>`, `revealPath(path): void` and
      `trashPath(path): Promise<GitOpResult>`.
  - Studio wires `forgetRepo` to the repos panel's own remove (the game's repo leaves the repos panel too, and the
    menu item says so: **Remove from list (and repos panel)**).
  - Gamer wires it to `createOpenedGamesStore().remove(path)` (net-new `remove`).
  - A game under the games root is still found by `listGames`'s directory scan, so **Remove from list** on such a game
    is disabled, with the tooltip `Games in the games folder always list — move or delete it to remove it.`
- [x] Renderer: net-new `renderer/game-row-menu.tsx`, used by `game-explorer.tsx` on `onContextMenu` and on a ⋯ button
      shown on row hover/focus. Items, in order: **Rename…** (inline edit in the row; Enter saves, Esc cancels),
      **Reveal in Finder**, **Copy path**, separator, **Run doctor** (G's panel), separator, **Remove from list**, and
      **Delete game…** (destructive styling).
- [x] Net-new `renderer/delete-game-dialog.tsx`, the blast-radius confirm the repo convention asks for:
  - Shows the path, the size, `N uncommitted files`, and `N commits not pushed` (or `No remote — this is the only
    copy` in red when `hasRemote` is false).
  - States that it moves the folder to the Trash.
  - Has a text field reading `Type <name> to confirm`, and a **Move to Trash** button enabled only on an exact match.
- [x] Tests: `game-service-manage.test.ts` (rename commit, forget, delete refuses a wrong name, delete calls
      `trashPath` once and never `rm`, delete stops a running game), `opened-games.test.ts` (`remove`),
      `game-row-menu.test.tsx` (items, the disabled Remove under the games root, keyboard open via ⋯) and
      `delete-game-dialog.test.tsx` (blast radius text, exact-match gating).

## Files this phase touches

| File | Change |
|---|---|
| `docs/GAME_STANDARD.md` | new (A) |
| `packages/shared/src/game-standard.ts` (+ test) | new (A) |
| `packages/shared/src/media-game.ts` (+ test) | genres, `vendored`, `build`, finding/diagnosis/fix schemas, summary status, add-result, manage requests (B, C, D, F, I) |
| `packages/shared/src/ipc/channels.ts`, `ipc/schemas.ts`, `ipc/bridge.ts` | `gamesDoctor`, `gamesDoctorFix`, `gamesRename`, `gamesForget`, `gamesReveal`, `gamesDeleteInfo`, `gamesDelete` |
| `packages/shared/src/media-game-mcp.ts`, `mcp.ts` (+ tests) | `game_doctor`, `game_doctor_fix` |
| `packages/features/media-game/main/games/game-doctor.ts`, `infer-manifest.ts`, `game-fixes.ts`, `game-build.ts` (+ tests, `__fixtures__/doctor/`) | new (C, D, E) |
| `…/main/games/game-open.ts`, `game-service.ts`, `game-list.ts`, `game-runner.ts`, `game-export.ts`, `game-mcp.ts`, `games-runtime.ts` | edits |
| `…/renderer/game-explorer.tsx`, `game-doctor-panel.tsx`, `adopt-game-sheet.tsx`, `game-row-menu.tsx`, `delete-game-dialog.tsx`, `level/level-editor.tsx` (+ tests) | G, F, I |
| `packages/desktop/src/main/index.ts`, `packages/desktop/src/preload/*` | Studio host ports and bridge |
| `packages/modules/gamer/main/context.ts`, `opened-games.ts`, Gamer bridge | Gamer host ports and `remove` |
| `.claude/skills/midnite-media-game-build/SKILL.md` and its copies | H |

## Verification

- [ ] `moon run :typecheck :lint :test` green in CI.
- [ ] `game-standard.test.ts` (A); the `media-game.test.ts` schema cases (B).
- [ ] `game-doctor.test.ts` over the four fixtures, and the MCP read-set test (C).
- [ ] `infer-manifest.test.ts`, `game-fixes.test.ts`, and the MCP write-set and agent-set tests (D).
- [ ] `game-build.test.ts` and the runner `serveRoot`/watcher cases (E).
- [ ] `game-open.test.ts`, `game-service-add.test.ts` and `adopt-game-sheet.test.tsx` (F).
- [ ] `game-doctor-panel.test.tsx`, `game-explorer.test.tsx` and `level-editor.test.tsx` (G).
- [ ] `game-service-manage.test.ts`, `opened-games.test.ts`, `game-row-menu.test.tsx` and `delete-game-dialog.test.tsx` (I).
- [ ] **Open, for a human:** the H passes in Studio and Gamer.

## Not in this phase

- **Moving a hard-coded world into `levels/`** (GTACT's city, Starbreaker's waves). The doctor names the gap and links
  the skill's recipe; an agent does the move per game. Automatic extraction from JS is not feasible.
- **Dev servers and HMR** for bundled games: build-then-serve only.
- **Engines other than Phaser and three.js.** `inferManifest` refuses them.
- **Renaming the game folder.** Rename changes `manifest.name` only. Moving a repo breaks its registration and is a
  Finder job.
- **Permanent delete.** Delete always goes to the Trash.
- **Enforcing the standard at list time.** A failing game still lists.

## Decisions / open questions

1. **Resolved — bundled games run from build output.** Agreed with the user. The manifest's `build: { command, out }`
   runs before Run, and Studio serves `out`. A dev server would mean `localhost` and a port inside the game sandbox's
   CSP, and HMR the runner's watcher already approximates.
2. **Resolved — genres are extended, and `null` means custom.** Agreed with the user. `shmup` and four more join
   `GAME_GENRES`, appended. The wizard only shows genres that have a starter (`GENRES_WITH_STARTER`), so adding a genre
   never offers an empty template.
3. **Resolved — the doctor lints, and offers safe fixes.** Agreed with the user. Only the six `GameFixId`s write, each
   one commit on one file (bar `upgrade-kit`, which keeps its own branch flow). Code migrations stay agent work.
4. **Resolved — Open Game adopts a folder with no manifest.** Agreed with the user. It proposes an inferred manifest,
   and nothing is written or registered until the user confirms the sheet.
5. **Resolved — `vendored: true` is accepted as legacy.** It parses (normalised to `{}`) so Starbreaker stops being
   "invalid" on day one, and the doctor still raises `manifest.vendored-legacy` with a one-click fix. Refusing it
   would keep the ⚠️ for a shape that is harmless.
6. **Resolved — the list uses a cheap diagnosis.** Manifest, entry and kit checks only, so `listGames` stays a few fs
   reads per game. Asset hashing and the source walk run only in the Doctor panel and `game_doctor`.
7. **Resolved — game management (Theme I), added by the user mid-plan.** Rename, Reveal, Copy path, Remove from list
   and Delete. Delete moves the folder to the Trash behind the blast-radius confirm (uncommitted, unpushed, no-remote
   warning, type-the-name). This closes Phase 132 Decision 17. In Studio, Remove also removes the repo from the repos
   panel, because that is the list's source. The menu label says so rather than keeping a second hidden list.
8. **Open — should Remove from list in Studio keep the repo in the repos panel?** Recommended: no, as in 7. If the
   user wants the game gone from Games but kept as a repo, that needs a `hiddenGames` setting in the games settings
   store. It is small, and can join I if asked.
