---
name: midnite-media-game-rpg
description: Recipe for a 3D RPG in a Midnite Studio game repo — JSON quest log, dialogue trees with gated choices and effects, stats and levelling, NPC schedules on a game clock, and the ARPG inventory, with kit tuning numbers and a play-test checklist. Use when extending the RPG starter or building a story-driven 3D game.
---

# Genre recipe — RPG (3D)

Starter ids `rpg@third-person` and `rpg@first-person`. Read `midnite-media-game-build` first. Enemies and NPCs path over a navmesh (`needsNav('rpg')`).

## Where things live

Engine-free systems in `kit/core/genre/rpg/`, content as JSON in the game's `src/data/`:

- `quests.js`: `QUEST_EVENTS` (`talk`, `collect`, `defeat`, `reach`), `validateQuests`, `createQuestLog`, `startQuest`, `currentStage`, `questEvent(log, event)`, `questStatus`, `journal`. A quest moves only on the event its current stage lists; anything else is ignored.
- `dialogue.js`: `validateDialogue`, `reachableEnds`, `everyNodeCanEnd`, `availableChoices`, `startConversation`, `advance(conv, index, ctx)`. A node has exactly one way on: `choices`, a bare `next`, or `end: true`. A choice may be gated by `requires: { quest, status }` and carry `effects` (`start-quest`, `quest-event`, `give`, `gold`).
- `stats.js`: `ATTRIBUTES`, `MAX_LEVEL`, `POINTS_PER_LEVEL`, `xpForLevel`, `createStats`, `gainXp`, `spendPoint`, `derived(stats, gearPower)`, `levelProgress`.
- `schedule.js`: `gameHour(seconds, dayLength, startHour)`, `scheduleAt(schedule, hour, fallback)`, `inBlock`, `validateSchedule`, `walkToward`. Blocks may wrap midnight (`from: 22, to: 6`).
- The inventory and loot come from `kit/core/genre/arpg/` (declared in `genre.json` as `kitGenres`).
- `src/data/quests.json`, `dialogue.json`, `npcs.json`; `src/genre/index.js` wires them.

## Tuning (kit defaults)

`MAX_LEVEL = 30`, `POINTS_PER_LEVEL = 3`. XP to reach a level is `round(100 * (level - 1) ^ 1.5)`: 100 for level 2, 283 for level 3. Four attributes (`str`, `agi`, `int`, `vit`) start at 5. Derived: `maxHp = 40 + vit * 8 + level * 6`, `damage = round(4 + str * 1.5 + gearPower)`, and `critChance` is capped at 0.5.

The starter's game day is `DAY_SECONDS = 300` and it starts at hour 8 (the kit's default day is 600 s). Ten minutes of play should cover at least one NPC schedule change.

Content rules: every quest stage names its trigger; every dialogue node must be able to reach an end (`everyNodeCanEnd`); every `requires` and `start-quest` names a quest that exists. Run the validators on the data in a play-test, not only by reading it.

## Build order

1. Base arena and NPC placement from `npcs.json`.
2. Dialogue UI from `startConversation` and `advance`; effects applied by the game.
3. The quest log fed by game events (`questEvent`) from combat, pickups and zones.
4. Stats and levelling on XP rewards; gear power from the inventory.
5. Schedules: NPCs `walkToward` their `scheduleAt` target as the hour advances.

## Play-test checklist

- `$.rpg.level`, `xp`, `gold`, `hour`, `quests` (id to `inactive`, `active` or `done`), `dialogue` (`with`, `node`), `equipped`, `wolves`, `npcs`.
- Talk to the quest giver (`E`), choose a reply (`1`-`4`): the quest becomes `active`.
- Kill the required count: the stage advances; kill extras and nothing breaks.
- Finish the last stage: reward (xp, gold, item) applied once, status `done`.
- A gated choice is absent until its quest has the required status.
- Let the clock cross a schedule boundary: the NPC's position in `$.rpg.npcs` changes.
- Gain enough XP to level up twice in one award; points are granted for each level.
