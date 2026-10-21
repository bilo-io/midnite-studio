import {
  GAME_DAY_MINUTES_DEFAULT,
  GAME_FEATURE_KEYS,
  GameOptionsSchema,
  type GameFeatureKey,
  type GameGenre,
  type GameOptions,
  type GamePerspective,
} from './media-game';
import { GAME_TEMPLATE_MATRIX } from './media-game-templates';

/**
 * Fine-tune options from the new-game wizard. They are recorded in
 * `midnite-game.json` (`options`) and rendered into the agent's first prompt as a
 * "Requested features" list, so the building agent implements them. A starter
 * may also read the flags it already supports (open world's day/night clock).
 * No engine or kit system is built from them here.
 */

export const GAME_OPTION_LABEL: Record<'dayNight' | GameFeatureKey, string> = {
  dayNight: 'Day/night cycle',
  npcs: 'NPCs',
  enemies: 'Enemies',
  bosses: 'Bosses',
  lawEnforcement: 'Law enforcement',
  wanted: 'Wanted / bounty system',
  revenge: 'Revenge system',
  missions: 'Missions',
};

export const GAME_OPTION_HINT: Record<'dayNight' | GameFeatureKey, string> = {
  dayNight: 'The sky, light and street life follow a clock.',
  npcs: 'Non-hostile people who live in the world.',
  enemies: 'Hostile characters that fight the player.',
  bosses: 'Set-piece enemies with their own health bars and phases.',
  lawEnforcement: 'Police or guards who respond to crimes.',
  wanted: 'A heat or bounty level that rises with crimes and draws pursuit.',
  revenge: 'Defeated or wronged characters come back to settle the score.',
  missions: 'Objectives the player can accept and complete.',
};

const NONE: GameOptions = GameOptionsSchema.parse({});

/** Everything off. */
export const emptyGameOptions = (): GameOptions => ({ ...NONE, dayNight: { ...NONE.dayNight } });

type Defaults = Partial<Omit<GameOptions, 'dayNight'>> & { dayNight?: boolean };

const GENRE_DEFAULTS: Record<GameGenre, Defaults> = {
  fps: { enemies: true },
  rts: { enemies: true, missions: true },
  arpg: { enemies: true, bosses: true, npcs: true, missions: true },
  crime: { dayNight: true, npcs: true, lawEnforcement: true, wanted: true, missions: true },
  shooter: { enemies: true },
  fighter: { enemies: true },
  soulslike: { enemies: true, bosses: true },
  rpg: { dayNight: true, npcs: true, enemies: true, missions: true },
  'character-action': { enemies: true, bosses: true },
  'open-world': { dayNight: true, npcs: true, lawEnforcement: true, wanted: true, missions: true },
};

/** The options a genre starts from (`null` = a blank perspective base: everything off). */
export function defaultGameOptions(genre: GameGenre | null): GameOptions {
  const options = emptyGameOptions();
  if (genre === null) return options;
  const d = GENRE_DEFAULTS[genre];
  return {
    ...options,
    ...Object.fromEntries(GAME_FEATURE_KEYS.map((k) => [k, d[k] ?? false])),
    dayNight: { enabled: d.dayNight ?? false, minutesPerDay: GAME_DAY_MINUTES_DEFAULT },
  };
}

export type GameOptionAvailability = { available: true } | { available: false; reason: string };
const yes: GameOptionAvailability = { available: true };

/**
 * Whether an option makes sense for the selection, with the reason when not.
 * `options` is consulted for the dependent flags (wanted needs law enforcement,
 * revenge needs someone to take it).
 */
export function gameOptionAvailability(
  key: 'dayNight' | GameFeatureKey,
  ctx: { genre: GameGenre | null; perspective: GamePerspective },
  options?: GameOptions,
): GameOptionAvailability {
  const fighter = ctx.genre !== null && GAME_TEMPLATE_MATRIX[ctx.genre].versus === true;
  switch (key) {
    case 'dayNight':
      if (fighter) return { available: false, reason: 'A one-on-one fighter plays on a single stage with no passing time.' };
      if (ctx.perspective === 'raycaster') return { available: false, reason: 'Raycaster corridors are indoors, so there is no sky to change.' };
      return yes;
    case 'npcs':
    case 'missions':
    case 'lawEnforcement':
      return fighter ? { available: false, reason: 'A one-on-one fighter has no world to populate.' } : yes;
    case 'wanted':
      if (fighter) return { available: false, reason: 'A one-on-one fighter has no world to police.' };
      if (options && !options.lawEnforcement) return { available: false, reason: 'A wanted level needs law enforcement. Turn that on first.' };
      return yes;
    case 'revenge':
      if (fighter) return { available: false, reason: 'A one-on-one fighter has no one to come back.' };
      if (options && !options.enemies && !options.npcs) return { available: false, reason: 'Revenge needs enemies or NPCs. Turn one of them on first.' };
      return yes;
    case 'enemies':
    case 'bosses':
      return yes;
  }
}

/** Switch off every option the selection cannot honour (and clamp the day length). */
export function normalizeGameOptions(
  options: GameOptions,
  ctx: { genre: GameGenre | null; perspective: GamePerspective },
): GameOptions {
  let next: GameOptions = { ...options, dayNight: { ...options.dayNight } };
  // Dependencies resolve in order, so a turned-off parent switches off its child.
  for (const key of ['lawEnforcement', 'npcs', 'enemies', 'missions', 'bosses', 'wanted', 'revenge'] as const) {
    if (!gameOptionAvailability(key, ctx, next).available) next = { ...next, [key]: false };
  }
  if (!gameOptionAvailability('dayNight', ctx).available) next.dayNight = { ...next.dayNight, enabled: false };
  return next;
}

const FEATURE_PROMPT: Record<GameFeatureKey, string> = {
  npcs: 'NPCs: non-hostile characters that live in the world',
  enemies: 'Enemies: hostile characters that fight the player',
  bosses: 'Bosses: set-piece enemies with their own health bars and phases',
  lawEnforcement: 'Law enforcement: police or guards who respond to crimes',
  wanted: 'Wanted / bounty system: a heat level that rises with crimes and draws pursuit',
  revenge: 'Revenge system: defeated or wronged characters come back to settle the score',
  missions: 'Missions: objectives the player can accept and complete',
};

/**
 * The "Requested features" block appended to the agent's first prompt. Features
 * the starter already ships are still listed, so the agent keeps them wired;
 * features left off are named so the agent does not add them.
 */
export function renderGameOptionsPrompt(options: GameOptions): string {
  const on: string[] = [];
  const off: string[] = [];
  if (options.dayNight.enabled) {
    on.push(`Day/night cycle: one full game day lasts ${options.dayNight.minutesPerDay} minute${options.dayNight.minutesPerDay === 1 ? '' : 's'} of real time`);
  } else off.push('day/night cycle');
  for (const key of GAME_FEATURE_KEYS) {
    if (options[key]) on.push(FEATURE_PROMPT[key]);
    else off.push(GAME_OPTION_LABEL[key].toLowerCase());
  }
  const lines = ['Requested features (also recorded in `midnite-game.json` under `options`):', ...on.map((l) => `- ${l}`)];
  if (on.length === 0) lines.push('- None. Keep the game focused on the core loop.');
  if (off.length > 0) lines.push(`Not requested, so do not add: ${off.join(', ')}.`);
  return lines.join('\n');
}
