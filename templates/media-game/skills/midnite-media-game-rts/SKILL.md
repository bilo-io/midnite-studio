---
name: midnite-media-game-rts
description: Recipe for a 2D real-time strategy game (StarCraft-style) in a Midnite Studio game repo — economy and supply, A* and flow-field movement, selection, fog of war and a scripted opponent, with kit tuning numbers and a play-test checklist. Use when extending the RTS starter or building any command-and-control game.
---

# Genre recipe — RTS

Starter ids `rts@top-down` and `rts@isometric`. Read `midnite-media-game-build` first.

## Where things live

All in `kit/core/genre/rts/`, engine-free and deterministic:

- `economy.js`: `UNIT_TYPES`, `GATHER_PER_TRIP`, `createEconomy`, `deposit`, `queueUnit`, `tickEconomy(state, dt)`.
- `astar.js`: `astar(grid, from, to)` on an 8-neighbour grid with octile cost; `walkable`, `pathCost`. A grid cell of `0` is walkable.
- `flow-field.js`: `flowField(grid, goal)` for many units heading to one point; use A* for a single unit.
- `selection.js`: `selectInBox`, `selectAt`, `createControlGroups`.
- `fog.js`: `FOG` (hidden, explored, visible), `createVisibility`, `fogUpdate`, `visibleCount`.
- `ai.js`: `AI_SCRIPT`, `createAi`, `aiStep(ai, view, rules)` returns `train` and `attack` commands. It uses no randomness, so a replay plays the same match.

`src/genre/index.js` wires them to `createWorld2d` (`kit/phaser/world2d.js`), which owns the tile/iso projection.

## Tuning (kit defaults)

Units: worker `cost = 50`, `buildMs = 4000`, `supply = 1`; soldier `cost = 100`, `buildMs = 6000`, `supply = 2`. A gather trip carries `GATHER_PER_TRIP = 8`. A fresh economy starts with `minerals = 200` and `supplyCap = 10`.

Scripted opponent: a wave of 3 soldiers every 30 s (`createAi(waveSize = 3, waveEveryMs = 30000)`).

Supply curve rule of thumb: the first soldier must be affordable within a minute of play, and the cap must bind (a depot or HQ upgrade) before about eight units, otherwise supply never matters.

## Game feel

`fx.tint('day')` sets the Light2D ambient from a kit sky preset (or an hour, swept per frame), and `fx.ambience('ambience-wind')` is the one background bed (replacing the base's). Blows landed within 0.9 s build a combo: `combo-hit` from the second, every fourth is a `critical` that bites for half again; destroying the enemy HQ plays `quest-complete`. There are no upgrades yet, so no `level-up`; add the trigger where one lands.

## Build order

1. Grid and terrain; walkable test for every cell.
2. Units that move by `astar` path, then switch groups to `flowField`.
3. Selection (box and click) and commands on right click.
4. Economy: gather, deposit, queue, produce; supply gating in `queueUnit`.
5. Fog of war over the map with `fogUpdate`.
6. The opponent with `aiStep`, then a win and lose condition.

## Play-test checklist

- `$.rts.minerals`, `supply`, `queue`, `selected`, `units`, `workers` track what you did.
- Train a worker (`Q`): minerals drop by its cost at once, a unit appears after `buildMs`, supply used rises.
- Train past the supply cap: the order is refused and minerals are not spent.
- Order a unit through a wall gap and around an obstacle; it arrives.
- Fog: visible cell count rises as units move out and explored cells stay explored.
- Let the clock run: the first AI wave arrives on schedule and the same seed repeats it.
