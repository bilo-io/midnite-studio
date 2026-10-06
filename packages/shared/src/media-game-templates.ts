import { GAME_PERSPECTIVES, type GameDimension, type GameGenre, type GamePerspective } from './media-game';

/**
 * Phase 107 Theme K — the perspective × genre matrix. A starter is a perspective
 * base (Theme G) alone, or a base plus a genre's systems module (Themes H-J),
 * composed at creation so there is one copy of each system.
 */

export const GAME_PERSPECTIVES_2D = ['platformer', 'top-down', 'isometric', 'raycaster'] as const satisfies readonly GamePerspective[];
export const GAME_PERSPECTIVES_3D = ['first-person', 'third-person'] as const satisfies readonly GamePerspective[];
export const GAME_GENRES_2D = ['fps', 'rts', 'arpg', 'crime'] as const satisfies readonly GameGenre[];
export const GAME_GENRES_3D = [
  'shooter',
  'fighter',
  'soulslike',
  'rpg',
  'character-action',
  'open-world',
] as const satisfies readonly GameGenre[];

export type GameTemplateCell = {
  dimension: GameDimension;
  /** The perspective the genre was designed for. The fighter's is `third-person` with the versus camera forced. */
  native: GamePerspective;
  also: readonly GamePerspective[];
  /** True when the genre forces the fighter's `versus` camera instead of the cycle. */
  versus?: boolean;
  pitch: string;
  /** Shown on a cell the genre does not offer. */
  refusal: string;
};

export const GAME_TEMPLATE_MATRIX: Readonly<Record<GameGenre, GameTemplateCell>> = {
  fps: {
    dimension: '2d',
    native: 'raycaster',
    also: [],
    pitch: 'Doom-style corridor shooter on the DDA raycaster.',
    refusal: 'The FPS genre needs the raycaster.',
  },
  rts: {
    dimension: '2d',
    native: 'top-down',
    also: ['isometric'],
    pitch: 'Select, command and build: StarCraft-style real-time strategy.',
    refusal: 'RTS runs top-down or isometric.',
  },
  arpg: {
    dimension: '2d',
    native: 'isometric',
    also: ['top-down'],
    pitch: 'Diablo-style loot-and-click action RPG.',
    refusal: 'ARPG runs isometric or top-down.',
  },
  crime: {
    dimension: '2d',
    native: 'top-down',
    also: ['isometric'],
    pitch: 'Original-GTA city sandbox: on foot, in cars, with heat.',
    refusal: 'Top-down crime runs top-down or isometric.',
  },
  shooter: {
    dimension: '3d',
    native: 'first-person',
    also: ['third-person'],
    pitch: 'Arena shooter with hitscan and projectile weapons.',
    refusal: 'Shooters run first person or third person.',
  },
  fighter: {
    dimension: '3d',
    native: 'third-person',
    also: [],
    versus: true,
    pitch: 'Tekken-style one-on-one fighter on the versus camera.',
    refusal: 'Fighters use the versus camera only.',
  },
  soulslike: {
    dimension: '3d',
    native: 'third-person',
    also: [],
    pitch: 'Stamina, lock-on and punishing duels.',
    refusal: 'Soulslikes run third person only.',
  },
  rpg: {
    dimension: '3d',
    native: 'third-person',
    also: ['first-person'],
    pitch: 'Quests, dialogue, inventory and a party.',
    refusal: 'RPGs run third person or first person.',
  },
  'character-action': {
    dimension: '3d',
    native: 'third-person',
    also: [],
    pitch: 'Combo-driven stylish action.',
    refusal: 'Character action runs third person only.',
  },
  'open-world': {
    dimension: '3d',
    native: 'third-person',
    also: ['first-person'],
    pitch: 'GTA-style streaming world with vehicles and roads.',
    refusal: 'Open world runs third person or first person.',
  },
};

/**
 * Genres whose systems module has landed. Theme H added the four 2D genres; Themes
 * I and J add the 3D ones. The gallery shows every genre cell, but only the
 * available ones are creatable.
 */
export const GAME_GENRES_AVAILABLE: readonly GameGenre[] = ['fps', 'rts', 'arpg', 'crime', 'shooter', 'fighter', 'soulslike'];

export const GAME_GENRE_UNAVAILABLE_REASON = 'Not available yet: this genre arrives in a later update.';

/** A base is `perspective`; a genre combination is `genre@perspective`. */
export const starterId = (perspective: GamePerspective, genre: GameGenre | null = null): string =>
  genre === null ? perspective : `${genre}@${perspective}`;

export type ParsedStarter = { perspective: GamePerspective; genre: GameGenre | null };

export function parseStarterId(id: string): ParsedStarter | null {
  const [a, b, ...rest] = id.split('@');
  if (rest.length > 0 || a === undefined) return null;
  const isPerspective = (v: string | undefined): v is GamePerspective =>
    v !== undefined && (GAME_PERSPECTIVES as readonly string[]).includes(v);
  if (b === undefined) return isPerspective(a) ? { perspective: a, genre: null } : null;
  if (!isPerspective(b) || !(a in GAME_TEMPLATE_MATRIX)) return null;
  return { perspective: b, genre: a as GameGenre };
}

export const dimensionOf = (perspective: GamePerspective): GameDimension =>
  (GAME_PERSPECTIVES_2D as readonly string[]).includes(perspective) ? '2d' : '3d';

/** Whether the combination is one the genre offers (says nothing about availability). */
export function isValidStarter(id: string): { ok: true } | { ok: false; reason: string } {
  const parsed = parseStarterId(id);
  if (parsed === null) return { ok: false, reason: `"${id}" is not a starter.` };
  if (parsed.genre === null) return { ok: true };
  const cell = GAME_TEMPLATE_MATRIX[parsed.genre];
  if (dimensionOf(parsed.perspective) !== cell.dimension) return { ok: false, reason: cell.refusal };
  if (parsed.perspective === cell.native || cell.also.includes(parsed.perspective)) return { ok: true };
  return { ok: false, reason: cell.refusal };
}

/** Valid and its genre module exists. */
export function isStarterAvailable(id: string): { ok: true } | { ok: false; reason: string } {
  const valid = isValidStarter(id);
  if (!valid.ok) return valid;
  const parsed = parseStarterId(id)!;
  if (parsed.genre !== null && !GAME_GENRES_AVAILABLE.includes(parsed.genre)) {
    return { ok: false, reason: GAME_GENRE_UNAVAILABLE_REASON };
  }
  return { ok: true };
}

/** Every valid starter id, bases first. */
export function allStarterIds(): string[] {
  const ids: string[] = [...GAME_PERSPECTIVES];
  for (const [genre, cell] of Object.entries(GAME_TEMPLATE_MATRIX) as [GameGenre, GameTemplateCell][]) {
    for (const p of [cell.native, ...cell.also]) ids.push(starterId(p, genre));
  }
  return ids;
}
