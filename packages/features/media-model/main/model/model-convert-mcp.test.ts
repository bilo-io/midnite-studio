import { decodeMeshBin, isClosed, parseModelSidecar } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { memoryModelKit } from './model-test-kit';

/** vitest: model_convert_to_mesh over the in-memory store. */

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });

const PILL = {
  name: 'pill',
  parts: [
    { name: 'body', shape: 'capsule', radius: 0.4, height: 0.8, color: '#3366cc' },
    { name: 'cap', shape: 'sphere', radius: 0.3, position: [0, 0.8, 0], color: '#cc3333' },
  ],
};

describe('model_convert_to_mesh', () => {
  it('writes a watertight .mesh.bin and its op log, hides the primitives and announces the edit', async () => {
    const kit = memoryModelKit();
    const made = await kit.tools.model_set_spec({ ...target(kit, 'pill'), spec: PILL });
    if (!made.ok) throw new Error(JSON.stringify(made.errors));
    const result = await kit.tools.model_convert_to_mesh({ ...target(kit, made.model), targetVertices: 3000 });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.converted).toMatchObject({ groups: ['body', 'cap'], sources: ['p1', 'p2'] });
    expect(result.parts.map((p) => p.shape)).toEqual(['capsule', 'sphere', 'sculpt']);

    const dir = made.model.split('/')[0]!;
    const meshKey = `gen/${dir}/${result.converted!.src}`;
    const bin = decodeMeshBin(new Uint8Array(kit.files.get(meshKey)!));
    expect(bin.groups).toBeDefined();
    expect(isClosed({ positions: Array.from(bin.positions), indices: Array.from(bin.indices) })).toBe(true);
    expect(kit.files.has(meshKey.replace('.mesh.bin', '.ops.jsonl'))).toBe(true);

    const spec = parseModelSidecar(kit.files.get(`gen/${made.model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!.spec;
    expect(spec.parts.map((p) => p.hidden === true)).toEqual([true, true, false]);
    expect(kit.changed.at(-1)!.spec.parts).toHaveLength(3);
    expect(result.triangles).toBeGreaterThan(1000);
  });

  it('converts only the named parts and answers an unknown name as a validation result', async () => {
    const kit = memoryModelKit();
    const made = await kit.tools.model_set_spec({ ...target(kit, 'pill'), spec: PILL });
    if (!made.ok) throw new Error('setup');
    const bad = await kit.tools.model_convert_to_mesh({ ...target(kit, made.model), parts: ['ghost'] });
    expect(bad).toMatchObject({ ok: false, errors: [{ path: 'parts' }] });
    const one = await kit.tools.model_convert_to_mesh({ ...target(kit, made.model), parts: ['cap'], targetVertices: 2000 });
    if (!one.ok) throw new Error(JSON.stringify(one.errors));
    expect(one.converted!.groups).toEqual(['cap']);
    expect(one.parts.map((p) => p.shape)).toEqual(['capsule', 'sphere', 'sculpt']);
  });
});
