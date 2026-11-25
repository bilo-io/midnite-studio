import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BUILDINGS_MAX_SIDE, haversine, isGridSize, metresPerPixel, plan, recommendSize, ROADS_MAX_SIDE } from './map-calc.mjs';
import { checkSpend, maxFrames, recommendMethod, spend } from './sprite-calc.mjs';
import { validateAudio, validateDocs, validateImage, validateSfx, validateTerrain } from './validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('validate', () => {
  it('audio limits', () => {
    expect(validateAudio({ title: 'x', duration: 30, variants: 2 }).ok).toBe(true);
    const r = validateAudio({ title: 'x'.repeat(121), styleTags: Array(13).fill('a'), duration: 9, variants: 5, lyrics: 'l'.repeat(5001), prompt: 'p'.repeat(401) });
    expect(r.errors.map((e) => e.path)).toEqual(['title', 'styleTags', 'lyrics', 'prompt', 'duration', 'variants']);
  });
  it('image', () => {
    expect(validateImage({ prompt: 'a cat', aspect: '16:9', provider: 'agy', count: 4 }).ok).toBe(true);
    expect(validateImage({ aspect: '4:3', count: 5 }).errors.map((e) => e.path)).toEqual(['prompt', 'count', 'aspect']);
  });
  it('docs refuse thread files and bad projects', () => {
    expect(validateDocs({ project: 'p', file: 'a.md', markdown: '# T\n\nbody' }).ok).toBe(true);
    expect(validateDocs({ project: '.hidden', file: 'a.thread.json' }).errors).toHaveLength(2);
    expect(validateDocs({ markdown: '# A\n# B' }).ok).toBe(false);
  });
  it('sfx ranges and negative prompt', () => {
    expect(validateSfx({ prompt: 'door', seconds: 11.8, steps: 8 }).ok).toBe(true);
    expect(validateSfx({ prompt: 'door', seconds: 12 }).ok).toBe(false);
    expect(validateSfx({ prompt: 'door', negativePrompt: 'music' }).errors[0].path).toBe('negativePrompt');
    expect(validateSfx({ prompt: 'door', negativePrompt: 'music', cfgScale: 2.5 }).ok).toBe(true);
  });
  it('terrain', () => {
    expect(validateTerrain({ resolution: 513, worldSize: 4000, heightRange: [0, 800] }).ok).toBe(true);
    expect(validateTerrain({ resolution: 500, worldSize: 10, heightRange: [5, 5] }).errors).toHaveLength(3);
    expect(validateTerrain({ version: 2 }, { patch: true }).ok).toBe(false);
  });
});

describe('map-calc', () => {
  it('grid sizes are 2^n + 1', () => {
    expect([129, 257, 4097].every(isGridSize)).toBe(true);
    expect([128, 500, 2].some(isGridSize)).toBe(false);
  });
  it('recommends the smallest grid reaching ~10 m/px', () => {
    expect(recommendSize(4000)).toBe(513);
    expect(recommendSize(65536)).toBe(4097);
    expect(metresPerPixel(1024, 129)).toBe(8);
  });
  it('limits per layer and bounds', () => {
    expect(plan(ROADS_MAX_SIDE + 1).roads).toBe(false);
    expect(plan(BUILDINGS_MAX_SIDE).buildings).toBe(true);
    expect(plan(BUILDINGS_MAX_SIDE + 1).buildings).toBe(false);
    expect(plan(10).ok).toBe(false);
    expect(plan(70000).ok).toBe(false);
  });
  it('haversine ~111 km per degree of latitude', () => {
    expect(Math.round(haversine([0, 0], [0, 1]) / 1000)).toBe(111);
  });
});

describe('sprite-calc', () => {
  it('spend is frames x directions x (1 + reroll)', () => {
    expect(spend({ frames: 8, directions: 4, reroll: 1 })).toBe(64);
    expect(checkSpend({ frames: 25, directions: 4, reroll: 1 }).ok).toBe(true);
    const over = checkSpend({ frames: 30, directions: 4, reroll: 1 });
    expect(over.ok).toBe(false);
    expect(over.hints[0]).toContain(String(maxFrames({ directions: 4, reroll: 1 })));
  });
  it('method switch', () => {
    expect(recommendMethod({ view: 'top-down', directions: 8, hasModelReference: true }).method).toBe('rendered');
    expect(recommendMethod({ view: 'side', style: 'painterly' }).method).toBe('hand-drawn');
    expect(recommendMethod({ view: 'side', frames: 6, rows: 2 }).method).toBe('one-shot');
    expect(recommendMethod({ view: 'side', frames: 12 }).method).toBe('hand-drawn');
  });
});

describe('scaffold.sh', () => {
  it('creates once and never clobbers', () => {
    const repo = mkdtempSync(join(tmpdir(), 'scaffold-'));
    try {
      const run = () => execFileSync('bash', [join(here, 'scaffold.sh'), 'doc', 'demo', '--repo', repo], { encoding: 'utf8' });
      expect(run()).toContain('created');
      const file = join(repo, '.midnite/media/doc/demo/demo.md');
      writeFileSync(file, '# mine\n');
      expect(run()).toContain('skipped');
      expect(readFileSync(file, 'utf8')).toBe('# mine\n');
      expect(existsSync(join(repo, '.midnite/media/doc/demo/demo.thread.json'))).toBe(false);
      expect(() => execFileSync('bash', [join(here, 'scaffold.sh'), 'doc', '../x', '--repo', repo], { stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
  it('accepts --no-llm as a no-op', () => {
    const repo = mkdtempSync(join(tmpdir(), 'scaffold-'));
    try {
      expect(execFileSync('bash', [join(here, 'scaffold.sh'), 'sfx', 'demo', '--repo', repo, '--no-llm'], { encoding: 'utf8' })).toContain('created');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
