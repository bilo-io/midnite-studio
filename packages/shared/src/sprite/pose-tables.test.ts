import { describe, expect, it } from 'vitest';

import { IMAGE_PROVIDERS, imageModelSupportsReference } from '../media';
import { parseSpriteSpec, SPRITE_APPROVE_FIRST, SPRITE_NO_REFERENCE, type SpriteSheetSpec } from '../media-sprite';
import {
  framePose,
  framePrompt,
  handDrawnBlocker,
  handDrawnDirections,
  nearestAspect,
  parseConsistency,
  SPRITE_FRAME_SUFFIX,
  SPRITE_POSE_TABLES,
  SPRITE_TURNAROUND_PROMPT,
} from './pose-tables';
import { SPRITE_CLIP_PRESETS } from './presets';

const sheet = (over: Record<string, unknown> = {}) => parseSpriteSpec({ kind: 'sheet', name: 'hero', prompt: 'a knight', ...over }) as SpriteSheetSpec;

describe('pose tables', () => {
  it('cover every preset clip with exactly one pose per preset frame', () => {
    for (const clips of Object.values(SPRITE_CLIP_PRESETS))
      for (const clip of clips) expect(SPRITE_POSE_TABLES[clip.name], clip.name).toHaveLength(clip.frames);
  });

  it('walk is contact, down, passing, up, then the mirrored four', () => {
    expect(SPRITE_POSE_TABLES.walk!.slice(0, 4)).toEqual(['contact (left foot forward)', 'down', 'passing', 'up']);
  });

  it('uses a clip’s own poses verbatim, resamples a resized preset, and falls back for custom clips', () => {
    expect(framePose({ name: 'walk', frames: 2, poses: ['a', 'b'] }, 1)).toBe('b');
    expect(framePose({ name: 'walk', frames: 4 }, 1)).toBe('passing');
    expect(framePose({ name: 'dance', frames: 3 }, 0)).toBe('frame 1 of 3 of a dance animation');
  });
});

describe('framePrompt', () => {
  it('composes style, subject, perspective, direction, pose, background and the suffix', () => {
    const prompt = framePrompt(sheet(), { name: 'walk', frames: 8 }, 'e', 2, 'Flat magenta background.');
    expect(prompt).toContain('pixel-art');
    expect(prompt).toContain('a knight');
    expect(prompt).toContain('Side view');
    expect(prompt).toContain('facing right');
    expect(prompt).toContain('frame 3 of 8: passing');
    expect(prompt).toContain('Flat magenta background.');
    expect(prompt.endsWith(SPRITE_FRAME_SUFFIX)).toBe(true);
  });

  it('the turnaround asks for front, side and back with no text', () => {
    expect(SPRITE_TURNAROUND_PROMPT(sheet())).toMatch(/front, side \(facing right\) and back[\s\S]*No text/);
  });
});

describe('parseConsistency', () => {
  it('reads the JSON, tolerating a fence, and rejects anything else', () => {
    expect(parseConsistency('```json\n{"score": 0.8, "issues": ["cape"]}\n```')).toEqual({ score: 0.8, issues: ['cape'] });
    expect(parseConsistency('{"score": "0.5"}')).toEqual({ score: 0.5, issues: [] });
    expect(parseConsistency('looks the same')).toBeNull();
    expect(parseConsistency('{"score": 3}')).toBeNull();
  });
});

describe('hand-drawn rules', () => {
  it('only Gemini (not Imagen) and OpenAI take a reference image', () => {
    expect(IMAGE_PROVIDERS.filter((p) => p.supportsReference).map((p) => p.id)).toEqual(['gemini', 'openai']);
    expect(imageModelSupportsReference('gemini', 'imagen-4.0-generate-001')).toBe(false);
    expect(imageModelSupportsReference('gemini', 'gemini-2.5-flash-image')).toBe(true);
  });

  it('blocks frames without an approved reference or with a reference-blind provider', () => {
    expect(handDrawnBlocker(sheet())).toBe(SPRITE_NO_REFERENCE);
    const ref = { kind: 'image', file: 'reference/reference.png', approved: false };
    expect(handDrawnBlocker(sheet({ reference: ref }))).toBe(SPRITE_APPROVE_FIRST);
    expect(handDrawnBlocker(sheet({ reference: { ...ref, approved: true } }))).toBeNull();
    expect(handDrawnBlocker(sheet({ provider: 'agy', reference: { ...ref, approved: true } }))).toMatch(/Antigravity CLI can't use a reference image/);
  });

  it('a side sheet draws east and mirrors west unless asymmetric', () => {
    expect(handDrawnDirections(sheet())).toEqual({ draw: ['e'], mirror: { e: 'w' } });
    expect(handDrawnDirections(sheet({ mirror: false }))).toEqual({ draw: ['e', 'w'], mirror: {} });
    expect(handDrawnDirections(sheet({ targetPerspective: 'top-down', directions: 4 })).draw).toEqual(['s', 'w', 'n', 'e']);
  });

  it('nearestAspect picks the closest supported ratio', () => {
    expect(nearestAspect(64, 64)).toBe('1:1');
    expect(nearestAspect(512, 256)).toBe('16:9');
    expect(nearestAspect(48, 96)).toBe('9:16');
  });
});
