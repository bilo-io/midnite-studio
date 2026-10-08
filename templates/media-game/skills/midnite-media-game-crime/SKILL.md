---
name: midnite-media-game-crime
description: Recipe for a 2D top-down crime game (original GTA style) in a Midnite Studio game repo — on-foot and car movement, a wanted level with decay, police pursuit, pedestrians and a city grid, with kit tuning numbers and a play-test checklist. Use when extending the crime starter. The genre id is crime.
---

# Genre recipe — top-down crime

Starter id `crime@top-down` (the genre id is `crime`, which is also the folder name under `kit/core/genre/`). Read `midnite-media-game-build` first.

## Where things live

- `kit/core/genre/crime/car2d.js`: `CAR_DEFAULTS`, `createCar`, `car2dStep(state, input, dt, tune)`, `carSpeed`. Arcade steering with grip and drag.
- `kit/core/genre/crime/wanted.js`: `MAX_WANTED`, `DECAY_MS`, `CRIME_HEAT`, `createWanted`, `wantedReducer(state, event)`, `pursuit(level)`. The state is plain JSON; events are `crime`, `tick` and `clear`. The 3D open world imports this same file.
- `kit/core/tiled-objects.js`: `tiledObjects`, `collisionGrid`, for a map authored in Tiled.
- Routing for police and pedestrians reuses `kit/core/genre/rts/astar.js` (declared in `genre.json`).
- `src/genre/city.js`: the city grid (`COLS`, `ROWS`, `TILE`, `cityMap`, `isRoad`); `src/genre/index.js` wires it up.

## Tuning (kit defaults)

Car: `accel = 260`, `brake = 420`, `maxSpeed = 320`, `maxReverse = 110`, `turnRate = 2.6`, `drag = 0.9`, `grip = 6` (px and seconds). A car at full speed is well above the on-foot `speed` of 180 in the top-down preset.

Wanted: `MAX_WANTED = 5`, `DECAY_MS = 30000` (one level off per 30 s unseen). Crime heat: `pedestrian = 1`, `vehicle = 1`, `police = 2`, `shooting = 1`. `pursuit(level)` sends `min(4, level)` cars at `150 + level * 25` px/s, so police at level one are slower than a player on foot and a car at full speed outruns every level.

## Game feel

`fx.tint('dusk')` and `fx.ambience('ambience-crowd')` set the city's light and murmur. The pistol is `gunshot-pistol`. Getting in a car starts `fx.loop('engine-loop')`; each frame `engine.set({ pitch, volume })` follows speed, and `stopEngine()` ends it on exit, car swap and death. Add any new loop the same way so it is stopped on every path out.

## Build order

1. City grid and collision; the player on foot with the top-down preset.
2. Enter and exit a car (`E`), `car2dStep` while driving.
3. Pedestrians wandering along roads.
4. Crimes feed `wantedReducer`; a `tick` event each step with whether police can see the player.
5. Police spawn per `pursuit(level)` and route to the player.
6. Missions or score on top.

## Play-test checklist

- `$.crime.wanted`, `unseenMs`, `inCar`, `speed`, `police`, `pedestrians`, `killed`, `cars`.
- Hit a pedestrian: `wanted` rises by `CRIME_HEAT.pedestrian` and never past `MAX_WANTED`.
- Stay unseen for `DECAY_MS`: `wanted` falls by one. Be seen: `unseenMs` resets to 0.
- Enter a car: `inCar` true and `speed` rises with throttle; brake to 0 and reverse is slower.
- At wanted 0 no police; at wanted 3, three cars.
- Drive into a building: the car stops, no tunnelling at full speed.
