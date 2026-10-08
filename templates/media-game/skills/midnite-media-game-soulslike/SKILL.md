---
name: midnite-media-game-soulslike
description: Recipe for a 3D soulslike in a Midnite Studio game repo — a stamina budget, dodge roll with invulnerability frames, lock-on, telegraphed boss attacks in phases, and resting that resets the world, with kit tuning numbers and a play-test checklist. Use when extending the soulslike starter.
---

# Genre recipe — soulslike (3D)

Starter ids `soulslike@third-person` and `soulslike@first-person`. Read `midnite-media-game-build` first. Enemies path over a navmesh (`needsNav('soulslike')`).

## Where things live

- `kit/core/genre/soulslike/stamina.js`: `STAMINA`, `createStamina`, `canAct`, `spendStamina(s, action)`, `tickStamina(s, dt)`, `rollInvulnerable(t)`.
- `kit/core/genre/soulslike/boss.js`: `BOSS_PHASE_THRESHOLDS`, `bossPhase(hpFraction)`, `BOSS_ATTACKS`, `bossSpeed`, `bossChooseAttack(phase, distance, random)`, `bossAttackPhase(attack, t, phase)`.
- Lock-on: `chooseLockTarget(player, forward, candidates, maxDist, maxAngleDeg)` in `kit/core/cameras.js`, and the rig's `lockTarget`. Bound to `Q` or the right mouse button.
- `src/genre/index.js` wires hollows (regular enemies), the boss and the rest point.

## Tuning (kit defaults)

Stamina: `max = 100`, `regenPerS = 25`, `regenDelayS = 0.8`; costs `roll = 20`, `light = 15`, `heavy = 30`. Regeneration only starts after the delay, so spending resets the clock. A roll lasts `rollSeconds = 0.6` and is invulnerable from 0.1 s to 0.4 s in.

Feel: a player should afford about five rolls from full stamina and about three heavy attacks; if you raise a cost, make sure a full bar still allows a roll after one light attack (`15 + 20` is under `max`).

Boss: phases at 66% and 33% health (`BOSS_PHASE_THRESHOLDS`), with timings divided by `bossSpeed`: 1 in phase one, 1.2 in phase two, 1.4 in phase three. Attacks are telegraphed: swipe `windup = 0.7`, `damage = 18`; overhead `windup = 1.1`, `damage = 32`; nova `windup = 1.4`, `damage = 40`. The harder the hit, the longer the windup and recovery.

## Build order

1. Third-person base, camera and lock-on.
2. Stamina gating every action: an action with no stamina left does not start.
3. Roll with its invulnerability window.
4. Hollows with a windup attack the player can read and dodge.
5. The boss: phase from health, choose an attack with `bossChooseAttack`, play it through `bossAttackPhase`.
6. The bonfire (`E` to rest): resting heals the player and brings the enemies back; dying returns the player to it.

## Play-test checklist

- `$.souls.stamina`, `action`, `invulnerable`, `locked`, `deaths`, `rests`, `hollows`, `boss.hp`, `boss.phase`, `boss.attack`.
- Roll: stamina falls by the roll cost; `invulnerable` is true only inside the window; stamina refills after the regeneration delay, not before.
- At stamina 0 an attack does not start.
- A hit during the invulnerable window does no damage; one outside it does.
- Reduce boss hp below 66%: `boss.phase` becomes 2 and its attacks speed up; below 33%, phase 3.
- Die: `deaths` increments and the player returns to the bonfire; resting (`E`) increments `rests`, heals, and respawns the hollows.

## Game feel

`src/genre/moments.js` holds the heavy, low-pitched moments (`hit-heavy`, `stagger`, `roll`, `parry`, `bonfire-rest`, `you-died`, `stamina-out`). A roll whose invulnerable frames swallow an attack plays `parry`. Dying starts the `YOU DIED` curtain (`src/genre/curtain.js`); the player is set down at the bonfire behind the black screen (`dead` is true until then, in `getState().souls.dead`). The bonfire flicker is `flicker(clock)`, so it replays exactly. `?juice=off` silences it.
