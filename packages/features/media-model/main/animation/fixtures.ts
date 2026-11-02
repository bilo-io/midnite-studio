import { deflateSync } from 'node:zlib';

import { FBX_TICKS_PER_SECOND } from './parse-fbx';

/**
 * Tiny hand-built clip files for the animation tests (Phase 125 Theme B): a binary FBX shaped like Mixamo's
 * export (with or without a mesh), a GLB, a glTF and a BVH — a few hundred bytes each, no binary assets in the
 * repo. Only the nodes the metadata reader looks at are written.
 */

type Prop =
  | { t: 'S'; v: string }
  | { t: 'I'; v: number }
  | { t: 'L'; v: bigint }
  | { t: 'l'; v: bigint[]; compress?: boolean }
  | { t: 'R'; v: Uint8Array };
export type FbxNode = { name: string; props?: Prop[]; children?: FbxNode[] };

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function encodeProp(p: Prop): Buffer {
  switch (p.t) {
    case 'S': {
      const s = Buffer.from(p.v, 'utf8');
      return Buffer.concat([Buffer.from('S'), u32(s.length), s]);
    }
    case 'I':
      return Buffer.concat([Buffer.from('I'), (() => { const b = Buffer.alloc(4); b.writeInt32LE(p.v); return b; })()]);
    case 'L': {
      const b = Buffer.alloc(8);
      b.writeBigInt64LE(p.v);
      return Buffer.concat([Buffer.from('L'), b]);
    }
    case 'R':
      return Buffer.concat([Buffer.from('R'), u32(p.v.length), Buffer.from(p.v)]);
    case 'l': {
      const raw = Buffer.alloc(p.v.length * 8);
      p.v.forEach((x, i) => raw.writeBigInt64LE(x, i * 8));
      const data = p.compress ? deflateSync(raw) : raw;
      return Buffer.concat([Buffer.from('l'), u32(p.v.length), u32(p.compress ? 1 : 0), u32(data.length), data]);
    }
  }
}

/** One node record at absolute file offset `at` (FBX 7.4: 32-bit offsets, 13-byte null record; 7.5+: 64-bit, 25). */
export function encodeNode(node: FbxNode, at: number, wide = false): Buffer {
  const name = Buffer.from(node.name, 'latin1');
  const props = Buffer.concat((node.props ?? []).map(encodeProp));
  const fixed = wide ? 25 : 13;
  const headerLen = fixed + name.length + props.length;
  const parts: Buffer[] = [];
  let cursor = at + headerLen;
  for (const child of node.children ?? []) {
    const encoded = encodeNode(child, cursor, wide);
    parts.push(encoded);
    cursor += encoded.length;
  }
  if (parts.length > 0) {
    parts.push(Buffer.alloc(fixed));
    cursor += fixed;
  }
  const head = Buffer.alloc(fixed);
  if (wide) {
    head.writeBigUInt64LE(BigInt(cursor), 0);
    head.writeBigUInt64LE(BigInt((node.props ?? []).length), 8);
    head.writeBigUInt64LE(BigInt(props.length), 16);
    head.writeUInt8(name.length, 24);
  } else {
    head.writeUInt32LE(cursor, 0);
    head.writeUInt32LE((node.props ?? []).length, 4);
    head.writeUInt32LE(props.length, 8);
    head.writeUInt8(name.length, 12);
  }
  return Buffer.concat([head, name, props, ...parts]);
}

export function encodeFbx(nodes: FbxNode[], version = 7400): Buffer {
  const header = Buffer.concat([Buffer.from('Kaydara FBX Binary  \0'), Buffer.from([0x1a, 0x00]), u32(version)]);
  const parts: Buffer[] = [header];
  let at = header.length;
  const wide = version >= 7500;
  for (const node of nodes) {
    const encoded = encodeNode(node, at, wide);
    parts.push(encoded);
    at += encoded.length;
  }
  parts.push(Buffer.alloc(wide ? 25 : 13));
  return Buffer.concat(parts);
}

const named = (name: string, cls: string) => ({ t: 'S' as const, v: `${name}\0\x01${cls}` });
const s = (v: string) => ({ t: 'S' as const, v });
const L = (v: number | bigint) => ({ t: 'L' as const, v: BigInt(v) });

export type FbxOptions = {
  bones?: string[];
  seconds?: number;
  keys?: number;
  skin?: boolean;
  compress?: boolean;
  /** Omit the AnimationStack range so the reader falls back to the key times. */
  noStackRange?: boolean;
  noAnimation?: boolean;
  /** FBX 7.5+'s 64-bit node records. */
  wide?: boolean;
};

/** A Mixamo-shaped clip: a hip-to-head bone chain, one stack, a curve per bone, optionally a skinned mesh. */
export function buildFbx(options: FbxOptions = {}): Buffer {
  const bones = options.bones ?? ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head'];
  const seconds = options.seconds ?? 1;
  const keys = options.keys ?? 31;
  const ticks = BigInt(Math.round(seconds * FBX_TICKS_PER_SECOND));
  const keyTimes = Array.from({ length: keys }, (_, i) => (ticks * BigInt(i)) / BigInt(Math.max(1, keys - 1)));
  const objects: FbxNode[] = bones.map((b, i) => ({ name: 'Model', props: [L(100 + i), named(b, 'Model'), s('LimbNode')] }));
  if (options.skin) {
    objects.push({ name: 'Geometry', props: [L(200), named('Body', 'Geometry'), s('Mesh')], children: [{ name: 'Vertices', props: [{ t: 'R', v: new Uint8Array(64) }] }] });
    objects.push({ name: 'Deformer', props: [L(201), named('Skin', 'Deformer'), s('Skin')] });
  }
  if (!options.noAnimation) {
    objects.push({
      name: 'AnimationStack',
      props: [L(300), named('mixamo.com', 'AnimStack'), s('')],
      children: options.noStackRange
        ? []
        : [
            {
              name: 'Properties70',
              children: [
                { name: 'P', props: [s('LocalStart'), s('KTime'), s('Time'), s(''), L(0)] },
                { name: 'P', props: [s('LocalStop'), s('KTime'), s('Time'), s(''), L(ticks)] },
              ],
            },
          ],
    });
    bones.forEach((_, i) =>
      objects.push({ name: 'AnimationCurve', props: [L(400 + i), named('', 'AnimCurve'), s('')], children: [{ name: 'KeyTime', props: [{ t: 'l', v: keyTimes, compress: options.compress ?? true }] }] }),
    );
  }
  const version = options.wide ? 7700 : 7400;
  return encodeFbx([{ name: 'FBXHeaderExtension', children: [{ name: 'FBXVersion', props: [{ t: 'I', v: version }] }] }, { name: 'Objects', children: objects }], version);
}

export function buildGlb(json: object): Buffer {
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4 !== 0) text += ' ';
  const body = Buffer.from(text);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + body.length, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(body.length, 0);
  chunk.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunk, body]);
}

/** A one-clip glTF document: 60 keys over 2 seconds, a three-joint skin and a mesh. */
export const GLTF_DOC = {
  asset: { version: '2.0' },
  nodes: [{ name: 'Hips' }, { name: 'Spine' }, { name: 'Head' }, { name: 'Body', mesh: 0, skin: 0 }],
  skins: [{ joints: [0, 1, 2] }],
  meshes: [{ primitives: [] }],
  accessors: [{ count: 60, min: [0], max: [2] }, { count: 60 }],
  animations: [{ name: 'Walk', samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }],
};

export const BVH_TEXT = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 10 0
    }
  }
}
MOTION
Frames: 120
Frame Time: 0.0083333
${'0 0 0 0 0 0 0 0 0\n'.repeat(3)}`;
