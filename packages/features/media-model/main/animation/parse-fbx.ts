import { inflateSync } from 'node:zlib';

import { ClipParseError, fpsFrom, type ClipMeta } from './clip-meta';

/**
 * A read-only FBX reader for the library's metadata (Phase 125 Theme B): duration, key count, bone names and
 * whether a mesh and skin are present. It is not a loader — Theme D decodes the motion with three's FBXLoader.
 *
 * Binary FBX (what Mixamo exports) is a tree of node records. Only the nodes the metadata needs are decoded:
 * `Objects` → `Model` / `Deformer` / `Geometry` / `AnimationStack` / `AnimationCurve`. Geometry and embedded
 * media are stepped over by their end offset without reading a byte of them, and an array is inflated only for
 * a `KeyTime`. ASCII FBX gets a regex pass for the same facts.
 */

/** FBX's `KTime`: 46 186 158 000 ticks to the second. */
export const FBX_TICKS_PER_SECOND = 46_186_158_000;

const MAGIC = 'Kaydara FBX Binary  \0';
const HEADER_BYTES = 27; // the 21-byte magic, 0x1A 0x00, and the u32 version
const MAX_DEPTH = 24;
/** Nodes whose children are never needed: stepped over by their end offset. */
const SKIP_CHILDREN = new Set(['Geometry', 'Video', 'Texture', 'Material', 'Pose', 'NodeAttribute', 'Definitions', 'Connections', 'Documents', 'References']);
/** The largest `KeyTime` array inflated (8 bytes a key); a bigger declared length is refused, not allocated. */
const MAX_KEYS = 5_000_000;

type Value = string | number | bigint | boolean | null;
type Node = { name: string; props: Value[]; keyTimes?: BigInt64Array; children: Node[] };

class Reader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
}

function readNodes(r: Reader, start: number, end: number, wide: boolean, depth: number): Node[] {
  const nodes: Node[] = [];
  let at = start;
  const headerLen = wide ? 25 : 13;
  while (at + headerLen <= end) {
    const endOffset = wide ? Number(r.view.getBigUint64(at, true)) : r.view.getUint32(at, true);
    if (endOffset === 0) return nodes; // the null record that closes a node list
    const numProps = wide ? Number(r.view.getBigUint64(at + 8, true)) : r.view.getUint32(at + 4, true);
    const propsLen = wide ? Number(r.view.getBigUint64(at + 16, true)) : r.view.getUint32(at + 8, true);
    const nameLen = r.view.getUint8(at + (wide ? 24 : 12));
    const nameStart = at + headerLen;
    const propsStart = nameStart + nameLen;
    const propsEnd = propsStart + propsLen;
    if (endOffset > r.bytes.length || endOffset < propsEnd || propsEnd > end || endOffset > end) throw new ClipParseError('The FBX file is truncated or corrupt');
    const name = Buffer.from(r.bytes.subarray(nameStart, nameStart + nameLen)).toString('latin1');
    const node: Node = { name, props: [], children: [] };
    const wantKeys = name === 'KeyTime';
    readProps(r, propsStart, propsEnd, numProps, node, wantKeys);
    // Children sit between the properties and the end offset, closed by a null record.
    if (propsEnd < endOffset && depth < MAX_DEPTH && !SKIP_CHILDREN.has(name)) {
      node.children = readNodes(r, propsEnd, endOffset, wide, depth + 1);
    }
    nodes.push(node);
    at = endOffset;
  }
  return nodes;
}

function readProps(r: Reader, start: number, end: number, count: number, node: Node, wantKeys: boolean): void {
  let at = start;
  for (let i = 0; i < count && at < end; i += 1) {
    const type = String.fromCharCode(r.view.getUint8(at));
    at += 1;
    switch (type) {
      case 'Y':
        node.props.push(r.view.getInt16(at, true));
        at += 2;
        break;
      case 'C':
        node.props.push(r.view.getUint8(at) !== 0);
        at += 1;
        break;
      case 'I':
        node.props.push(r.view.getInt32(at, true));
        at += 4;
        break;
      case 'F':
        node.props.push(r.view.getFloat32(at, true));
        at += 4;
        break;
      case 'D':
        node.props.push(r.view.getFloat64(at, true));
        at += 8;
        break;
      case 'L':
        node.props.push(r.view.getBigInt64(at, true));
        at += 8;
        break;
      case 'S':
      case 'R': {
        const len = r.view.getUint32(at, true);
        at += 4;
        if (at + len > end) throw new ClipParseError('The FBX file is truncated or corrupt');
        node.props.push(type === 'S' ? Buffer.from(r.bytes.subarray(at, at + len)).toString('utf8') : null);
        at += len;
        break;
      }
      case 'f':
      case 'd':
      case 'l':
      case 'i':
      case 'b': {
        const length = r.view.getUint32(at, true);
        const encoding = r.view.getUint32(at + 4, true);
        const compressed = r.view.getUint32(at + 8, true);
        at += 12;
        if (at + compressed > end) throw new ClipParseError('The FBX file is truncated or corrupt');
        if (wantKeys && type === 'l' && length <= MAX_KEYS) {
          const raw = r.bytes.subarray(at, at + compressed);
          const data = encoding === 1 ? inflateSync(raw, { maxOutputLength: length * 8 }) : raw;
          if (data.byteLength >= length * 8) {
            // Copy: the array view must be 8-byte aligned, which a subarray of a larger file is not.
            const copy = new Uint8Array(length * 8);
            copy.set(data.subarray(0, length * 8));
            node.keyTimes = new BigInt64Array(copy.buffer);
          }
        }
        node.props.push(null);
        at += compressed;
        break;
      }
      default:
        throw new ClipParseError(`The FBX file has an unknown property type "${type}"`);
    }
  }
}

/** `Name\0\x01Class` → `Name`. FBX packs a name and its class into one string. */
function objectName(value: Value | undefined): string {
  if (typeof value !== 'string') return '';
  const cut = value.indexOf('\0\x01');
  return cut >= 0 ? value.slice(0, cut) : value;
}

function ticksToSeconds(value: Value | undefined): number | null {
  if (typeof value === 'bigint') return Number(value) / FBX_TICKS_PER_SECOND;
  if (typeof value === 'number' && Number.isFinite(value)) return value / FBX_TICKS_PER_SECOND;
  return null;
}

/** A `Properties70` entry's value by name: `P: "LocalStop", "KTime", "Time", "", 46186158000`. */
function property70(node: Node, key: string): Value | undefined {
  const table = node.children.find((c) => c.name === 'Properties70');
  const row = table?.children.find((p) => p.name === 'P' && p.props[0] === key);
  return row?.props[4];
}

export function parseFbx(bytes: Uint8Array): ClipMeta {
  if (bytes.length >= 20 && Buffer.from(bytes.subarray(0, 20)).toString('latin1') === MAGIC.slice(0, 20)) return parseBinary(bytes);
  // ASCII FBX opens with a `; FBX 7.x.x project file` comment.
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 256))).toString('utf8');
  if (/^\s*;\s*FBX\s+\d/.test(head) || head.includes('FBXHeaderExtension')) return parseAscii(Buffer.from(bytes).toString('utf8'));
  throw new ClipParseError('This is not an FBX file');
}

function parseBinary(bytes: Uint8Array): ClipMeta {
  if (bytes.length < HEADER_BYTES) throw new ClipParseError('The FBX file is truncated or corrupt');
  const r = new Reader(bytes);
  const version = r.view.getUint32(23, true);
  const wide = version >= 7500;
  const top = readNodes(r, HEADER_BYTES, bytes.length, wide, 0);
  const objects = top.find((n) => n.name === 'Objects');
  if (!objects) throw new ClipParseError('The FBX file has no Objects section');

  const warnings: string[] = [];
  const boneNames: string[] = [];
  const otherModels: string[] = [];
  let hasSkin = false;
  let takeName: string | undefined;
  let stackSeconds: number | null = null;
  let minKey = Infinity;
  let maxKey = -Infinity;
  let maxKeys = 0;
  let curves = 0;
  let stacks = 0;

  for (const node of objects.children) {
    switch (node.name) {
      case 'Model': {
        const name = objectName(node.props[1]);
        const kind = node.props[2];
        if (kind === 'LimbNode') boneNames.push(name);
        else if (kind !== 'Mesh' && kind !== 'Camera' && kind !== 'Light') otherModels.push(name);
        break;
      }
      case 'Geometry':
        if (node.props[2] === 'Mesh') hasSkin = true;
        break;
      case 'Deformer':
        if (node.props[2] === 'Skin') hasSkin = true;
        break;
      case 'AnimationStack': {
        stacks += 1;
        if (takeName === undefined) takeName = objectName(node.props[1]) || undefined;
        const start = ticksToSeconds(property70(node, 'LocalStart')) ?? 0;
        const stop = ticksToSeconds(property70(node, 'LocalStop'));
        if (stop !== null) stackSeconds = Math.max(stackSeconds ?? 0, stop - start);
        break;
      }
      case 'AnimationCurve': {
        curves += 1;
        const keys = node.children.find((c) => c.name === 'KeyTime')?.keyTimes;
        if (keys && keys.length > 0) {
          maxKeys = Math.max(maxKeys, keys.length);
          const first = Number(keys[0]);
          const last = Number(keys[keys.length - 1]);
          minKey = Math.min(minKey, first);
          maxKey = Math.max(maxKey, last);
        }
        break;
      }
      default:
    }
  }

  if (curves === 0 && stacks === 0) throw new ClipParseError('This FBX file has no animation');
  let durationSec = stackSeconds !== null && stackSeconds > 0 ? stackSeconds : null;
  if (durationSec === null && Number.isFinite(maxKey) && maxKey > minKey) durationSec = (maxKey - minKey) / FBX_TICKS_PER_SECOND;
  if (durationSec === null) warnings.push('The duration could not be read from this FBX file.');
  if (stacks > 1) warnings.push(`This FBX file holds ${stacks} takes; the longest is shown.`);
  const frameCount = maxKeys > 0 ? maxKeys : undefined;
  const bones = boneNames.length > 0 ? boneNames : otherModels;
  return { durationSec, frameCount, fps: fpsFrom(frameCount, durationSec), boneNames: bones, hasSkin, takeName, warnings };
}

function parseAscii(text: string): ClipMeta {
  const warnings: string[] = [];
  const stops = [...text.matchAll(/P:\s*"LocalStop"\s*,\s*"KTime"\s*,\s*"Time"\s*,\s*""\s*,\s*(-?\d+)/g)].map((m) => Number(m[1]));
  const starts = [...text.matchAll(/P:\s*"LocalStart"\s*,\s*"KTime"\s*,\s*"Time"\s*,\s*""\s*,\s*(-?\d+)/g)].map((m) => Number(m[1]));
  const bones = [...text.matchAll(/Model:\s*\d+\s*,\s*"Model::([^"]*)"\s*,\s*"LimbNode"/g)].map((m) => m[1] ?? '');
  const hasSkin = /Deformer:\s*\d+\s*,\s*"[^"]*"\s*,\s*"Skin"/.test(text) || /Geometry:\s*\d+\s*,\s*"[^"]*"\s*,\s*"Mesh"/.test(text);
  const take = /AnimationStack:\s*\d+\s*,\s*"AnimStack::([^"]*)"/.exec(text)?.[1];
  if (!/AnimationStack:|AnimationCurve:/.test(text)) throw new ClipParseError('This FBX file has no animation');
  const stop = stops.length > 0 ? Math.max(...stops) : null;
  const start = starts.length > 0 ? Math.min(...starts) : 0;
  const durationSec = stop !== null && stop > start ? (stop - start) / FBX_TICKS_PER_SECOND : null;
  warnings.push('This is an ASCII FBX file: the key count is not read, and Mixamo exports binary.');
  if (durationSec === null) warnings.push('The duration could not be read from this FBX file.');
  return { durationSec, boneNames: bones, hasSkin, takeName: take || undefined, warnings };
}
