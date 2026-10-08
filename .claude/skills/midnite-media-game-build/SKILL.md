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
playtests/*.json     play-tests: a replay plus assertions (replays/, baselines/; results/ is git-ignored)
assets/              imported assets; assets/index.json is the lookup
```

`src/game.config.js` holds `{ perspective, genre, cameras }`. `src/genre/index.js` exports `installGenre(scene, ctx)` and returns `{ update, state, intent? }`; the base calls it once the level exists, calls `update` each step and merges `state()` into the hook's state. A game with no genre has a stub that does nothing.

## Manifest

`game_get_manifest` returns it with validation issues; `game_set_manifest` patches it. Keys: `version`, `name`, `engine` (`phaser` for 2D, `three` for 3D), `dimension`, `perspective`, `genre`, `starter`, `cameraPresets`, `entry`, `kitVersion`, `vendored`, `assets`, `network` (`off` or `on`), `deterministic`, `keepSaveData`.

## The debug hook

The kit's `boot()` (phaser) and `startLoop()` (three) install `window.__midnite` through `installHook` in `kit/core/hook.js`, and print `midnite-ready` once. The shape is `version`, `kitVersion`, `ready`, `deterministic`, `getState()`, `pause()`, `resume()`, `step(n)`, `setSeed(seed)`, `setOverlay(on)`, `input.gamepad(button, pressed)` and `replay` (`record()`, `stop()`, `load(replay)`, `seek(frame)`, `play(replay, { speed })`, `status()`), which the play-test tools drive.

`getState()` must return plain JSON with at least `{ version: 1, scene, frame, time }`. Add `player: { position, health? }` and `score` when the game has them, and put genre numbers under one key (`rts`, `fps`, `souls`, `action`, `crime`, `openWorld` and so on). Keep it truthful: report what the game really holds, never a constant that happens to pass an assertion.

## The play-test loop

Run → look → read → act → read state → fix. Use the tools on the midnite MCP server:

1. `game_run` starts it; `game_reload` after an edit; `game_stop` when done.
2. `game_screenshot` to look (`count` and `intervalMs` give a short sequence).
3. `game_logs` for `console.log` output and uncaught errors; pass `since` with the last `next` to read only new lines.
4. `game_input` sends timed events: `keyDown`/`keyUp` with kit key names (`W`, `SPACE`, `SHIFT`, `ESC`, `UP`), `mouseMove`/`mouseDown`/`mouseUp`, or `gamepad` buttons.
5. `game_state` returns `getState()`. Prove a change with numbers (position moved, ammo fell, wanted level rose), not only a picture.

Fix, reload, repeat. When a bug is fixed, add a `playtests/<name>.json` that would have caught it.

## Play-tests, replays and determinism

A play-test runs in **deterministic mode**: the kit replaces `Math.random` with a seeded generator and `performance.now`/`Date.now` with a virtual clock, and the loop takes exactly one 1/60 s step per frame. The same seed and the same input give the same `getState()` every run, on the same machine (physics engines are not bit-identical across machines). Set `deterministic: true` in the manifest to play that way all the time; a play-test forces it for its own run.

Input is replayed through the kit, frame by frame, never as OS key events. A replay is `{ version: 1, seed, frames, events: [{ f, action, down }] }`: `action` is a kit action name (`left`, `forward`, `jump`, `attack`, ...), and `f` counts steps since the game booted. A play-test starts paused after the first step, so an event at `f: 0` takes effect on step 2.

A play-test is `playtests/<name>.json` (the file name is its `name`):

```json
{
  "version": 1,
  "name": "smoke",
  "description": "Walk right for three seconds.",
  "replay": { "version": 1, "seed": 1, "frames": 180, "events": [{ "f": 0, "action": "right", "down": true }] },
  "asserts": [
    { "frame": 180, "kind": "state", "path": "$.scene", "op": "eq", "value": "level" },
    { "frame": 180, "kind": "state", "path": "$.player.position[0]", "op": "gt", "value": 300 },
    { "frame": 180, "kind": "frame", "tolerance": 0.01 }
  ]
}
```

- `replay` is inline, or a path such as `playtests/replays/walk.replay.json`.
- A `state` assertion reads a JSON path of `getState()` at `frame`: `$`, `.key`, `["key"]` and `[n]` only (no filters). `op` is `eq`, `ne`, `lt`, `gt`, `exists` or `approx` (with `epsilon`).
- A `frame` assertion compares the picture at `frame` with `playtests/baselines/<baseline or name>@<frame>.png`; a pixel differs when a channel moves by more than 16, and it passes while at most `tolerance` (default 0.01) of pixels differ. A missing baseline is written and reported as `baseline-created`; commit it.
- Every starter ships `playtests/smoke.json` in this format; copy it.

The tools:

1. `game_playtest` runs `playtests/*.json` (`name` for one, `playtest` inline, or neither for all) and answers pass/fail per assertion, with screenshots of failures; results go to `playtests/results/<name>.json`. The Games tab's **Playtests** menu runs the same thing.
2. `game_replay_record` with `action: "start"` restarts the game deterministically and records the user's play; `action: "stop", name` writes `playtests/replays/<name>.replay.json`.
3. `game_replay_play` restarts and plays a replay (`speed: "max"` or `1` to watch), answering the final state.
4. `game_assert_state` and `game_assert_frame` step the running game forward to a frame and check it there; a frame already passed is an error, so replay first.

## Assets

`assets/index.json` (`{ version: 1, assets: [{ name, kind, path, entry? }] }`) is the one lookup for assets; `kit/core/asset-index.js` reads it. `loadAssetIndex()` fetches it and `createAssetIndex(json)` wraps it: `assetUrl(name, file?)` is the URL to load by name alone (the asset's `entry` file, such as `terrain.manifest.json` or `atlas.json`, unless you name a `file`; `null` when the name is unknown), `url(kind, name, file?)`, `get(kind, name)`, `byName(name)` and `list(kind)` are the longer forms. Names are unique across kinds. Never hard-code a path under `assets/`: web export rewrites assets through the index.

Bring media in with `game_import_asset` (`{ game, source, name? }`), where `source` is `{ tab: 'terrain' | 'sprite' | 'model' | 'image' | 'audio', repoPath, path }` for an item in a repo's media or `{ packPath }` for a pack folder. It copies the files to `assets/<kind>/<name>/` (or `assets/<kind>/<name>.<ext>` for one file), records the source and a sha256 in the manifest's `assets`, registers it in the index and commits it as `assets: import <name>`. Never copy files into `assets/` by hand: a hand copy has no provenance and no index entry. If a source changes later, the Games tab offers a re-import as its own commit (`assets: re-import <names>`); an agent does not need to do that itself. Each starter's `ASSETS.md` lists the placeholder art it ships and where it came from; keep it current when you add art.

## Fidelity and juice kit

Procedural only: no image or audio files and no licences. Surfaces, normal and bump maps are generated in code from a seed, sound effects are synthesized with WebAudio, and every effect runs on the loop's `dt` and the kit rng (a dedicated stream, so it never disturbs gameplay randomness), so a play-test replays it exactly. Juice is **on by default**; `?juice=off` in the URL or `__midnite.juice.off()` silences all of it for pristine, deterministic screenshots.

**Settings** (`kit/core/juice-settings.js`): `createJuiceSettings({ gameName })` returns `{ get, set(patch), resolved(), off(), on(), reset(), subscribe(fn) }`, persisted in the save slot `juice-settings` and mirrored on `window.__midnite.juice`. Keys: `enabled`, `intensity` (0..2, the master), `shake`, `flash`, `particles`, `postfx` (booleans), `volume` (0..1), `reducedMotion` (`auto` | `on` | `off`; `auto` follows `prefers-reduced-motion`, which scales shake to 0.25 and flashes to 0.3 and turns post-processing off). Pass the store as `settings` to the modules below; they read `settings.resolved()` on every use.

**Textures** (`kit/core/procedural-textures.js`): `generateTextureData(kind, { seed, size, base, accent, normalStrength })` is pure and returns `{ height, albedo, normal, roughness, bump }` as RGBA bytes (normal maps are OpenGL: +Y up, what three and Phaser Light2D read); `generateCanvases(kind, opts)` wraps them in canvases. Kinds: `stone`, `brick`, `wood`, `metal`, `grass`, `dirt`, `tiles`; all tile seamlessly. Also `hash2`, `valueNoise`, `fbm`, `heightToNormal`.

**three.js**
- `kit/three/materials.js`: `createMaterials({ renderer? })` then `.get(kind, { seed, size, repeat: [u, v], tint, normalScale, bumpScale, roughness, metalness })` returns a cached `MeshStandardMaterial` with `map`, `normalMap`, `roughnessMap` and `bumpMap` (three uses the normal map where both exist; the bump map is the fallback). `repeatFor(width, height, tileMetres)` sizes `repeat`.
- `kit/three/juice.js`: `createJuice({ scene, camera, renderer, settings, sfx, postfx })`. In the loop's `update(realDt)` call `const dt = juice.update(realDt)` first (it returns dt scaled by hit-stop, 0 while frozen; simulate with it), and call `juice.applyCamera()` from the loop's `render` option, after the rig has moved the camera. Methods: `shake(trauma)`, `hitStop(ms)`, `slowMo(scale, seconds)`, `flash(object, { color, duration })`, `squash(object, [sx, sy])`, `tween(opts)`, `burst(kind, position, { dir, scale, count })` (`spark`, `dust`, `debris`, `muzzle`, `impact`), `text(position, amount, kind)` (reuses `damage-numbers.js`), `screenFlash(color, alpha)`, and `trigger(name, { object, position, strength, text })`, which does everything a named moment lists in `TRIGGERS` (`jump`, `land`, `footstep`, `hit`, `hurt`, `pickup`, `shoot`, `explosion`, `death`, `win`).
- `kit/three/postfx.js`: `createPostFx({ renderer, scene, camera, settings })` gives bloom, vignette, chromatic aberration on `hit(amount)`, ACES tone mapping and sRGB output; with `postfx` off it is a plain render. Wire it with `startLoop({ renderFrame: (dt) => fx.render(dt), onResize: (w, h) => fx.setSize(w, h) })`.
- `kit/three/audio.js`: `createAudio(camera).sfx` is the synth below, panned by camera pose for `play(name, { position })`.

**Phaser**
- `kit/phaser/juice.js`: `createJuice(scene, { settings, sfx, floorY })` with the same method names (`update(delta)` returns the sim scale, 0 in a hit-stop, and pauses Arcade physics while frozen; `shake`, `hitStop`, `screenFlash`, `flash(sprite)`, `squash(sprite, [sx, sy])`, `burst(kind, x, y)`, `text(x, y, text)`, `trigger(name, { target, x, y, strength })`). Particles are pooled images on the kit rng, not Phaser emitters, which a replay cannot reproduce.
- Lighting: `createLighting(scene, { ambient })` returns `{ add(x, y, { radius, color, intensity }), lit(object) }`; `litTexture(scene, key, kind, opts)` registers a procedural albedo plus its normal map, so a `lit()` sprite is shaded by Light2D. `applyPostFx(scene, settings)` adds a vignette and a soft bloom (WebGL only).
- `kit/phaser/audio.js`: `createAudio(scene).sfx` is the synth below.

**Sound** (`kit/core/sfx.js`): `createSfx({ context?, seed, maxVoices, volume })` returns `{ play(name, { volume, pitch, power, pan, position, variation }), unlock(), setVolume(v), setMuted(on) }`; the context unlocks on the first click or key, and a play before that is a no-op. Presets (`SFX_NAMES`): `jump`, `land`, `footstep`, `shoot`, `laser`, `hit`, `hurt`, `explosion`, `pickup`, `coin`, `powerup`, `ui-click`, `ui-hover`, `door`, `swing`, `block`, `parry`, `death`, `win`. `buildRecipe(name, { seed, pitch, power, variation })` is the pure, seeded recipe; `panFromPosition` is the spatial maths.

**Core helpers**: `kit/core/tween.js` (`EASE`, `createTweens()`), `kit/core/juice-core.js` (`createTrauma`, `createTimeScale`, `PARTICLE_PRESETS`, `spawnParticles`, `TRIGGERS`), and `extendHook(key, value)` in `kit/core/hook.js` to hang your own debug object on `window.__midnite` (the bases publish `__midnite.fx.trigger(name)` so a play-test can fire an effect).

Worked examples: `src/scenes/level.js` in the third-person (three) and platformer (Phaser) bases.

## Rules

- Extend the kit, do not rewrite it. If a system you need exists under `kit/core/genre/`, import it; if it is nearly right, wrap it in `src/`.
- Never edit `vendor/`. A kit upgrade replaces `kit/` wholesale on its own branch, so a change to a kit file is lost unless it is made in `src/`.
- Keep `getState()` truthful and keep the game runnable after every change; commit logical steps.
- No network calls in `src/` unless `network` is `on` in the manifest. The sandbox blocks them otherwise.
- No bundler, no `package.json` build step, no npm imports. Imports resolve through the import map in `index.html` (`phaser`, `three`, `three/addons/`, `@dimforge/rapier3d-compat`, `recast-navigation`, `kit/`).
- Randomness goes through `kit/core/rng.js` (`rng`, `createRng(seed)`), never `Math.random`, so a seed replays. Deterministic mode seeds `Math.random` too, but on its own stream, and only while the mode is on.
- Read input through the kit's input map (`createInput` in `kit/phaser/input.js` or `kit/three/input.js`), so replays can press your actions; a raw `keydown` listener is invisible to them.
- For a genre, load its recipe skill: `midnite-media-game-<genre>` (`fps`, `rts`, `arpg`, `crime`, `shooter`, `fighter`, `soulslike`, `rpg`, `character-action`, `open-world`).
