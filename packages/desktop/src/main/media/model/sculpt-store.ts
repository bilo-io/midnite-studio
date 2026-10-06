import { WriteQueue } from '@midnite/studio-git-engine';
import {
  appendOps,
  decodeMeshBin,
  failure,
  MeshBinError,
  modelAssetHash,
  modelAssetPath,
  ok,
  opsLogPathFor,
  parseOpsLog,
  rotatedOpsLogPath,
  type GitOpResult,
  type MeshBin,
  type ModelMeshInfo,
  type ModelMeshRequest,
  type ModelMeshResult,
  type ModelOpEntry,
} from '@midnite/studio-shared';

/**
 * Sculpt mesh storage in main (Phase 104 Theme A): the `.mesh.bin` a `sculpt` part draws and the
 * `.ops.jsonl` beside it, read and written through the media store's jail (`dir`/`src` resolve inside
 * the model's project folder, never outside it).
 *
 * A write is refused unless the bytes decode — a renderer bug cannot leave a corrupt mesh on disk for
 * the next load to trip over — and answers the hash and counts the part should record. Op-log appends
 * are read-modify-write, so every op on one file runs through a per-file queue.
 */
type Scope = { repoId: string; tab: 'model'; project: string };

export type SculptStoreDeps = {
  readBytes: (req: Scope & { path: string }) => Promise<GitOpResult<Buffer>>;
  writeBytes: (req: Scope & { path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
};

const toBuffer = (data: ArrayBuffer | Uint8Array): Buffer =>
  data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
const asBytes = (buffer: Buffer): Uint8Array => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function info(src: string, bytes: Uint8Array, mesh: MeshBin): ModelMeshInfo {
  return {
    src,
    hash: modelAssetHash(bytes),
    vertices: mesh.positions.length / 3,
    triangles: mesh.indices.length / 3,
    multiresLevel: mesh.multiresLevel,
    bytes: bytes.byteLength,
  };
}

export function createSculptStore(deps: SculptStoreDeps) {
  const queue = new WriteQueue();

  const scopeOf = (req: ModelMeshRequest): Scope => ({ repoId: req.repoId, tab: 'model', project: req.project });
  const meshPath = (req: ModelMeshRequest): string => modelAssetPath(req.dir, req.src);
  const opsPath = (req: ModelMeshRequest): string => modelAssetPath(req.dir, opsLogPathFor(req.src));
  /** One queue key per mesh file, so its bin and log never interleave. */
  const key = (req: ModelMeshRequest): string => `${req.repoId}\0${req.project}\0${meshPath(req)}`;

  async function readText(scope: Scope, path: string): Promise<string> {
    const read = await deps.readBytes({ ...scope, path });
    return read.ok ? read.value.toString('utf8') : '';
  }

  async function append(req: ModelMeshRequest, ops: readonly ModelOpEntry[]): Promise<GitOpResult<{ rotated: boolean }>> {
    if (ops.length === 0) return ok({ rotated: false });
    const scope = scopeOf(req);
    const path = opsPath(req);
    let next: ReturnType<typeof appendOps>;
    try {
      next = appendOps(await readText(scope, path), ops);
    } catch (error) {
      return failure(`The op log entry was refused: ${describe(error)}`);
    }
    if (next.rotated !== null) {
      const moved = await deps.writeBytes({ ...scope, path: rotatedOpsLogPath(path), data: Buffer.from(next.rotated, 'utf8') });
      if (!moved.ok) return moved;
    }
    const wrote = await deps.writeBytes({ ...scope, path, data: Buffer.from(next.text, 'utf8') });
    return wrote.ok ? ok({ rotated: next.rotated !== null }) : wrote;
  }

  return {
    async handle(req: ModelMeshRequest): Promise<GitOpResult<ModelMeshResult>> {
      switch (req.op) {
        case 'read': {
          const read = await deps.readBytes({ ...scopeOf(req), path: meshPath(req) });
          if (!read.ok) return failure(`The sculpt mesh "${req.src}" is missing from the model's folder.`);
          const bytes = asBytes(read.value);
          try {
            return ok({ info: info(req.src, bytes, decodeMeshBin(bytes)), data: bytes });
          } catch (error) {
            return failure(error instanceof MeshBinError ? error.message : `The sculpt mesh "${req.src}" could not be read: ${describe(error)}`);
          }
        }
        case 'write': {
          const data = toBuffer(req.data);
          const bytes = asBytes(data);
          let mesh: MeshBin;
          try {
            mesh = decodeMeshBin(bytes);
          } catch (error) {
            return failure(`Refused to save the sculpt mesh: ${describe(error)}`);
          }
          const saved = info(req.src, bytes, mesh);
          return queue.run(key(req), async () => {
            const wrote = await deps.writeBytes({ ...scopeOf(req), path: meshPath(req), data });
            if (!wrote.ok) return wrote;
            const logged = await append(req, [
              ...(req.ops ?? []),
              { kind: 'save', at: new Date().toISOString(), hash: saved.hash, data: { vertices: saved.vertices, triangles: saved.triangles } },
            ]);
            if (!logged.ok) return logged;
            return ok({ info: saved, rotated: logged.value.rotated });
          });
        }
        case 'appendOps':
          return queue.run(key(req), async () => {
            const logged = await append(req, req.ops);
            return logged.ok ? ok({ rotated: logged.value.rotated }) : logged;
          });
        case 'readOps': {
          const { entries, skipped } = parseOpsLog(await readText(scopeOf(req), opsPath(req)));
          return ok({ entries: req.limit ? entries.slice(-req.limit) : entries, skipped });
        }
      }
    },
  };
}

export type SculptStore = ReturnType<typeof createSculptStore>;
