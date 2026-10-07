---
name: midnite-media-game-build
description: Orient an agent in a Midnite Studio game repo — manifest, kit, the window.__midnite debug hook, the play-test loop through the game_* tools on the midnite MCP server, and the rules for editing. Use when working in a folder that holds a midnite-game.json, or when asked to build, extend or fix a game made in Media ▸ Games.
---

# Media ▸ Games — build

A game repo is the game: plain ES modules, no bundler, no build step. Midnite Studio serves it in a sandbox and reads two things back: what the game prints with `console.log`, and what `window.__midnite.getState()` returns.

## Layout

```
midnite-game.json    the manifest (read it first; add keys, never remove them)
index.html           import map + <canvas id="game"> + src/main.js
src/                 YOURS: scenes, genre module, data, game.config.js
kit/core/            engine-free systems (rng, input-map, cameras, jump, raycast, ...)
kit/core/genre/<g>/  the genre's engine-free systems (only the genre this game uses)
kit/phaser/ | kit/three/   the one engine's kit (2D games get phaser, 3D get three)
vendor/              the engine, vendored at creation. Never edit it.
playtests/*.json     scripted runs (frame-indexed input plus assertions)
assets/              imported assets; assets/index.json is the lookup
```

`src/game.config.js` holds `{ perspective, genre, cameras }`. `src/genre/index.js` exports `installGenre(scene, ctx)` and returns `{ update, state, intent? }`; the base calls it once the level exists, calls `update` each step and merges `state()` into the hook's state. A game with no genre has a stub that does nothing.

## Manifest

`game_get_manifest` returns it with validation issues; `game_set_manifest` patches it. Keys: `version`, `name`, `engine` (`phaser` for 2D, `three` for 3D), `dimension`, `perspective`, `genre`, `starter`, `cameraPresets`, `entry`, `kitVersion`, `vendored`, `assets`, `network` (`off` or `on`), `deterministic`, `keepSaveData`.

## The debug hook

The kit's `boot()` (phaser) and `startLoop()` (three) install `window.__midnite` through `installHook` in `kit/core/hook.js`, and print `midnite-ready` once. The shape is `version`, `kitVersion`, `getState()`, `pause()`, `resume()`, `step(n)`, `setSeed(seed)`, `setOverlay(on)`, `input.gamepad(button, pressed)`.

`getState()` must return plain JSON with at least `{ version: 1, scene, frame, time }`. Add `player: { position, health? }` and `score` when the game has them, and put genre numbers under one key (`rts`, `fps`, `souls`, `action`, `crime`, `openWorld` and so on). Keep it truthful: report what the game really holds, never a constant that happens to pass an assertion.

## The play-test loop

Run → look → read → act → read state → fix. Use the tools on the midnite MCP server:

1. `game_run` starts it; `game_reload` after an edit; `game_stop` when done.
2. `game_screenshot` to look (`count` and `intervalMs` give a short sequence).
3. `game_logs` for `console.log` output and uncaught errors; pass `since` with the last `next` to read only new lines.
4. `game_input` sends timed events: `keyDown`/`keyUp` with kit key names (`W`, `SPACE`, `SHIFT`, `ESC`, `UP`), `mouseMove`/`mouseDown`/`mouseUp`, or `gamepad` buttons.
5. `game_state` returns `getState()`. Prove a change with numbers (position moved, ammo fell, wanted level rose), not only a picture.

Fix, reload, repeat. When a bug is fixed, add a `playtests/<name>.json` that would have caught it. The format the starters ship is `{ version, name, seed, frames, input: [{ frame, action, pressed }], assert: [{ frame, path, equals | increasedFromFrame }] }`; read a starter's `playtests/smoke.json` and copy it.

## Assets

`kit/core/asset-index.js` exports `createAssetIndex(json)` over `assets/index.json` (`{ version: 1, assets: [{ kind, name, path, files? }] }`). Its `get(kind, name)`, `list(kind)` and `url(kind, name, file?)` are the only way to find an asset. Never hard-code a path to a file under `assets/`: web export rewrites assets through the index. Each starter's `ASSETS.md` lists the placeholder art it ships and where it came from; keep it current when you add art.

## Rules

- Extend the kit, do not rewrite it. If a system you need exists under `kit/core/genre/`, import it; if it is nearly right, wrap it in `src/`.
- Never edit `vendor/`. A kit upgrade replaces `kit/` wholesale on its own branch, so a change to a kit file is lost unless it is made in `src/`.
- Keep `getState()` truthful and keep the game runnable after every change; commit logical steps.
- No network calls in `src/` unless `network` is `on` in the manifest. The sandbox blocks them otherwise.
- No bundler, no `package.json` build step, no npm imports. Imports resolve through the import map in `index.html` (`phaser`, `three`, `three/addons/`, `@dimforge/rapier3d-compat`, `recast-navigation`, `kit/`).
- Randomness goes through `kit/core/rng.js` (`rng`, `createRng(seed)`), never `Math.random`, so a seed replays.
- For a genre, load its recipe skill: `midnite-media-game-<genre>` (`fps`, `rts`, `arpg`, `crime`, `shooter`, `fighter`, `soulslike`, `rpg`, `character-action`, `open-world`).
