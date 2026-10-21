---
name: midnite-media-game-open-world
description: Recipe for a 3D open world (GTA style) in a Midnite Studio game repo — a terrain pack from Media ▸ Terrain, road routing and traffic, vehicles with enter and exit, a wanted level and police, a day and night cycle and a minimap, with kit tuning numbers and a play-test checklist. Use when extending the open-world starter.
---

# Genre recipe — open world (3D)

Starter ids `open-world@third-person` and `open-world@first-person`. Read `midnite-media-game-build` first, and `midnite-media-terrain-build` to make a bigger world. Enemies and police path over a navmesh (`needsNav('open-world')`). The starter ships its own `src/scenes/level.js`.

## Where things live

- The world is a terrain pack in `assets/terrain/<name>.terrain/`, named in `assets/index.json` as `terrain/world`. `kit/three/terrain.js` loads it (`loadTerrain(manifestUrl)`, `buildRoads`, `buildBuildings`, `heightfieldMesh`, `drapeUvs`); `kit/core/terrain-manifest.js`, `heightfield.js`, `lod.js` and `png16.js` are its engine-free parts. The pack's `roads.json` is the road graph.
- `kit/core/genre/open-world/route.js`: `routeOnRoads(roads, from, to)` (Dijkstra by `lengthM`; null when not connected), `nearestNode`, `routePolyline`, `pointAlong`, `polylineLength`.
- `traffic.js`: `TRAFFIC_DEFAULTS`, `trafficSpawn(edges, density, rng)`, `trafficStep(agent, roads, dt, rng)`, `indexRoads`, `agentPose`. Agents turn at junctions and U-turn at dead ends.
- `daynight.js`: `hourAt`, `skyAt(hour)`, `isNight`, `clockText`, `SUNRISE`, `SUNSET`.
- `minimap.js`: `minimapPixels(classes, size, legend, out)`, `worldToMinimap`, `hexRgb`.
- Vehicles: `kit/core/vehicle.js` (`wheelLayout`, `findEnterable`, `driveControls`) and `kit/three/vehicle.js` (`createVehicle`); `kit/core/three-defaults.js` has `VEHICLE_DEFAULTS`.
- The wanted level is the crime genre's `kit/core/genre/crime/wanted.js` (declared in `genre.json`).
- `src/genre/index.js` wires them.

## Tuning (kit defaults)

Day: `SUNRISE = 6`, `SUNSET = 19`; the starter's day is `DAY_SECONDS = 240` seconds long and starts at hour 9.

Traffic per kilometre of road: cars `perKm = 6`, pedestrians `perKm = 10`; cars drive 8 to 14 m/s, pedestrians 1.1 to 1.6 m/s.

Vehicle: `engineForce = 3000` (Rapier applies it as a raw impulse, so it has to carry a 1200 kg chassis), `brakeForce = 40`, `maxSteerDeg = 32`, `enterDistance = 2.5` metres. The wanted level behaves as in the crime genre: `MAX_WANTED = 5`, `DECAY_MS = 30000`.

Keep the world size and road density together: a car crosses a 512 m world in under a minute, which is about right for a starter.

## Build order

1. `loadTerrain` for the ground, roads and buildings; place the player on the heightfield.
2. A car with enter and exit (`findEnterable`); cameras follow the car.
3. Traffic and pedestrians from `trafficSpawn`, advanced by `trafficStep`.
4. Wanted level fed by crimes; police routed with `routeOnRoads` and `routePolyline`.
5. Day and night: `hourAt`, then `env.setTimeOfDay(hour)` on the kit's `createEnvironment` (`src/scenes/level.js`; `skyAt` still gives the `night` flag for street lights and the HUD). Rain greys the sky, fog and sun after the call. Sound (kit v0.11.0): `sfx.loop('engine-loop')` while driving with `.set(engineLoopParams(speed, throttle))` for pitch and level, and an `ambience-wind` bed; both stop with the loop.
6. A minimap from the land-cover classes.

## Play-test checklist

- `$.openWorld.terrain`, `roads`, `junctions`, `hour`, `night`, `traffic`, `pedestrians`, `wanted`, `police`.
- The terrain name matches the asset named in `assets/index.json`; `roads.nodes` and `edges` are non-zero.
- Walk to a car and enter it; drive along a road and the car follows the ground (no sinking, no flying).
- Step the clock past `SUNSET`: `night` flips to true; past `SUNRISE`, false.
- Traffic count stays near the density times the road length and does not fall to 0 after a few minutes.
- Commit a crime: `wanted` rises and police appear, routed along the roads.
- With a different seed the traffic differs; with the same seed it repeats.
