import { describe, expect, it } from 'vitest';

import { SpriteFramesFileSchema, SpriteSheetSpecSchema } from '../media-sprite';
import { clipFrames, invertSpritePatchOp, moveRenames, sheetFrames, spriteSheetDirections, staleFrameKeys } from './frames';

const file = (keys: string[]) => SpriteFramesFileSchema.parse({ frames: Object.fromEntries(keys.map((k) => [k, {}])) });

describe('sheet frames', () => {
  it('a 1-direction side sheet holds e and its mirrored w', () => {
    expect(spriteSheetDirections({ directions: 1, targetPerspective: 'side' })).toEqual(['e', 'w']);
    expect(spriteSheetDirections({ directions: 1, targetPerspective: 'front' })).toEqual(['s']);
    expect(spriteSheetDirections({ directions: 4, targetPerspective: 'top-down' })).toEqual(['s', 'w', 'n', 'e']);
  });

  it('drops frames numbered past the clip (a shorter re-render) and keeps holes', () => {
    const f = file(['walk/e/000', 'walk/e/002', 'walk/e/003', 'walk/e/007']);
    expect(clipFrames(f, { name: 'walk', frames: 4 }, 'e').map((x) => x.n)).toEqual([0, 2, 3]);
  });

  it('orders the sheet clip → direction → n', () => {
    const spec = SpriteSheetSpecSchema.parse({ kind: 'sheet', name: 'h', clips: [{ name: 'idle', frames: 2 }, { name: 'run', frames: 1 }] });
    const f = file(['run/e/000', 'idle/w/001', 'idle/e/001', 'idle/e/000', 'idle/w/000']);
    expect(sheetFrames(spec, f).map((x) => x.key)).toEqual(['idle/e/000', 'idle/e/001', 'idle/w/000', 'idle/w/001', 'run/e/000']);
  });

  it('staleFrameKeys names frames past their clip and of clips that are gone, optionally per clip', () => {
    const spec = { clips: [{ name: 'walk', frames: 2, fps: 8, loop: 'loop' as const }] };
    const f = file(['walk/e/000', 'walk/e/001', 'walk/e/002', 'jump/e/000']);
    expect(staleFrameKeys(spec, f).sort()).toEqual(['jump/e/000', 'walk/e/002']);
    expect(staleFrameKeys(spec, f, ['walk'])).toEqual(['walk/e/002']);
  });
});

describe('moveRenames', () => {
  it('shifts the frames between and keeps the slots (holes stay put)', () => {
    expect(moveRenames([0, 1, 2, 3], 0, 2)).toEqual([
      [1, 0],
      [2, 1],
      [0, 2],
    ]);
    expect(moveRenames([0, 2, 5], 5, 0)).toEqual([
      [5, 0],
      [0, 2],
      [2, 5],
    ]);
    expect(moveRenames([0, 1], 1, 1)).toEqual([]);
  });
});

describe('invertSpritePatchOp', () => {
  const f = file(['walk/e/000', 'walk/e/001', 'walk/e/002', 'walk/e/003']);
  it('inverts each op', () => {
    expect(invertSpritePatchOp({ op: 'nudge', key: 'walk/e/000', dx: 1, dy: -4 }, f)).toEqual({ op: 'nudge', key: 'walk/e/000', dx: -1, dy: 4 });
    expect(invertSpritePatchOp({ op: 'flip', key: 'walk/e/000' }, f)).toEqual({ op: 'flip', key: 'walk/e/000' });
    expect(invertSpritePatchOp({ op: 'delete', key: 'walk/e/001' }, f)).toEqual({ op: 'restore', key: 'walk/e/001' });
    expect(invertSpritePatchOp({ op: 'reroll', keys: ['walk/e/001'] }, f)).toBeNull();
  });

  it("a move's inverse moves the frame back from where it landed", () => {
    expect(invertSpritePatchOp({ op: 'move', key: 'walk/e/000', to: 2 }, f)).toEqual({ op: 'move', key: 'walk/e/002', to: 0 });
  });
});
