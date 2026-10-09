import { describe, expect, it } from 'vitest';

import { SpriteSheetSpecSchema, SPRITE_ONE_SHOT_TOO_MANY } from '../media-sprite';
import { ONE_SHOT_PROMPT_VERSION, oneShotAspect, oneShotBlocker, oneShotGrid, oneShotPrompt, oneShotRows } from './one-shot-prompt';
import { nearestAspect } from './pose-tables';

const sheet = (over: Record<string, unknown> = {}) =>
  SpriteSheetSpecSchema.parse({
    kind: 'sheet',
    name: 'knight',
    prompt: 'a knight with a red plume',
    method: 'one-shot',
    frameSize: [64, 64],
    clips: [
      { name: 'idle', frames: 4 },
      { name: 'walk', frames: 4 },
    ],
    ...over,
  });

describe('one-shot prompt', () => {
  it('is versioned', () => {
    expect(ONE_SHOT_PROMPT_VERSION).toBe(1);
  });

  it('a 4×2 grid names its columns, rows, row order, the chroma hex and no text', () => {
    const spec = sheet();
    const rows = oneShotRows(spec);
    const grid = oneShotGrid(spec, rows);
    expect(grid).toEqual({ columns: 4, rows: 2, cell: [64, 64], gutter: 8 });
    const text = oneShotPrompt(spec, grid, rows, { chroma: '#ff00ff' });
    expect(text).toContain('4 columns');
    expect(text).toContain('2 rows');
    expect(text).toContain('#ff00ff');
    expect(text.toLowerCase()).toContain('no text');
    expect(text).toContain('row 1: idle, facing right (east)');
    expect(text).toContain('row 2: walk');
    expect(text).toContain('64×64');
    expect(text).toContain('same baseline');
  });

  it('asks for transparency instead of a chroma when the provider returns alpha', () => {
    const spec = sheet();
    const rows = oneShotRows(spec);
    expect(oneShotPrompt(spec, oneShotGrid(spec, rows), rows, null)).toContain('fully transparent');
  });

  it('rows are clips × drawn directions; a mirrored side sheet draws east only', () => {
    expect(oneShotRows(sheet()).map((r) => `${r.clip.name}/${r.dir}`)).toEqual(['idle/e', 'walk/e']);
    expect(oneShotRows(sheet({ mirror: false })).map((r) => r.dir)).toEqual(['e', 'w', 'e', 'w']);
    expect(oneShotRows(sheet({ directions: 4, targetPerspective: 'top-down' })).length).toBe(8);
    expect(oneShotRows(sheet(), ['walk']).map((r) => r.clip.name)).toEqual(['walk']);
  });

  it('nearestAspect(512, 256) is 16:9; the sheet aspect comes from the grid', () => {
    expect(nearestAspect(512, 256)).toBe('16:9');
    const spec = sheet();
    expect(oneShotAspect(oneShotGrid(spec, oneShotRows(spec)))).toBe('16:9');
  });

  it('an 8 × 9 grid is refused before any request', () => {
    expect(oneShotBlocker({ columns: 8, rows: 9 })).toBe(SPRITE_ONE_SHOT_TOO_MANY);
    expect(oneShotBlocker({ columns: 9, rows: 1 })).toBe(SPRITE_ONE_SHOT_TOO_MANY);
    expect(oneShotBlocker({ columns: 8, rows: 8 })).toBeNull();
    expect(SPRITE_ONE_SHOT_TOO_MANY).toBe('Too many frames for one image — use at most 8 frames and 8 rows, or switch to Hand-drawn.');
  });
});
