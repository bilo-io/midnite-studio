import { describe, expect, it } from 'vitest';

import { GAME_GENRES } from './media-game';
import {
  allStarterIds,
  GAME_GENRES_2D,
  GAME_GENRES_3D,
  GAME_PERSPECTIVES_2D,
  GAME_PERSPECTIVES_3D,
  GAME_TEMPLATE_MATRIX,
  isStarterAvailable,
  isValidStarter,
  parseStarterId,
  starterId,
} from './media-game-templates';

describe('GAME_TEMPLATE_MATRIX', () => {
  it('covers every genre exactly once', () => {
    expect([...GAME_GENRES_2D, ...GAME_GENRES_3D].sort()).toEqual([...GAME_GENRES].sort());
    expect(Object.keys(GAME_TEMPLATE_MATRIX).sort()).toEqual([...GAME_GENRES].sort());
  });
  it('keeps each genre inside its dimension', () => {
    for (const genre of GAME_GENRES_2D) {
      const cell = GAME_TEMPLATE_MATRIX[genre];
      for (const p of [cell.native, ...cell.also]) expect(GAME_PERSPECTIVES_2D as readonly string[]).toContain(p);
    }
    for (const genre of GAME_GENRES_3D) {
      const cell = GAME_TEMPLATE_MATRIX[genre];
      for (const p of [cell.native, ...cell.also]) expect(GAME_PERSPECTIVES_3D as readonly string[]).toContain(p);
    }
  });
  it('enumerates only valid ids', () => {
    for (const id of allStarterIds()) expect(isValidStarter(id)).toEqual({ ok: true });
    expect(allStarterIds()).toContain('rts@isometric');
    expect(allStarterIds()).toContain('rpg@first-person');
  });
});

describe('starter ids', () => {
  it('round-trips', () => {
    expect(starterId('top-down')).toBe('top-down');
    expect(starterId('isometric', 'rts')).toBe('rts@isometric');
    expect(parseStarterId('rts@isometric')).toEqual({ perspective: 'isometric', genre: 'rts' });
    expect(parseStarterId('nope')).toBeNull();
    expect(parseStarterId('a@b@c')).toBeNull();
  });
  it('refuses with the reason', () => {
    expect(isValidStarter('fighter@first-person')).toEqual({ ok: false, reason: 'Fighters use the versus camera only.' });
    expect(isValidStarter('fps@top-down')).toEqual({ ok: false, reason: 'The FPS genre needs the raycaster.' });
    expect(isValidStarter('shooter@isometric').ok).toBe(false);
  });
  it('the bases and the 2D genres are available; the 3D genres wait for their modules', () => {
    expect(isStarterAvailable('platformer')).toEqual({ ok: true });
    expect(isStarterAvailable('rts@isometric')).toEqual({ ok: true });
    expect(isStarterAvailable('crime@top-down')).toEqual({ ok: true });
    expect(isStarterAvailable('shooter@first-person').ok).toBe(false);
    expect(isStarterAvailable('fps@top-down')).toEqual({ ok: false, reason: 'The FPS genre needs the raycaster.' });
  });
});
