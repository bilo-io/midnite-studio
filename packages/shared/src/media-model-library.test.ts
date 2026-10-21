import { describe, expect, it } from 'vitest';

import { type ModelSidecar, type ModelSpec, ModelSpecSchema } from './media-model';
import {
  agentFromEngine,
  buildModelManifest,
  computeModelDetails,
  isWithinLibraryPath,
  ModelLibraryRequestSchema,
  modelRigSummary,
  parseModelManifest,
} from './media-model-library';
import { autoRig, RIG_EXAMPLE_BIPED } from './model-geometry';

const autoRigged = (base: ModelSpec): ModelSpec => ({
  ...base,
  anatomy: 'biped',
  rig: autoRig(base, 'biped')!,
  animations: [{ name: 'walk', kind: 'walk' }],
});

const spec = ModelSpecSchema.parse({
  name: 'Crate',
  parts: [
    { name: 'body', shape: 'box', size: [2, 1, 1], position: [0, 0.5, 0], color: '#aa7744' },
    { name: 'lid', shape: 'box', size: [2, 0.1, 1], position: [0, 1.05, 0], color: '#aa7744' },
    { name: 'glow', shape: 'sphere', radius: 0.2, position: [0, 0.5, 0], color: '#ffffff', material: { emissive: '#ffcc00', metalness: 0.5 } },
  ],
});

const sidecar: ModelSidecar = {
  version: 1,
  name: 'crate-1',
  prompt: 'a wooden crate',
  engine: 'agent:claude:sonnet-5 (iterative)',
  reference: 'crate-1.ref.png',
  imageDescription: 'a box',
  spec,
  createdAt: '2026-10-03T10:00:00.000Z',
};

describe('model.json', () => {
  it('derives the agent from the engine label, naming the specific model', () => {
    expect(agentFromEngine('ollama:qwen2.5-coder:7b')).toEqual({ provider: 'ollama', model: 'qwen2.5-coder:7b' });
    expect(agentFromEngine('agent:claude:sonnet-5 (iterative)')).toEqual({ provider: 'claude', model: 'sonnet-5', iterative: true });
    expect(agentFromEngine('agent:codex')).toEqual({ provider: 'codex' });
    expect(agentFromEngine('mcp')).toEqual({ provider: 'mcp' });
  });

  it('counts vertices, polygons, parts, bounds and distinct materials from the built design', () => {
    const details = computeModelDetails(spec);
    expect(details.parts).toBe(3);
    expect(details.vertices).toBeGreaterThan(0);
    expect(details.polygons).toBeGreaterThan(12);
    expect(details.bounds.size[0]).toBeCloseTo(2, 2);
    expect(details.bounds.min[1]).toBeCloseTo(0, 2);
    // the two wooden boxes share one material; the glowing ball is its own
    expect(details.materials).toHaveLength(2);
    expect(details.materials.find((m) => m.color === '#aa7744')?.parts).toBe(2);
  });

  it('builds a valid manifest: agent, author, prompt, attachment, details, files, timestamp', () => {
    const manifest = buildModelManifest({
      sidecar,
      stem: 'crate-1',
      author: { name: 'Bilo', email: 'b@example.com' },
      now: new Date('2026-10-03T11:00:00.000Z'),
      present: ['crate-1.json', 'crate-1.obj', 'crate-1.fbx', 'crate-1.glb'],
    });
    expect(parseModelManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(manifest).toMatchObject({
      version: 1,
      name: 'Crate',
      agent: { provider: 'claude', model: 'sonnet-5', iterative: true },
      author: { name: 'Bilo' },
      prompt: 'a wooden crate',
      attachment: { file: 'crate-1.ref.png', description: 'a box' },
      files: { design: 'crate-1.json', obj: 'crate-1.obj', fbx: 'crate-1.fbx', glb: 'crate-1.glb' },
      createdAt: '2026-10-03T10:00:00.000Z',
      updatedAt: '2026-10-03T11:00:00.000Z',
    });
  });

  it('a re-save keeps the author, label, creation time and fields this build does not know', () => {
    const first = buildModelManifest({ sidecar, stem: 'crate-1', author: { name: 'Bilo' }, now: new Date('2026-10-03T11:00:00.000Z') });
    const richer = { ...first, name: 'My crate', future: 1 };
    const parsed = parseModelManifest(JSON.stringify(richer))!;
    const again = buildModelManifest({ sidecar, stem: 'crate-1', author: { name: 'Someone else' }, now: new Date('2026-10-04T00:00:00.000Z'), previous: parsed });
    expect(again).toMatchObject({ name: 'My crate', author: { name: 'Bilo' }, future: 1 });
    expect(again.createdAt).toBe('2026-10-03T10:00:00.000Z');
    expect(again.updatedAt).toBe('2026-10-04T00:00:00.000Z');
  });

  it('summarises the rig from the design, and drops a stale summary once the rig is gone', () => {
    const rigged = autoRigged(RIG_EXAMPLE_BIPED);
    const manifest = buildModelManifest({ sidecar: { ...sidecar, spec: rigged }, stem: 'bot', author: { name: 'Bilo' }, now: new Date('2026-10-03T11:00:00.000Z') });
    expect(manifest.anatomy).toBe('biped');
    expect(manifest.rig).toMatchObject({ bones: rigged.rig!.bones.length, facing: '+z' });
    expect(manifest.animations).toEqual([{ name: 'walk', kind: 'walk', duration: 1.1, loop: true }]);
    expect(modelRigSummary(rigged).animations).toEqual(manifest.animations);
    const stale = parseModelManifest(JSON.stringify({ ...manifest, rig: { bones: 99 } }))!;
    const plain = buildModelManifest({ sidecar, stem: 'crate-1', author: { name: 'Bilo' }, now: new Date('2026-10-04T00:00:00.000Z'), previous: stale });
    expect(plain.anatomy).toBeUndefined();
    expect(plain.rig).toBeUndefined();
    expect(plain.animations).toBeUndefined();
  });

  it('rejects text that is not a manifest', () => {
    expect(parseModelManifest('nope')).toBeNull();
    expect(parseModelManifest(JSON.stringify({ version: 2 }))).toBeNull();
  });
});

describe('library requests', () => {
  it('accepts each op and refuses a multi-segment or dotted name', () => {
    expect(ModelLibraryRequestSchema.safeParse({ op: 'list', repoId: 'r' }).success).toBe(true);
    expect(ModelLibraryRequestSchema.safeParse({ op: 'move', repoId: 'r', path: 'a/b', toGroup: '' }).success).toBe(true);
    expect(ModelLibraryRequestSchema.safeParse({ op: 'rename', repoId: 'r', path: 'a', to: 'x/y' }).success).toBe(false);
    expect(ModelLibraryRequestSchema.safeParse({ op: 'newGroup', repoId: 'r', parent: '', name: '.hidden' }).success).toBe(false);
  });

  it('knows a path is inside another only on a segment boundary', () => {
    expect(isWithinLibraryPath('a/b', 'a/b/c')).toBe(true);
    expect(isWithinLibraryPath('a/b', 'a/b')).toBe(true);
    expect(isWithinLibraryPath('a/b', 'a/bc')).toBe(false);
  });
});
