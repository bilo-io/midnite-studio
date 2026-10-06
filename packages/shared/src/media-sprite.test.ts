import { describe, expect, it } from 'vitest';

import {
  SPRITE_GROUPS,
  SPRITE_GROUP_IDS,
  SpriteAssetSpecSchema,
  SpriteClipSchema,
  SpriteLibraryRequestSchema,
  parseSpriteSpec,
  spriteDirections,
  spriteFolderLabel,
  spriteFrameKey,
  spriteFramePath,
  spriteGroupOf,
  spriteSlug,
} from './media-sprite';
import { MEDIA_TABS, REPO_SCOPED_MEDIA_TABS } from './media';

describe('SpriteAssetSpecSchema', () => {
  it('fills every default for a minimal sheet', () => {
    const spec = SpriteAssetSpecSchema.parse({ kind: 'sheet', name: 'hero' });
    expect(spec).toMatchObject({
      version: 1,
      kind: 'sheet',
      category: 'character',
      prompt: '',
      style: 'pixel',
      targetPerspective: 'side',
      frameSize: [64, 64],
      directions: 1,
      anchor: { x: 0.5, y: 1 },
      outline: false,
      method: 'hand-drawn',
      clips: [],
      consistency: { threshold: 0.7, rerollBudget: 2 },
    });
  });

  it('round-trips every kind', () => {
    for (const input of [
      { kind: 'sheet', name: 'a' },
      { kind: 'tileset', name: 'b' },
      { kind: 'background', name: 'c' },
      { kind: 'prop-sheet', name: 'd' },
      { kind: 'map', name: 'e' },
    ]) {
      const once = SpriteAssetSpecSchema.parse(input);
      expect(SpriteAssetSpecSchema.parse(JSON.parse(JSON.stringify(once)))).toEqual(once);
    }
  });

  it('rejects a bad clip name, an unknown kind and a missing name', () => {
    expect(SpriteClipSchema.safeParse({ name: 'Walk!', frames: 4 }).success).toBe(false);
    expect(SpriteClipSchema.safeParse({ name: 'walk', frames: 4 }).success).toBe(true);
    expect(SpriteAssetSpecSchema.safeParse({ kind: 'mesh', name: 'x' }).success).toBe(false);
    expect(() => parseSpriteSpec({ kind: 'sheet' })).toThrow();
  });
});

describe('spriteDirections', () => {
  it('a 1-direction sheet faces east on a side view and south otherwise', () => {
    expect(spriteDirections({ directions: 1, targetPerspective: 'side' })).toEqual(['e']);
    expect(spriteDirections({ directions: 1, targetPerspective: 'top-down' })).toEqual(['s']);
  });
  it('lists the named directions in order', () => {
    expect(spriteDirections({ directions: 4, targetPerspective: 'top-down' })).toEqual(['s', 'w', 'n', 'e']);
    expect(spriteDirections({ directions: 8, targetPerspective: 'isometric' })).toEqual(['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se']);
  });
});

describe('groups and naming', () => {
  it('has five fixed groups', () => {
    expect(SPRITE_GROUP_IDS).toEqual(['characters', 'objects', 'tilesets', 'backgrounds', 'maps']);
    expect(SPRITE_GROUPS.characters).toBe('Characters');
  });
  it('routes each kind to its group', () => {
    expect(spriteGroupOf({ kind: 'sheet' })).toBe('characters');
    expect(spriteGroupOf({ kind: 'sheet', category: 'object' })).toBe('objects');
    expect(spriteGroupOf({ kind: 'prop-sheet' })).toBe('objects');
    expect(spriteGroupOf({ kind: 'tileset' })).toBe('tilesets');
    expect(spriteGroupOf({ kind: 'background' })).toBe('backgrounds');
    expect(spriteGroupOf({ kind: 'map' })).toBe('maps');
  });
  it('slugs, labels and pads frame paths', () => {
    expect(spriteSlug('Hero Knight!')).toBe('hero-knight');
    expect(spriteSlug('???')).toBe('sprite');
    expect(spriteFolderLabel('hero-20261004-120000')).toBe('hero');
    expect(spriteFramePath('walk', 'e', 3)).toBe('frames/walk/e/003.png');
    expect(spriteFrameKey('walk', 'e', 3)).toBe('walk/e/003');
  });
  it('validates a create request', () => {
    expect(SpriteLibraryRequestSchema.safeParse({ op: 'create', repoId: 'r', spec: { kind: 'sheet', name: 'x' } }).success).toBe(true);
    expect(SpriteLibraryRequestSchema.safeParse({ op: 'delete', repoId: 'r', group: 'nope', asset: 'x' }).success).toBe(false);
  });
});

describe('the tab', () => {
  it('registers after terrain and is repo-scoped', () => {
    expect(MEDIA_TABS.indexOf('sprite')).toBe(MEDIA_TABS.indexOf('terrain') + 1);
    expect(REPO_SCOPED_MEDIA_TABS).toContain('sprite');
  });
});
