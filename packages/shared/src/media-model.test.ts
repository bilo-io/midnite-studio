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
