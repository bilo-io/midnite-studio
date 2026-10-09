---
name: midnite-media-game-fighter
description: Recipe for a 3D fighting game (Tekken style) in a Midnite Studio game repo — frame data with startup, active and recovery, hit and hurt boxes, hit levels, blocking, combo scaling, rounds and a CPU opponent, with kit tuning numbers and a play-test checklist. Use when extending the fighter starter.
---

# Genre recipe — fighter (3D)

Starter id `fighter@third-person` only; a fighter is a side-on versus game, so first person is refused by the gallery. Read `midnite-media-game-build` first. The camera is the versus camera (`versusCamera(a, b)` in `kit/core/cameras.js`).

## Where things live

All in `kit/core/genre/fighter/`, engine-free and replayable:

- `frame-data.js`: `FIGHTER_FPS`, `MOVES`, `moveTotal`, `movePhase(move, frame)`, `stunFrames(move, frame, blocked)`, `inCancelWindow`, `matchMove(moves, direction, button)`, `moveByName`, `scaleDamage(damage, hitIndex)`.
- `hitboxes.js`: `hurtbox(body)`, `hitbox(attacker, move)`, `overlaps`, `resolveHit(level, defender)`; a hit is a sphere in front of the attacker at the height its level (`high`, `mid`, `low`) names.
- `rounds.js`: `ROUND_DEFAULTS`, `createMatch`, `matchReducer(m, event)` (events `tick` and `damage`).
- `cpu.js`: `CPU_LEVELS` (`easy`, `normal`, `hard`), `cpuDecide(view, random, level)`.
- `src/genre/model.js` holds the fighter state and the scene wiring is in `src/genre/index.js` and `src/scenes/level.js`.

## Tuning (kit defaults)

Frame data runs at `FIGHTER_FPS = 60`. A move is `startup`, `active` and `recovery` frames; the total is `startup - 1 + active + recovery`. Jab: `startup = 10`, `active = 3`, `recovery = 15`, `damage = 7`, `onHit = 8`, `onBlock = 1`. Mid kick: `startup = 15`, `recovery = 24`, `onBlock = -9`. Uppercut: `startup = 15`, `onBlock = -14`, a launcher.

Rule of thumb: faster moves are safer on block (jab `onBlock = 1`), slower moves hit harder and are punishable (a move at `-10` or worse can be punished by a 10-frame jab). Lows are slower than highs of equal damage.

Boxes: `HURT_RADIUS = 0.35`, `STAND_HEIGHT = 1.8`, `CROUCH_HEIGHT = 1.1`, `HIT_RADIUS = 0.3`. Level heights: `high = 1.55`, `mid = 1.05`, `low = 0.3`, so crouching ducks a high.

Combo scaling: the first hit is whole, each later one is 10% weaker and never below 30%.

Match: `roundsToWin = 2`, `roundSeconds = 60`, `maxHp = 170`, `introSeconds = 1.5`, `outroSeconds = 2.5`. A timeout goes to the fighter with more health; equal health is a draw round.

CPU: `CPU_RANGE = 1.35`; `easy` guards `guard = 0.25`, `normal` `guard = 0.55`, `hard` `guard = 0.85`.

## Build order

1. Two fighters on a line; facing each other; walk, crouch, jump.
2. `MOVES` through `matchMove` from direction plus button; advance move frames at a fixed 60 Hz step, not by wall time.
3. Hit detection with `hitbox` and `hurtbox` on active frames only; `resolveHit` for blocking by level.
4. Stun from `stunFrames`, then combos with `inCancelWindow` and `scaleDamage`.
5. `matchReducer` for rounds, the timer and the end screen; the CPU through `cpuDecide`.

## Play-test checklist

- `$.player.health` is the first fighter's hp; `$.fighter` holds `round`, `phase`, `timer`, `hp`, `wins`, `winner`, `distance`, and `p1` and `cpu` each with `move` (`name:phase`), `stun`, `airborne`, `down`, `guarding`, `crouching`, `combo`.
- Throw a jab and read the move phase: startup for 9 frames, active for 3, then recovery, then idle.
- A jab on a guarding defender is blocked and the attacker is at `onBlock` advantage; on an open defender it hits for 7.
- A high move whiffs on a crouching defender.
- Chain jab into the next string inside the cancel window; press outside it and the extra input is dropped.
- Take hp to 0: the round ends, wins increment, a new round starts; at 2 wins the match is over.

## Game feel

The fight is frame-counted, so hit-stop and slow motion are applied in `src/scenes/level.js` by feeding the genre fewer or no 1/60 steps (`simSteps`), never by scaling its dt. `src/genre/moments.js` maps a landed blow to `hit-light`, `hit-heavy` or `launcher` (`classifyHit`), a block to `guard`, and the KO to a slow-motion `ko`; the combo counter pops through `comboTier`. A new move needs no code: its damage and `launcher` flag pick the moment. `?juice=off` silences it.

Sky and sound (kit v0.11.0): the dojo is lit by `createEnvironment({ preset: 'dusk', ... })` (the lantern posts stay the warm light); add no lights or `scene.background` beside it. `combo-hit` is the kit's rising tick for each connected hit and the launcher adds `critical`. `fx.ambience('ambience-crowd', ...)` keeps a crowd murmur under the fight; it follows the juice volume and stops with the loop (`fx.shutdown()`).
