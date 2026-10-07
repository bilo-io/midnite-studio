import {
  EditableMesh,
  encodeMeshBin,
  failure,
  MESH_BIN_HEADER_BYTES,
  ModelMeshRequestSchema,
  modelAssetHash,
  ok,
  type GitOpResult,
  type ModelMeshRequest,
} from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { encodePngRgba8 } from '../png/png-codec';
import { createSculptStore } from './sculpt-store';

/** A tetrahedron — the smallest closed mesh. */
function tetra(): Uint8Array {
  const mesh = new EditableMesh({
    positions: new Float32Array([0, 1, 0, -1, -1, 1, 1, -1, 1, 0, -1, -1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]),
  });
  return encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 1 });
}

let files: Map<string, Buffer>;
const store = () =>
  createSculptStore({
    readBytes: async (req) => {
      const hit = files.get(`${req.project}/${req.path}`);
      return hit ? ok(hit) : (failure('File not found.') as GitOpResult<Buffer>);
    },
    writeBytes: async (req) => {
      files.set(`${req.project}/${req.path}`, Buffer.from(req.data));
      return ok({ size: req.data.length, largeFile: false });
    },
  });

const scope = { repoId: 'r', project: 'heads', dir: 'bust', src: 'bust.mesh.bin' };
const req = (input: Record<string, unknown>): ModelMeshRequest => ModelMeshRequestSchema.parse({ ...scope, ...input });

beforeEach(() => {
  files = new Map();
});

describe('sculpt store', () => {
  it('writes a mesh, logs the save and reads the same bytes back', async () => {
    const bytes = tetra();
    const wrote = await store().handle(req({ op: 'write', data: bytes, ops: [{ kind: 'convert', at: '2026-10-06T00:00:00Z', by: 'user' }] }));
    expect(wrote).toMatchObject({ ok: true, value: { info: { src: 'bust.mesh.bin', hash: modelAssetHash(bytes), vertices: 4, triangles: 4, multiresLevel: 1 } } });
    expect(files.has('heads/bust/bust.mesh.bin')).toBe(true);

    const read = await store().handle(req({ op: 'read' }));
    expect(read.ok && Buffer.from(read.value.data!).equals(Buffer.from(bytes))).toBe(true);

    const ops = await store().handle(req({ op: 'readOps' }));
    expect(ops.ok && ops.value.entries!.map((e) => e.kind)).toEqual(['convert', 'save']);
    expect(ops.ok && ops.value.entries![1]!.hash).toBe(modelAssetHash(bytes));
  });

  it('refuses to write bytes that do not decode, and leaves nothing behind', async () => {
    const bad = tetra();
    bad[MESH_BIN_HEADER_BYTES] = bad[MESH_BIN_HEADER_BYTES]! ^ 0xff;
    const wrote = await store().handle(req({ op: 'write', data: bad }));
    expect(wrote.ok).toBe(false);
    expect(wrote).toMatchObject({ ok: false, message: expect.stringMatching(/checksum/) });
    expect(files.size).toBe(0);
  });

  it('writes a texture PNG and refuses anything else, or one past the size cap (Phase 104 Theme G)', async () => {
    const png = encodePngRgba8(new Uint8Array(4 * 4 * 4).fill(200), 4, 4);
    const wrote = await store().handle(req({ op: 'writeTexture', src: 'bust.p1.paint-albedo.abcd1234.png', data: png }));
    expect(wrote).toMatchObject({ ok: true, value: { texture: { src: 'bust.p1.paint-albedo.abcd1234.png', hash: modelAssetHash(new Uint8Array(png)), width: 4, height: 4 } } });
    expect(files.get('heads/bust/bust.p1.paint-albedo.abcd1234.png')!.equals(png)).toBe(true);
    expect(await store().handle(req({ op: 'writeTexture', src: 'x.png', data: new Uint8Array([1, 2, 3]) }))).toMatchObject({ ok: false, message: expect.stringMatching(/not a PNG/) });
    const huge = Buffer.from(png);
    huge.writeUInt32BE(8192, 16);
    expect(await store().handle(req({ op: 'writeTexture', src: 'x.png', data: huge }))).toMatchObject({ ok: false, message: expect.stringMatching(/4096/) });
    expect(ModelMeshRequestSchema.safeParse({ ...scope, op: 'writeTexture', src: '../x.png', data: png }).success).toBe(false);
  });

  it('answers a corrupt or missing file on read with a readable failure', async () => {
    expect(await store().handle(req({ op: 'read' }))).toMatchObject({ ok: false, message: expect.stringMatching(/missing/) });
    files.set('heads/bust/bust.mesh.bin', Buffer.from(tetra().subarray(0, 60)));
    expect(await store().handle(req({ op: 'read' }))).toMatchObject({ ok: false, message: expect.stringMatching(/truncated/) });
  });

  it('appends ops in order across concurrent calls', async () => {
    const s = store();
    await Promise.all(
      Array.from({ length: 10 }, (_, n) => s.handle(req({ op: 'appendOps', ops: [{ kind: 'stroke', at: '2026-10-06T00:00:00Z', data: { n } }] }))),
    );
    const ops = await s.handle(req({ op: 'readOps', limit: 3 }));
    expect(ops.ok && ops.value.entries!.map((e) => e.data?.n)).toEqual([7, 8, 9]);
  });

  it('keeps every path inside the project', () => {
    expect(ModelMeshRequestSchema.safeParse({ ...scope, op: 'read', dir: '../elsewhere' }).success).toBe(false);
    expect(ModelMeshRequestSchema.safeParse({ ...scope, op: 'read', src: '../x.mesh.bin' }).success).toBe(false);
  });
});

describe('loadModelAssets with sculpt parts', () => {
  it('registers a sculpt mesh by hash so the design builds, and reports a changed file', async () => {
    const { loadModelAssets } = await import('./model-assets');
    const { buildSceneChecked, clearModelAssets, ModelSpecSchema } = await import('@midnite/studio-shared');
    clearModelAssets();
    const bytes = tetra();
    const spec = ModelSpecSchema.parse({ parts: [{ name: 'bust', shape: 'sculpt', src: 'bust.mesh.bin', hash: modelAssetHash(bytes) }] });
    const read = async (r: { path: string }) => (r.path === 'bust/bust.mesh.bin' ? ok(Buffer.from(bytes)) : (failure('File not found.') as GitOpResult<Buffer>));
    expect(await loadModelAssets(read, { repoId: 'r', tab: 'model', project: 'heads' }, 'bust', spec)).toEqual([]);
    expect(buildSceneChecked(spec).parts[0]!.positions.length).toBe(12);

    clearModelAssets();
    const stale = ModelSpecSchema.parse({ parts: [{ name: 'bust', shape: 'sculpt', src: 'bust.mesh.bin', hash: '0'.repeat(32) }] });
    expect(await loadModelAssets(read, { repoId: 'r', tab: 'model', project: 'heads' }, 'bust', stale)).toEqual([expect.stringMatching(/has changed/)]);
    clearModelAssets();
  });
});
