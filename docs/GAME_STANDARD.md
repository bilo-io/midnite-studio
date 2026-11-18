# The Midnite game standard

What a game must be for every feature of Media ▸ Games to work. The standard is **checked, never enforced**: a game
that fails a rule still lists in Studio and runs if it can, and the game doctor ([Phase 149](../.midnite/tasks/FEATURES/phases/phase-149-midnite-game-standard-doctor.md))
names each gap with a fix. Each rule has a stable id, a level (`error`, `warn` or `info`), what it unlocks and how to
fix it. The ids live in [`packages/shared/src/game-standard.ts`](../packages/shared/src/game-standard.ts), and a test
fails when that file and the rule table below disagree.

## 1. What a Midnite game is

A game is **its own git repository** with `midnite-game.json` at the root. The folder is the game: Studio lists it,
serves it in a sandbox, and reads back what it prints with `console.log` and what `window.__midnite.getState()`
returns.

## 2. Manifest

`midnite-game.json` is parsed by `GameManifestSchema` (`packages/shared/src/media-game.ts`). Unknown keys are kept, so
an agent may add its own.

- **Required:** `version` (`1`), `name` (1 to 80 characters), `engine`, `dimension`, `perspective`, `genre`, `starter`,
  `kitVersion` (semver).
- **Enums:** `engine` is `phaser` or `three`; `dimension` is `2d` or `3d`; `perspective` is one of the nine
  perspectives; `genre` is one of `GAME_GENRES`, or `null` for a **custom** game with no genre template.
- **`vendored`** is an object of engine versions, such as `{ "phaser": "3.80.1" }`. The legacy `true` still parses
  (as `{}`) and raises `manifest.vendored-legacy`.
- **`entry`** is `index.html`.
- **Optional `build`:** `{ "command": "npm run build", "out": "dist" }`. `out` is relative and stays inside the game
  (no `..` segment).
- **Optional `levels`:** `{ "dir": "levels", "start": "<scene>" }`.

## 3. Entry

Either:

- **No bundler:** ES modules, an import map and a `vendor/` folder, with `index.html` at the repo root; or
- **A bundled game:** `build: { command, out }`, with an `index.html` in `out`. Studio runs `command`, then serves
  `out`. There is no dev server and no HMR.

## 4. Kit and hook

- `kitVersion` is at least `GAME_KIT_VERSION`, and `kit/` is present.
- `window.__midnite` is installed: an `installHook` call reachable from the entry module. Play-test, state read-back
  and scene jump all need it.

## 5. Levels

`levels/<scene>.tmj` files plus `manifest.levels.start` name the scenes the Level editor opens. Procedural content may
stay in code. Moving a hard-coded world into `levels/` is agent work: the doctor links to the
`midnite-media-game-build` skill's **Levels** section, which holds the migration recipe, and never does it.

## 6. Assets

Files live under `assets/<kind>/…`, and each is listed in `manifest.assets` with its `sha256` and provenance.

## 7. Rule table

| Rule id | Level | Check | Unlocks | Fix |
|---|---|---|---|---|
| `manifest.missing` | error | midnite-game.json is missing | Listing, Run, every Games feature | Write a manifest at the repo root (the doctor can infer one). |
| `manifest.invalid-json` | error | midnite-game.json is not valid JSON | Listing, Run, every Games feature | Repair the JSON syntax. |
| `manifest.schema` | error | A manifest field is missing or has the wrong shape | Listing, Run, every Games feature | Correct the field named by the finding. |
| `manifest.vendored-legacy` | warn | `vendored` is `true` instead of an object of engine versions | Engine version checks | Replace `true` with an object such as `{ "phaser": "3.80.1" }`. |
| `manifest.genre-unknown` | warn | `genre` is not one Midnite knows | Genre options in the editor | Set a known genre, or `null` for a custom game. |
| `entry.missing` | error | The entry `index.html` does not exist | Run | Add `index.html` at the repo root, or in `build.out` for a bundled game. |
| `entry.bundled-without-build` | warn | The game needs a bundler but the manifest has no `build` | Run | Add `build: { command, out }` so Studio builds and serves the output. |
| `entry.build-out-missing` | warn | `build.out` does not exist yet | Run | Run the build command once, or correct `build.out`. |
| `kit.missing` | warn | The `kit/` folder is missing | Play-test hook, scene jump, level editor | Upgrade the kit. |
| `kit.outdated` | warn | `kitVersion` is older than the kit Studio ships | Level editor, scene jump | Upgrade the kit on a branch. |
| `kit.hook-missing` | warn | `window.__midnite` is never installed | Play-test, state read-back, scene jump | Call `installHook` from the entry module. |
| `levels.none` | info | The game has no `levels/*.tmj` | Level editor | Move hard-coded layouts into `levels/<scene>.tmj` (agent work; see the skill's Levels section). |
| `levels.not-declared` | warn | `levels/*.tmj` exist but `manifest.levels` is absent | Level editor | Declare `levels: { dir: "levels", start: "<scene>" }`. |
| `levels.start-missing` | warn | `manifest.levels.start` names a scene with no `.tmj` | Level editor, scene jump | Point `start` at an existing scene, or add the file. |
| `levels.invalid` | warn | A `.tmj` file does not parse as a level | Level editor | Repair the level file named by the finding. |
| `assets.unlisted` | info | A file under `assets/` is not in `manifest.assets` | Asset resync, provenance | Resync the assets so each file is listed with its `sha256`. |
| `assets.missing-file` | warn | A listed asset has no file on disk | Asset resync, Run | Restore the file or remove the manifest entry. |
| `assets.hash-mismatch` | warn | A listed asset's file differs from its `sha256` | Asset resync | Resync the assets to record the current hash. |
