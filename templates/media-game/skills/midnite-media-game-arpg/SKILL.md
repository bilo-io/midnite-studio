---
name: midnite-media-game-arpg
description: Recipe for a 2D action RPG (Diablo-style) in a Midnite Studio game repo — click-to-move, a skills hotbar with mana and cooldowns, rarity-weighted loot, inventory and equipment, and a seeded procedural dungeon, with kit tuning numbers and a play-test checklist. Use when extending the ARPG starter.
---

# Genre recipe — ARPG

Starter ids `arpg@top-down` and `arpg@isometric`. Read `midnite-media-game-build` first.

## Where things live

- `kit/core/genre/arpg/dungeon.js`: `generateDungeon(seed, roomCount, size)` returns `{ width, height, grid, rooms, corridors }`; room i joins room i-1 by an L-shaped corridor, so everything is connected. `reachable(grid, from)` proves it.
- `kit/core/genre/arpg/loot.js`: `RARITIES`, `RARITY_WEIGHTS`, `RARITY_POWER`, `DEFAULT_TABLE`, `rollRarity`, `rollLoot(table, rng)`.
- `kit/core/genre/arpg/inventory.js`: `SLOTS` (weapon, head, body), `createInventory`, `pickUp`, `equip`, `equippedPower`.
- Pathing reuses `kit/core/genre/rts/astar.js` (the genre's `genre.json` declares `kitGenres: ["rts"]` so it is composed in).
- `src/genre/index.js` holds the hotbar, enemies, drops and the bag screen.

## Tuning (kit defaults)

Dungeon: 64 by 48 cells and 12 rooms by default (`generateDungeon(seed, roomCount, size)`).

Rarity weights out of 100: `common = 70`, `magic = 22`, `rare = 7`, `unique = 1`. Power multipliers: `common = 1`, `magic = 1.5`, `rare = 2.2`, `unique = 3.5`. Inventory capacity is 12.

Starter hotbar: strike (`cooldown = 400`, free), fireball (`mana = 10`, `cooldown = 700`), nova (`mana = 25`, `cooldown = 2500`), potion (`cooldown = 5000`). Cheap skill always available, one area skill on a long cooldown, one heal: keep that shape when adding skills.

`rollLoot` takes a function returning a float in [0, 1): pass `() => rng.next()` from `kit/core/rng.js`, never `Math.random`, so a seed gives the same dungeon and drops.

## Build order

1. `generateDungeon(seed)`, draw the grid, spawn the player in the first room.
2. Click-to-move through `astar`; camera follow.
3. Enemies per room with simple chase and a contact attack.
4. Hotbar skills with a mana pool and per-skill cooldowns.
5. Drops on death via `rollLoot`; pick up into the bag; equip; damage uses `equippedPower`.
6. A boss room or stairs for a goal.

## Play-test checklist

- `$.arpg.rooms`, `enemies`, `kills`, `mana`, `bag`, `equipped`, `drops`, `bagOpen` move as expected.
- The same seed gives the same room count and layout across two runs; different seeds differ.
- Every room is `reachable` from the start.
- Cast a skill without enough mana: no effect, mana unchanged. Cast it twice within its cooldown: one cast.
- Kill enemies until a drop appears, pick it up, equip it, and confirm `equippedPower` rose.
- Open the bag (`I`) and check it closes again.
