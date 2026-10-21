import { describe, expect, it } from 'vitest';

import {
  isModelPath,
  modelFileExtension,
  modelSidecarPath,
  MODEL_MAX_PARTS,
  ModelGenerateRequestSchema,
  ModelSpecSchema,
  parseModelSidecar,
} from './media-model';

const box = { shape: 'box', size: [1, 1, 1] };

describe('ModelSpecSchema', () => {
  it('fills defaults for an LLM that only names a shape and its size', () => {
    const spec = ModelSpecSchema.parse({ parts: [box] });
    expect(spec.name).toBe('model');
    expect(spec.parts[0]).toMatchObject({ name: 'part', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b0b0b0' });
  });

  it('accepts every shape', () => {
    const parts = [
      box,
      { shape: 'sphere', radius: 1 },
      { shape: 'cylinder', radiusTop: 0, radiusBottom: 1, height: 2 },
      { shape: 'cone', radius: 1, height: 2 },
      { shape: 'torus', radius: 2, tube: 0.4 },
      { shape: 'lathe', profile: [[0, 0], [1, 1]] },
      { shape: 'extrude', outline: [[0, 0], [1, 0], [0, 1]], height: 1 },
    ];
    expect(ModelSpecSchema.safeParse({ parts }).success).toBe(true);
  });

  it.each([
    ['an unknown shape', { parts: [{ shape: 'teapot' }] }],
    ['a non-positive size', { parts: [{ shape: 'box', size: [0, 1, 1] }] }],
    ['a bad colour', { parts: [{ ...box, color: 'red' }] }],
    ['a two-point outline', { parts: [{ shape: 'extrude', outline: [[0, 0], [1, 1]], height: 1 }] }],
    ['no parts', { parts: [] }],
    ['too many parts', { parts: Array.from({ length: MODEL_MAX_PARTS + 1 }, () => box) }],
    ['NaN coordinates', { parts: [{ ...box, position: [Number.NaN, 0, 0] }] }],
  ])('rejects %s', (_label, input) => {
    expect(ModelSpecSchema.safeParse(input).success).toBe(false);
  });
});

describe('ModelGenerateRequestSchema', () => {
  const base = {
    generationId: 'g1',
    repoId: 'r1',
    project: 'robots',
    engine: { kind: 'ollama', model: 'qwen2.5-coder:7b' },
  };

  it('needs a prompt, an image, or both', () => {
    expect(ModelGenerateRequestSchema.safeParse(base).success).toBe(false);
    expect(ModelGenerateRequestSchema.safeParse({ ...base, prompt: 'a chair' }).success).toBe(true);
    expect(
      ModelGenerateRequestSchema.safeParse({ ...base, image: { name: 'a.png', mime: 'image/png', data: 'AAAA' } }).success,
    ).toBe(true);
  });

  it('accepts an agent engine and rejects an unknown engine kind', () => {
    expect(ModelGenerateRequestSchema.safeParse({ ...base, prompt: 'x', engine: { kind: 'agent', agentId: 'claude' } }).success).toBe(true);
    expect(ModelGenerateRequestSchema.safeParse({ ...base, prompt: 'x', engine: { kind: 'cloud' } }).success).toBe(false);
  });

  it('rejects a project name that climbs out of the folder', () => {
    expect(ModelGenerateRequestSchema.safeParse({ ...base, prompt: 'x', project: '../x' }).success).toBe(false);
  });
});

describe('model files', () => {
  it('lists only obj and fbx', () => {
    expect(modelFileExtension('a/robot.OBJ')).toBe('obj');
    expect(modelFileExtension('robot.fbx')).toBe('fbx');
    expect(isModelPath('robot.mtl')).toBe(false);
    expect(isModelPath('robot.json')).toBe(false);
    expect(isModelPath('obj')).toBe(false);
  });

  it('puts the spec sidecar beside the model', () => {
    expect(modelSidecarPath('a/robot.obj')).toBe('a/robot.json');
  });

  it('reads a sidecar back and ignores foreign json', () => {
    const sidecar = {
      version: 1,
      name: 'robot',
      prompt: 'a robot',
      engine: 'ollama:qwen2.5-coder:7b',
      spec: { name: 'robot', parts: [box] },
      createdAt: '2026-10-03T00:00:00.000Z',
    };
    expect(parseModelSidecar(JSON.stringify(sidecar))?.spec.parts).toHaveLength(1);
    expect(parseModelSidecar('{"hello":1}')).toBeNull();
    expect(parseModelSidecar('not json')).toBeNull();
  });
});

describe('schema growth is back-compatible (no sidecar version bump)', () => {
  // A sidecar exactly as Phase 99 Theme F/G wrote it.
  const legacy = JSON.stringify({
    version: 1,
    name: 'mug-20260101-000000',
    prompt: 'a mug',
    engine: 'ollama:qwen2.5-coder:7b',
    createdAt: '2026-01-01T00:00:00.000Z',
    spec: {
      name: 'mug',
      parts: [
        { name: 'cup', shape: 'cylinder', radiusTop: 0.4, radiusBottom: 0.35, height: 0.8, color: '#cc3333' },
        { id: 'p2', name: 'handle', shape: 'torus', radius: 0.25, tube: 0.05, position: [0.5, 0.4, 0], rotation: [90, 0, 0], color: '#cc3333' },
        { name: 'top', shape: 'lathe', profile: [[0, 0], [1, 0], [1, 1]], color: '#fff' },
      ],
    },
  });

  it('loads unchanged and gains no keys it did not have', () => {
    const sidecar = parseModelSidecar(legacy)!;
    expect(sidecar).not.toBeNull();
    for (const part of sidecar.spec.parts) {
      expect(part).not.toHaveProperty('modifiers');
      expect(part).not.toHaveProperty('material');
      expect(part).not.toHaveProperty('op');
      expect(part).not.toHaveProperty('parent');
      expect(part.scale).toEqual([1, 1, 1]);
    }
    // Re-serialising and re-parsing is a fixed point.
    expect(parseModelSidecar(JSON.stringify(sidecar))).toEqual(sidecar);
  });

  it('accepts the new fields and rejects bad ones', () => {
    const parsed = ModelSpecSchema.safeParse({
      parts: [
        { shape: 'box', size: [1, 1, 1], scale: [-1, 1, 1], material: { metalness: 0.5 }, modifiers: [{ type: 'subdivide' }] },
        { shape: 'tube', path: [[0, 0, 0], [1, 1, 1]], radius: 0.1 },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.parts[0]).toMatchObject({ modifiers: [{ type: 'subdivide', levels: 1 }] });
    expect(ModelSpecSchema.safeParse({ parts: [{ shape: 'box', size: [1, 1, 1], scale: [0, 1, 1] }] }).success).toBe(false);
    expect(ModelSpecSchema.safeParse({ parts: [{ shape: 'box', size: [1, 1, 1], material: { metalness: 2 } }] }).success).toBe(false);
    expect(ModelSpecSchema.safeParse({ parts: [{ shape: 'box', size: [1, 1, 1], modifiers: [{ type: 'explode' }] }] }).success).toBe(false);
    expect(ModelSpecSchema.safeParse({ parts: [{ shape: 'mesh', vertices: [[0, 0, 0]], faces: [[0, 0, 0]] }] }).success).toBe(false);
  });
});
