// vitest (node): the animation library's wire contract — schemas, defaults, the op union and the helpers.
import { describe, expect, it } from 'vitest';

import {
  ANIMATION_FORMATS,
  AnimationClipSchema,
  AnimationManifestSchema,
  AnimationPatchSchema,
  AnimationRequestSchema,
  animationSlug,
  formatAnimationDuration,
} from './media-animation';
import { MEDIA_TABS, MEDIA_TAB_EXPORT_FORMATS, REPO_SCOPED_MEDIA_TABS } from './media';
import { MediaAnimationRequest, MediaAnimationResponse } from './ipc/schemas';
import { CHANNELS, EVENT_CHANNELS } from './ipc/channels';

const SHA = 'a'.repeat(64);
const base = { id: 'aaaaaaaaaaaa', name: 'Walking', format: 'fbx', sha256: SHA, file: 'clips/aaaaaaaaaaaa-walking.fbx', sizeBytes: 10, addedAt: 1 };

describe('AnimationClipSchema', () => {
  it('fills every optional with a safe default', () => {
    const clip = AnimationClipSchema.parse(base);
    expect(clip).toMatchObject({ tags: [], durationSec: null, hasSkin: false, source: 'local', licence: 'unknown', author: '' });
  });

  it('normalises tags and rejects bad ones', () => {
    expect(AnimationClipSchema.parse({ ...base, tags: [' Combat ', 'idle'] }).tags).toEqual(['combat', 'idle']);
    expect(AnimationClipSchema.safeParse({ ...base, tags: ['has space'] }).success).toBe(false);
    expect(AnimationClipSchema.safeParse({ ...base, tags: Array.from({ length: 17 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it('refuses a malformed id, sha256 or non-http URL', () => {
    expect(AnimationClipSchema.safeParse({ ...base, id: 'xyz' }).success).toBe(false);
    expect(AnimationClipSchema.safeParse({ ...base, sha256: 'nope' }).success).toBe(false);
    expect(AnimationClipSchema.safeParse({ ...base, originalUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(AnimationClipSchema.safeParse({ ...base, originalUrl: 'https://www.mixamo.com/#/?page=1' }).success).toBe(true);
  });

  it('ignores a field a later build added, so an older reader still loads the manifest', () => {
    const parsed = AnimationManifestSchema.parse({ version: 1, clips: [{ ...base, futureField: 1 }], extra: true });
    expect(parsed.clips).toHaveLength(1);
    expect('futureField' in parsed.clips[0]!).toBe(false);
  });
});

describe('AnimationManifestSchema', () => {
  it('parses an empty object as an empty v1 manifest', () => {
    expect(AnimationManifestSchema.parse({})).toEqual({ version: 1, clips: [] });
  });
  it('rejects a manifest from a future major version', () => {
    expect(AnimationManifestSchema.safeParse({ version: 2, clips: [] }).success).toBe(false);
  });
});

describe('AnimationRequestSchema', () => {
  it('accepts every op', () => {
    for (const req of [
      { op: 'list' },
      { op: 'importFiles' },
      { op: 'importFolder' },
      { op: 'importBytes', name: 'Walking.fbx', dataBase64: 'AAAA' },
      { op: 'update', id: 'aaaaaaaaaaaa', patch: { tags: ['idle'] } },
      { op: 'remove', id: 'aaaaaaaaaaaa' },
      { op: 'read', id: 'aaaaaaaaaaaa' },
    ]) {
      expect(AnimationRequestSchema.safeParse(req).success, JSON.stringify(req)).toBe(true);
    }
  });
  it('rejects an unknown op, a bad id and an empty drop', () => {
    expect(AnimationRequestSchema.safeParse({ op: 'format' }).success).toBe(false);
    expect(AnimationRequestSchema.safeParse({ op: 'remove', id: '../etc' }).success).toBe(false);
    expect(AnimationRequestSchema.safeParse({ op: 'importBytes', name: 'a.fbx', dataBase64: '' }).success).toBe(false);
  });
  it('a patch cannot touch the file fields', () => {
    const patch = AnimationPatchSchema.parse({ name: 'Run', sha256: SHA, file: '../../x', sizeBytes: 1 });
    expect(patch).toEqual({ name: 'Run' });
  });
});

describe('the channel', () => {
  it('is registered with request and response schemas', () => {
    expect(CHANNELS.mediaAnimation).toBe('mstudio:media:animation');
    expect(EVENT_CHANNELS.mediaAnimationChanged).toBe('mstudio:media:animation-changed');
    expect(MediaAnimationRequest.safeParse({ op: 'list' }).success).toBe(true);
    expect(MediaAnimationResponse.safeParse({ ok: true, value: { clips: [] } }).success).toBe(true);
    expect(MediaAnimationResponse.safeParse({ ok: false, kind: 'error', message: 'nope' }).success).toBe(true);
  });
});

describe('the tab', () => {
  it('follows Sprites, is global (not repo-scoped) and exports nothing', () => {
    expect(MEDIA_TABS.indexOf('animation')).toBe(MEDIA_TABS.indexOf('sprite') + 1);
    expect(REPO_SCOPED_MEDIA_TABS).not.toContain('animation');
    expect(MEDIA_TAB_EXPORT_FORMATS.animation).toEqual([]);
  });
});

describe('helpers', () => {
  it('slugs names to safe ASCII, never empty', () => {
    expect(animationSlug('Sword And Shield Slash (1)')).toBe('sword-and-shield-slash-1');
    expect(animationSlug('Ñandú / Crème')).toBe('nandu-creme');
    expect(animationSlug('../../etc')).toBe('etc');
    expect(animationSlug('日本語')).toBe('clip');
    expect(animationSlug('x'.repeat(200)).length).toBeLessThanOrEqual(48);
  });
  it('formats a duration, carrying centiseconds into seconds and minutes', () => {
    expect(formatAnimationDuration(null)).toBe('—');
    expect(formatAnimationDuration(1.5)).toBe('0:01.50');
    expect(formatAnimationDuration(59.999)).toBe('1:00.00');
    expect(formatAnimationDuration(125.25)).toBe('2:05.25');
  });
  it('lists the four formats Mixamo, glTF and BVH hand out', () => {
    expect([...ANIMATION_FORMATS]).toEqual(['fbx', 'glb', 'gltf', 'bvh']);
  });
});
