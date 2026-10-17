import { readFile } from 'node:fs/promises';

import type { Sf3dAssets, Sf3dInference } from './pipeline';
import { parseColorMlp } from './triplane';

/**
 * `Sf3dInference` on `onnxruntime-node` — the runtime the app already ships for its local voice and
 * music engines (it arrives as `@huggingface/transformers`' own dependency), so SF3D adds no native
 * module and no Python. Runs only inside `sf3d-worker`'s utility process.
 *
 * The ORT surface is typed structurally (`OrtModule`), so this file needs no type package and the
 * tests can hand it a fake module.
 */
export type OrtTensor = { type: string; data: ArrayLike<number> | Float32Array | Uint16Array; dims: readonly number[] };
export type OrtSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
  release?: () => Promise<void>;
};
export type OrtModule = {
  InferenceSession: { create: (path: string, options?: Record<string, unknown>) => Promise<OrtSession> };
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown;
};

/** IEEE half → float, for an fp16 output a graph forgot to cast back. */
function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function toFloat32(tensor: OrtTensor): Float32Array {
  if (tensor.type === 'float32') return tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data as ArrayLike<number>);
  if (tensor.type === 'float16') return Float32Array.from(tensor.data as ArrayLike<number>, halfToFloat);
  throw new Error(`Unexpected ${tensor.type} tensor from SF3D.`);
}

const pick = (outputs: Record<string, OrtTensor>, session: OrtSession, name: string, fallback: number): OrtTensor => {
  const tensor = outputs[name] ?? outputs[session.outputNames[fallback]!];
  if (!tensor) throw new Error(`SF3D's graph returned no "${name}".`);
  return tensor;
};

/** Reads the grid and colour-head files from the install directory. */
export async function loadSf3dAssets(path: (asset: string) => string): Promise<Sf3dAssets> {
  const copy = (buf: Buffer) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const vertices = new Float32Array(copy(await readFile(path('tets_vertices.bin'))));
  const indices = new Int32Array(copy(await readFile(path('tets_indices.bin'))));
  if (vertices.length % 3 !== 0 || indices.length % 4 !== 0) throw new Error('The SF3D tet grid files are malformed; reinstall SF3D.');
  const mlp = parseColorMlp(JSON.parse(await readFile(path('features_mlp_weights.json'), 'utf8')));
  return { grid: { vertices, indices }, mlp };
}

/**
 * Sessions are created on first use and kept for the next generation; the worker process is the unit
 * of release (a cancel or an uninstall kills it).
 */
export function createOrtInference(ort: OrtModule, path: (asset: string) => string): Sf3dInference {
  const sessions = new Map<string, Promise<OrtSession>>();
  const session = (file: string) => {
    let s = sessions.get(file);
    if (!s) {
      s = ort.InferenceSession.create(path(file), { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
      sessions.set(file, s);
    }
    return s;
  };
  const tensor = (data: Float32Array, dims: number[]) => new ort.Tensor('float32', data, dims);

  return {
    async tokenize({ rgb, c2w, intrinsicNormed }) {
      const s = await session('onnx/image_tokenizer_single.onnx');
      const feeds: Record<string, unknown> = {};
      for (const name of s.inputNames) {
        if (name === 'rgb') feeds[name] = tensor(rgb, [1, 512, 512, 3]);
        else if (name === 'c2w') feeds[name] = tensor(c2w, [1, 4, 4]);
        else if (name === 'intrinsic_normed') feeds[name] = tensor(intrinsicNormed, [1, 3, 3]);
        else throw new Error(`SF3D's image tokenizer wants an input "${name}" this build does not know.`);
      }
      const out = await s.run(feeds);
      return toFloat32(out[s.outputNames[0]!]!);
    },
    async backbone(tokens) {
      const s = await session('onnx/backbone_fp16.onnx');
      const out = await s.run({ [s.inputNames[0]!]: tensor(tokens, [1, tokens.length / 1024, 1024]) });
      return toFloat32(pick(out, s, 'triplane', 0));
    },
    async decode(triplane, positions) {
      const s = await session('onnx/decoder_single.onnx');
      const channels = 40;
      const res = Math.round(Math.sqrt(triplane.length / (3 * channels)));
      const out = await s.run({
        triplane: tensor(triplane, [1, 3, channels, res, res]),
        positions: tensor(Float32Array.from(positions), [1, positions.length / 3, 3]),
      });
      return { density: toFloat32(pick(out, s, 'density', 0)), offset: toFloat32(pick(out, s, 'vertex_offset', 1)) };
    },
  };
}
