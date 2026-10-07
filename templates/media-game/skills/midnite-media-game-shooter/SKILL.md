---
name: midnite-media-game-shooter
description: Recipe for a 3D third-person shooter in a Midnite Studio game repo — weapon table with magazines and reloads, spread and recoil, cover points and line of sight, over-the-shoulder cameras, with kit tuning numbers and a play-test checklist. Use when extending the shooter starter or building any gun-driven 3D game.
---

# Genre recipe — shooter (3D)

Starter ids `shooter@third-person` and `shooter@first-person`. Read `midnite-media-game-build` first. Enemies path over a navmesh (`needsNav('shooter')` is true in `kit/core/nav-policy.js`; `kit/three/nav.js` builds it).

## Where things live

- `kit/core/genre/shooter/weapons.js`: `SHOOTER_WEAPONS`, `createArsenal`, `currentWeapon`, `tickArsenal(a, dtMs)`, `tryFire`, `startReload`, `switchTo`, `addReserve`, `cooldownMs`. State is plain JSON.
- `kit/core/genre/shooter/spread.js`: `spreadCone(baseDeg, recoilDeg, moving)`, `spreadDirection(forward, coneDeg, random)`, `MAX_SPREAD_DEG`, `MOVING_SPREAD_SCALE`.
- `kit/core/genre/shooter/cover.js`: `hasLineOfSight`, `coverPointsAround(occluders)`, `pickCover(enemy, player, coverPoints, occluders)`, `segmentHitsRect`.
- `kit/core/cameras.js` and `kit/three/cameras.js`: the five third-person cameras (`over-shoulder-left`, `over-shoulder-right`, `behind`, `further-behind`, `much-further-behind`), `C` cycles them, `cameraPresets` in the manifest limits the cycle.
- `kit/three/character.js`, `physics.js`, `damage-numbers.js`, `hud.js` for the body, Rapier world, floating numbers and HUD.
- `src/genre/index.js` wires it. A genre may export an `intent(wish, dt, frame)` to reshape the base's movement step; the shooter does not need one.

## Tuning (kit defaults)

Fire rate is `rpm`; `cooldownMs(weapon) = 60000 / rpm`. Rifle: `damage = 14`, `rpm = 600`, `magazine = 30`, `reloadMs = 1800`, `spreadDeg = 0.8`. Pistol: `damage = 22`, `rpm = 300`, `magazine = 12`, `reloadMs = 1200`. Launcher: `damage = 70`, `rpm = 50`, `magazine = 1`, `reloadMs = 2200`, `speed = 22`, `splash = 3`.

Spread: `MAX_SPREAD_DEG = 12`, and moving doubles the base (`MOVING_SPREAD_SCALE = 2`). Rifle recoil adds `recoilDeg = 0.5` per shot up to `recoilMaxDeg = 5` and recovers at `recoilRecoverDegPerS = 10`.

Feel: reload at least a second for an automatic weapon, keep the first shot accurate (low base spread), and make sustained fire cost accuracy through recoil rather than through damage.

Pass the kit's seeded `() => rng.next()` to `spreadDirection`, so the same seed repeats a spray.

## Build order

1. Character and camera from the base; aim from the camera forward.
2. `createArsenal`, fire on the attack input, `tickArsenal` every step.
3. Hit resolution: a hitscan ray (`physics.castRay`, to stop at walls) along `spreadDirection`; projectiles for the launcher.
4. Enemies on the navmesh that take cover with `pickCover` and shoot only with `hasLineOfSight`.
5. A HUD for magazine and reserve (`hud.set`), ammo pickups through `addReserve` if the game wants them, a goal.

## Play-test checklist

- `$.shooter.weapon`, `mag`, `reserve`, `reloading`, `recoil`, `shots`, `hits`, `kills` and `$.player.health`.
- Fire one shot: `mag` drops by 1 and `shots` by 1. Empty the magazine, fire again: nothing fires; reload and `mag` refills from `reserve`.
- Hold fire: `recoil` rises and never past the weapon's `recoilMaxDeg`; release and it falls.
- Strafe while firing: the cone is wider than standing still.
- An enemy behind a wall does not hit you; step into view and it does.
- Cycle cameras with `C` and confirm aim still follows the crosshair.
