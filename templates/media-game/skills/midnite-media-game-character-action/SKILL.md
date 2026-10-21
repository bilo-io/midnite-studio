---
name: midnite-media-game-character-action
description: Recipe for a 3D character-action game (Devil May Cry style) in a Midnite Studio game repo — combo strings with cancel windows, launchers and air combos, a D-to-SSS style meter, lock-on and arena waves, with kit tuning numbers and a play-test checklist. Use when extending the character-action starter.
---

# Genre recipe — character action (3D)

Starter id `character-action@third-person`. Read `midnite-media-game-build` first. The starter ships its own `src/scenes/level.js` (an arena).

## Where things live

All in `kit/core/genre/character-action/`, engine-free:

- `combos.js`: `COMBO_MOVES`, `OPENERS` (ground and air), `comboStep(state, input, frame, options)`, `comboNow`, `comboMove`, `comboPhase`, `inCancel`, `moveTotal`, `createComboState`. One call per frame, returns `{ state, started, chained, dropped }`.
- `style.js`: `STYLE_RANKS`, `STYLE_THRESHOLDS`, `STYLE_MAX`, `STYLE_DECAY`, `createStyle`, `styleHit`, `styleDamaged`, `styleTick`, `styleRank`, `rankFill`.
- `waves.js`: `arenaReducer(state, waves, event)` (events `enter` and `tick`), `createArena`, `arenaSealed`, `ringSpawns`, `WAVE_BEAT`.
- Lock-on: `chooseLockTarget` in `kit/core/cameras.js`. The genre's `intent(wish, dt, frame)` reshapes movement (lunges, rooted attacks, facing the target).
- `src/genre/index.js` wires them.

## Tuning (kit defaults)

Frames at 60 per second; a move is `startup`, `active` and `recovery`, the total being `startup - 1 + active + recovery`. Ground string: `slash-1` `startup = 6`, `active = 3`, `recovery = 14`, `damage = 8`; the finisher `damage = 22`. Light moves chain, heavy `cleave` (`damage = 20`) branches, `launcher` (`damage = 10`) opens the air string, and `slam` (`damage = 18`) ends it.

The cancel window is inclusive on both ends and a press outside it is dropped, not buffered. Keep the window in recovery, from roughly the end of active to near the end, so a string feels like rhythm rather than mashing. A move with `cancel: [0, -1]` can never be cancelled.

Style: ranks D, C, B, A, S, SS, SSS start at `STYLE_THRESHOLDS` (0, 100, 220, 360, 520, 700, 900), the meter caps at `STYLE_MAX = 1000`, and drain per second rises with rank (`STYLE_DECAY` from 10 to 70). Repeating the same move within the last four costs a third of its value each repeat, so variety is what climbs.

Arena: `WAVE_BEAT = 1.5` seconds between waves; the arena is sealed while fighting or between waves.

## Build order

1. Movement and jump from the third-person base; lock-on.
2. `comboStep` driven by light, heavy and launch buttons; a hit during `active` frames only.
3. The air state: openers differ in the air, the launcher lifts the target.
4. Style: `styleHit` on each connect, `styleDamaged` when hit, `styleTick` each step; show rank.
5. The arena with `arenaReducer`, waves from `ringSpawns`.

## Play-test checklist

- `$.action.move`, `phase`, `chain`, `air`, `style`, `styleScore`, `arena`, `wave`.
- Press `J` three times at the right moments: `chain` reaches 3 and the finisher follows.
- Press inside the cancel window to chain; outside it, `move` does not change.
- Launch (`L`) then light in the air: the air string starts and `air` is true.
- Repeat one move: the style gain drops each time; vary moves and it climbs.
- Take a hit: the rank drops. Stand still: the score drains.
- Enter the arena: `arena` is `fighting`, then `between`, then the next wave, and finally `cleared`.

## Game feel

`src/genre/moments.js` maps every move to a slash arc (`ARCS`, one entry per `COMBO_MOVES` name: a new move needs one), a landed hit to `hit-light`, `hit-heavy`, `launcher`, `juggle` or `slam` (`hitMoment`), and style rank changes to a pop (`rankCall`). The level hands the genre its own frame counter that stops during a hit-stop, so a combo's active window is never skipped. Dash afterimages appear above 5.2 m/s. `?juice=off` silences it.

Sky and sound (kit v0.11.0): the arena sits under `createEnvironment({ preset: 'dusk', ... })` with `env.follow` each frame (no lights or `scene.background` beside it). The `dash` moment plays the kit's `dash`, and `hit-light` and `juggle` add `combo-hit` (the juggle's pitch rises with the chain). `fx.ambience('ambience-crowd', ...)` is a distant arena crowd; it follows the juice volume and stops with the loop (`fx.shutdown()`).
