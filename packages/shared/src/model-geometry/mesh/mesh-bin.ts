/**
 * `<stem>.mesh.bin` — the binary a `sculpt` part's geometry lives in, beside the design sidecar
 * (Phase 104 Theme A). JSON would be ~4× larger and slow to parse at a million vertices, so the
 * sidecar only references this file by name and content hash.
 *
 * Layout, little-endian throughout:
 *
 * | offset | size | field                                              |
 * |-------:|-----:|----------------------------------------------------|
 * |      0 |    8 | magic `MSMESH\0\0`                                  |
 * |      8 |    2 | format version ({@link MESH_BIN_VERSION})          |
 * |     10 |    2 | flags (reserved, 0)                                 |
 * |     12 |    4 | vertex count                                        |
 * |     16 |    4 | triangle count                                      |
 * |     20 |    1 | multires level (0 = base)                           |
 * |     21 |    3 | reserved, 0                                         |
 * |     24 |    4 | payload byte length                                 |
 * |     28 |    4 | CRC-32 of the payload                               |
 * |     32 |    … | positions f32×3n · normals f32×3n · indices u32×3f  |
 *
 * Encoding is deterministic, so decode → encode reproduces the file byte for byte. Decoding refuses a
 * wrong magic, a version it does not know (older or newer), a size mismatch and a checksum mismatch,
 * each with a sentence a person can act on.
 */

export const MESH_BIN_MAGIC = 'MSMESH\0\0';
export const MESH_BIN_VERSION = 1;
export const MESH_BIN_HEADER_BYTES = 32;
/** Far above the ~1M-vertex target, low enough that a corrupt count cannot ask for gigabytes. */
export const MESH_BIN_MAX_VERTICES = 4_000_000;
export const MESH_BIN_MAX_TRIANGLES = 8_000_000;

export type MeshBin = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  multiresLevel: number;
};

export class MeshBinError extends Error {
  override readonly name = 'MeshBinError';
}

// --- CRC-32 (IEEE 802.3) -----------------------------------------------------------------------

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(bytes: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- encode / decode ---------------------------------------------------------------------------

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function writeArray(out: Uint8Array, at: number, src: Float32Array | Uint32Array): void {
  if (LITTLE_ENDIAN) {
    out.set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength), at);
    return;
  }
  const view = new DataView(out.buffer, out.byteOffset + at, src.byteLength);
  const float = src instanceof Float32Array;
  for (let i = 0; i < src.length; i += 1) {
    if (float) view.setFloat32(i * 4, src[i]!, true);
    else view.setUint32(i * 4, src[i]!, true);
  }
}

function readFloats(bytes: Uint8Array, at: number, count: number): Float32Array {
  const out = new Float32Array(count);
  if (LITTLE_ENDIAN) new Uint8Array(out.buffer).set(bytes.subarray(at, at + count * 4));
  else {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, count * 4);
    for (let i = 0; i < count; i += 1) out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

function readUints(bytes: Uint8Array, at: number, count: number): Uint32Array {
  const out = new Uint32Array(count);
  if (LITTLE_ENDIAN) new Uint8Array(out.buffer).set(bytes.subarray(at, at + count * 4));
  else {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, count * 4);
    for (let i = 0; i < count; i += 1) out[i] = view.getUint32(i * 4, true);
  }
  return out;
}

export function encodeMeshBin(mesh: MeshBin): Uint8Array {
  const vertices = mesh.positions.length / 3;
  const triangles = mesh.indices.length / 3;
  if (!Number.isInteger(vertices) || !Number.isInteger(triangles)) throw new MeshBinError('A mesh needs whole xyz triples and whole triangles.');
  if (mesh.normals.length !== mesh.positions.length) throw new MeshBinError('A mesh needs one normal per vertex.');
  if (vertices > MESH_BIN_MAX_VERTICES || triangles > MESH_BIN_MAX_TRIANGLES) {
    throw new MeshBinError(`A sculpt mesh may hold at most ${MESH_BIN_MAX_VERTICES.toLocaleString('en')} vertices and ${MESH_BIN_MAX_TRIANGLES.toLocaleString('en')} triangles.`);
  }
  const level = Math.trunc(mesh.multiresLevel);
  if (level < 0 || level > 255) throw new MeshBinError('The multires level must be 0–255.');
  const payload = vertices * 24 + triangles * 12;
  const out = new Uint8Array(MESH_BIN_HEADER_BYTES + payload);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) out[i] = MESH_BIN_MAGIC.charCodeAt(i);
  view.setUint16(8, MESH_BIN_VERSION, true);
  view.setUint16(10, 0, true);
  view.setUint32(12, vertices, true);
  view.setUint32(16, triangles, true);
  out[20] = level;
  view.setUint32(24, payload, true);
  let at = MESH_BIN_HEADER_BYTES;
  writeArray(out, at, mesh.positions);
  at += vertices * 12;
  writeArray(out, at, mesh.normals);
  at += vertices * 12;
  writeArray(out, at, mesh.indices);
  view.setUint32(28, crc32(out.subarray(MESH_BIN_HEADER_BYTES)), true);
  return out;
}

/** The counts a header claims, without reading the payload — for listings. Throws {@link MeshBinError}. */
export function readMeshBinHeader(bytes: Uint8Array): { version: number; vertices: number; triangles: number; multiresLevel: number; payloadBytes: number; checksum: number } {
  if (bytes.byteLength < MESH_BIN_HEADER_BYTES) throw new MeshBinError('This is not a sculpt mesh file: it is shorter than the header.');
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== MESH_BIN_MAGIC.charCodeAt(i)) throw new MeshBinError('This is not a sculpt mesh file (the header does not start with MSMESH).');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  if (version < MESH_BIN_VERSION) throw new MeshBinError(`This sculpt mesh uses format version ${version}, which is older than this build can read (${MESH_BIN_VERSION}).`);
  if (version > MESH_BIN_VERSION) throw new MeshBinError(`This sculpt mesh uses format version ${version}, written by a newer Midnite Studio — update to open it.`);
  return {
    version,
    vertices: view.getUint32(12, true),
    triangles: view.getUint32(16, true),
    multiresLevel: bytes[20]!,
    payloadBytes: view.getUint32(24, true),
    checksum: view.getUint32(28, true),
  };
}

/** Throws {@link MeshBinError} with a readable reason for anything it will not load. */
export function decodeMeshBin(bytes: Uint8Array): MeshBin {
  const header = readMeshBinHeader(bytes);
  const { vertices, triangles } = header;
  if (vertices > MESH_BIN_MAX_VERTICES || triangles > MESH_BIN_MAX_TRIANGLES) throw new MeshBinError('The sculpt mesh header claims more geometry than a sculpt mesh may hold — the file is corrupt.');
  const payload = vertices * 24 + triangles * 12;
  if (header.payloadBytes !== payload) throw new MeshBinError('The sculpt mesh header does not match its own counts — the file is corrupt.');
  if (bytes.byteLength !== MESH_BIN_HEADER_BYTES + payload) {
    throw new MeshBinError(`The sculpt mesh is ${bytes.byteLength} bytes but its header says ${MESH_BIN_HEADER_BYTES + payload} — the file is truncated or padded.`);
  }
  if (crc32(bytes.subarray(MESH_BIN_HEADER_BYTES)) !== header.checksum) throw new MeshBinError('The sculpt mesh failed its checksum — the file is corrupt.');
  let at = MESH_BIN_HEADER_BYTES;
  const positions = readFloats(bytes, at, vertices * 3);
  at += vertices * 12;
  const normals = readFloats(bytes, at, vertices * 3);
  at += vertices * 12;
  const indices = readUints(bytes, at, triangles * 3);
  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i]! >= vertices) throw new MeshBinError(`The sculpt mesh's triangle ${Math.floor(i / 3)} uses vertex ${indices[i]}, but it has only ${vertices} — the file is corrupt.`);
  }
  return { positions, normals, indices, multiresLevel: header.multiresLevel };
}

/** The file a design's sculpt mesh is saved to: `<stem>.mesh.bin`, or `<stem>.<partId>.mesh.bin` when a design holds several. */
export const sculptMeshSrcFor = (stem: string, partId?: string): string => (partId ? `${stem}.${partId}.mesh.bin` : `${stem}.mesh.bin`);
