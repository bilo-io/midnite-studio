---
name: midnite-media-game-fps
description: Recipe for a 2D first-person shooter (Doom-style raycaster) in a Midnite Studio game repo — weapon table, ammo, line of sight, doors and keys, with the kit's tuning numbers and a play-test checklist. Use when extending the FPS starter or building a raycaster shooter.
---

# Genre recipe — FPS (2D raycaster)

Starter id `fps@raycaster`. Read `midnite-media-game-build` first for the repo layout and play-test loop.

## Where things live

- `kit/core/raycast.js`: `castRay`, `castRays`, `projectSprite`. Walls, doors and sprite projection; no engine.
- `kit/core/genre/fps/weapon-table.js`: `WEAPONS`, `AMMO_CAP`, `createLoadout`, `fire`, `switchWeapon`, `addAmmo`, `grantWeapon`. `fire(loadout, now, rng)` returns what the shot did; the scene only spawns the effect.
- `kit/core/genre/fps/sight.js`: `hasLineOfSight(map, from, to, isSolid)`, `canSee(enemy, target, map)`. Enemies wake on sight, not by distance.
- `kit/core/preset-defaults.js`: the raycaster preset.
- `src/genre/index.js` wires them; `src/genre/levels.js` holds the map, objects and wall grid.

## Tuning (kit defaults)

Raycaster preset: `fovDeg = 66`, `moveSpeed = 3` cells/s, `turnSpeed = 2.6` rad/s, `radius = 0.2` cells, `doorOpenMs = 600`.

Weapons are data. Pistol: `damage = 10`, `cooldownMs = 350`, `range = 20`. Shotgun: `pellets = 6`, `spreadDeg = 9`, `cooldownMs = 900`. Rocket: `damage = 60`, `cooldownMs = 1100`, `speed = 7`.

Ammo caps: `bullets = 99`, `shells = 30`, `rockets = 12`.

A new weapon is a row in the table with a `kind` of `hitscan` or `projectile`; do not special-case it in the scene. Keep cooldown above ~300 ms for a hitscan weapon or it outclasses everything.

## Build order

1. Map and wall grid in `levels.js`, doors as the preset's `doorCell` value.
2. Player movement and strafing from the preset; check wall collision at `radius`.
3. Weapons through `fire`; hit resolution with `castRay` along the shot direction.
4. Enemies: idle until `canSee`, then chase and attack on a cooldown.
5. Pickups (`addAmmo`, `grantWeapon`), keys and locked doors, a goal.

## Play-test checklist

- `game_state` shows `$.fps.weapon`, `ammo`, `keys`, `enemies`, `awake`, `kills`; confirm each moves when it should.
- Hold `forward` for 60 frames: `$.player.position` changes and does not pass a wall.
- Fire with ammo at zero: ammo stays 0 and nothing spawns.
- An enemy behind a wall stays asleep (`awake` unchanged); step into its view and it wakes.
- A locked door opens only with its key.
- Switch weapons (`ONE`, `TWO`, `THREE`, `Q`) and check cooldowns restart per weapon.
