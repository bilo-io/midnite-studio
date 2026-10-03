import type { MeshPart } from '@midnite/studio-shared';
import { formatNumber, hexToRgb, materialsOf, uniqueNames } from './obj-writer';

/**
 * FBX 7.4 writer — three.js ships an `FBXLoader` but no exporter, so this is
 * ours. It builds one node tree and serialises it two ways:
 *
 * - **binary** (the default for the `.fbx` Models saves): what Blender, Unity,
 *   Unreal and Maya read — Blender's importer does not accept ASCII FBX;
 * - **ascii**: the same tree, human-readable, for diffing and debugging.
 *
 * One `Model` + `Geometry` + `Material` per part, geometry already in world
 * space (so no `Lcl` transforms), per-vertex normals, triangles only. Y up.
 * `fbx-writer.test.ts` round-trips both encodings through three's `FBXLoader`.
 */

type FbxProp =
  | { t: 'I'; v: number }
  | { t: 'L'; v: number }
  | { t: 'D'; v: number }
  | { t: 'C'; v: boolean }
  | { t: 'S'; v: string }
  | { t: 'd'; v: number[] }
  | { t: 'i'; v: number[] };

export type FbxNode = { name: string; props: FbxProp[]; children: FbxNode[] };

const node = (name: string, props: FbxProp[] = [], children: FbxNode[] = []): FbxNode => ({ name, props, children });
const I = (v: number): FbxProp => ({ t: 'I', v });
const L = (v: number): FbxProp => ({ t: 'L', v });
const D = (v: number): FbxProp => ({ t: 'D', v });
const S = (v: string): FbxProp => ({ t: 'S', v });

/** A `P:` row of a `Properties70` block. */
const p = (name: string, type: string, label: string, flags: string, ...values: FbxProp[]): FbxNode =>
  node('P', [S(name), S(type), S(label), S(flags), ...values]);

const GEOMETRY_BASE = 1_000_000;
const MODEL_BASE = 2_000_000;
const MATERIAL_BASE = 3_000_000;

export function buildFbxTree(parts: readonly MeshPart[]): FbxNode[] {
  const names = uniqueNames(parts);
  const { colors, indexOf } = materialsOf(parts);

  const header = node('FBXHeaderExtension', [], [
    node('FBXHeaderVersion', [I(1003)]),
    node('FBXVersion', [I(7400)]),
    node('Creator', [S('Midnite Studio')]),
  ]);
  const globals = node('GlobalSettings', [], [
    node('Version', [I(1000)]),
    node('Properties70', [], [
      p('UpAxis', 'int', 'Integer', '', I(1)),
      p('UpAxisSign', 'int', 'Integer', '', I(1)),
      p('FrontAxis', 'int', 'Integer', '', I(2)),
      p('FrontAxisSign', 'int', 'Integer', '', I(1)),
      p('CoordAxis', 'int', 'Integer', '', I(0)),
      p('CoordAxisSign', 'int', 'Integer', '', I(1)),
      p('UnitScaleFactor', 'double', 'Number', '', D(100)),
    ]),
  ]);
  const definitions = node('Definitions', [], [
    node('Version', [I(100)]),
    node('Count', [I(parts.length * 2 + colors.length)]),
    node('ObjectType', [S('Geometry')], [node('Count', [I(parts.length)])]),
    node('ObjectType', [S('Model')], [node('Count', [I(parts.length)])]),
    node('ObjectType', [S('Material')], [node('Count', [I(colors.length)])]),
  ]);

  const objects: FbxNode[] = [];
  const connections: FbxNode[] = [];
  const link = (child: number, parent: number): void => {
    connections.push(node('C', [S('OO'), L(child), L(parent)]));
  };

  parts.forEach((part, index) => {
    const name = names[index]!;
    const geometryId = GEOMETRY_BASE + index;
    const modelId = MODEL_BASE + index;
    const polygonIndex: number[] = [];
    for (let i = 0; i < part.indices.length; i += 3) {
      polygonIndex.push(part.indices[i]!, part.indices[i + 1]!, -(part.indices[i + 2]! + 1));
    }
    objects.push(
      node('Geometry', [L(geometryId), S(`Geometry::${name}`), S('Mesh')], [
        node('Vertices', [{ t: 'd', v: part.positions }]),
        node('PolygonVertexIndex', [{ t: 'i', v: polygonIndex }]),
        node('GeometryVersion', [I(124)]),
        node('LayerElementNormal', [I(0)], [
          node('Version', [I(101)]),
          node('Name', [S('')]),
          node('MappingInformationType', [S('ByVertice')]),
          node('ReferenceInformationType', [S('Direct')]),
          node('Normals', [{ t: 'd', v: part.normals }]),
        ]),
        node('LayerElementMaterial', [I(0)], [
          node('Version', [I(101)]),
          node('Name', [S('')]),
          node('MappingInformationType', [S('AllSame')]),
          node('ReferenceInformationType', [S('IndexToDirect')]),
          node('Materials', [{ t: 'i', v: [0] }]),
        ]),
        node('Layer', [I(0)], [
          node('Version', [I(100)]),
          node('LayerElement', [], [node('Type', [S('LayerElementNormal')]), node('TypedIndex', [I(0)])]),
          node('LayerElement', [], [node('Type', [S('LayerElementMaterial')]), node('TypedIndex', [I(0)])]),
        ]),
      ]),
    );
    objects.push(
      node('Model', [L(modelId), S(`Model::${name}`), S('Mesh')], [
        node('Version', [I(232)]),
        node('Properties70', [], [p('DefaultAttributeIndex', 'int', 'Integer', '', I(0))]),
        node('Shading', [{ t: 'C', v: true }]),
        node('Culling', [S('CullingOff')]),
      ]),
    );
    link(modelId, 0);
    link(geometryId, modelId);
    link(MATERIAL_BASE + indexOf[index]!, modelId);
  });

  colors.forEach((color, index) => {
    const [r, g, b] = hexToRgb(color).map((c) => Number(formatNumber(c)));
    objects.push(
      node('Material', [L(MATERIAL_BASE + index), S(`Material::material_${index + 1}`), S('')], [
        node('Version', [I(102)]),
        node('ShadingModel', [S('phong')]),
        node('MultiLayer', [I(0)]),
        node('Properties70', [], [
          p('DiffuseColor', 'Color', '', 'A', D(r!), D(g!), D(b!)),
          p('AmbientColor', 'Color', '', 'A', D(r! * 0.2), D(g! * 0.2), D(b! * 0.2)),
          p('SpecularColor', 'Color', '', 'A', D(0.2), D(0.2), D(0.2)),
          p('Shininess', 'Number', '', 'A', D(32)),
          p('Opacity', 'Number', '', 'A', D(1)),
        ]),
      ]),
    );
  });

  return [header, globals, definitions, node('Objects', [], objects), node('Connections', [], connections)];
}

// --- ascii ---------------------------------------------------------------------

const quote = (text: string): string => `"${text.replace(/"/g, "'")}"`;

function asciiProp(prop: FbxProp): string {
  switch (prop.t) {
    case 'S':
      return quote(prop.v);
    case 'C':
      return prop.v ? 'T' : 'F';
    case 'I':
    case 'L':
      return String(Math.trunc(prop.v));
    case 'D':
      return formatNumber(prop.v);
    default:
      return prop.v.map((value) => (prop.t === 'i' ? String(value) : formatNumber(value))).join(',');
  }
}

function asciiNode(n: FbxNode, depth: number, out: string[]): void {
  const pad = '\t'.repeat(depth);
  const array = n.props.length === 1 && (n.props[0]!.t === 'd' || n.props[0]!.t === 'i') ? n.props[0]! : null;
  if (array) {
    out.push(`${pad}${n.name}: *${(array.v as number[]).length} {`, `${pad}\ta: ${asciiProp(array)}`, `${pad}}`);
    return;
  }
  // A `P:` row's values follow its four labels with bare commas (`"A",1,0,0`) — FBXLoader's text parser needs that.
  const props =
    n.name === 'P'
      ? `${n.props.slice(0, 4).map(asciiProp).join(', ')}${n.props.length > 4 ? ',' : ''}${n.props.slice(4).map(asciiProp).join(',')}`
      : n.props.map(asciiProp).join(', ');
  if (n.children.length === 0) {
    out.push(`${pad}${n.name}: ${props}`);
    return;
  }
  out.push(`${pad}${n.name}: ${props} {`);
  for (const child of n.children) asciiNode(child, depth + 1, out);
  out.push(`${pad}}`);
}

export function writeFbxAscii(parts: readonly MeshPart[]): string {
  const out = ['; FBX 7.4.0 project file', '; Generated by Midnite Studio', ''];
  for (const top of buildFbxTree(parts)) {
    asciiNode(top, 0, out);
    out.push('');
  }
  return out.join('\n');
}

// --- binary --------------------------------------------------------------------

const MAGIC = Buffer.concat([Buffer.from('Kaydara FBX Binary  ', 'latin1'), Buffer.from([0x00, 0x1a, 0x00])]);
const FBX_VERSION = 7400;
const NULL_RECORD = Buffer.alloc(13);
const FOOTER_ID = Buffer.from([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
const FOOTER_MAGIC = Buffer.from([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);

/** Binary FBX spells `Model::arm` as `arm\0\x01Model`. */
const binaryString = (text: string): string => text.replace(/^(\w+)::(.*)$/s, '$2\u0000\u0001$1');

function binaryProp(prop: FbxProp): Buffer {
  switch (prop.t) {
    case 'I': {
      const b = Buffer.alloc(5);
      b.write('I', 0, 'latin1');
      b.writeInt32LE(prop.v, 1);
      return b;
    }
    case 'L': {
      const b = Buffer.alloc(9);
      b.write('L', 0, 'latin1');
      b.writeBigInt64LE(BigInt(Math.trunc(prop.v)), 1);
      return b;
    }
    case 'D': {
      const b = Buffer.alloc(9);
      b.write('D', 0, 'latin1');
      b.writeDoubleLE(prop.v, 1);
      return b;
    }
    case 'C': {
      const b = Buffer.alloc(2);
      b.write('C', 0, 'latin1');
      b.writeUInt8(prop.v ? 1 : 0, 1);
      return b;
    }
    case 'S': {
      const text = Buffer.from(binaryString(prop.v), 'utf8');
      const b = Buffer.alloc(5 + text.length);
      b.write('S', 0, 'latin1');
      b.writeUInt32LE(text.length, 1);
      text.copy(b, 5);
      return b;
    }
    case 'd':
    case 'i': {
      const size = prop.t === 'd' ? 8 : 4;
      const b = Buffer.alloc(13 + prop.v.length * size);
      b.write(prop.t, 0, 'latin1');
      b.writeUInt32LE(prop.v.length, 1);
      b.writeUInt32LE(0, 5); // encoding: raw
      b.writeUInt32LE(prop.v.length * size, 9);
      prop.v.forEach((value, i) => {
        if (prop.t === 'd') b.writeDoubleLE(value, 13 + i * 8);
        else b.writeInt32LE(value, 13 + i * 4);
      });
      return b;
    }
  }
}

/** Serialise one node record; `start` is its absolute offset in the file (for `endOffset`). */
function binaryNode(n: FbxNode, start: number): Buffer {
  const name = Buffer.from(n.name, 'latin1');
  const props = Buffer.concat(n.props.map(binaryProp));
  const headerSize = 13 + name.length;
  const parts: Buffer[] = [];
  let cursor = start + headerSize + props.length;
  for (const child of n.children) {
    const buffer = binaryNode(child, cursor);
    parts.push(buffer);
    cursor += buffer.length;
  }
  if (n.children.length > 0) {
    parts.push(NULL_RECORD);
    cursor += NULL_RECORD.length;
  }
  const head = Buffer.alloc(headerSize);
  head.writeUInt32LE(cursor, 0);
  head.writeUInt32LE(n.props.length, 4);
  head.writeUInt32LE(props.length, 8);
  head.writeUInt8(name.length, 12);
  name.copy(head, 13);
  return Buffer.concat([head, props, ...parts]);
}

export function writeFbxBinary(parts: readonly MeshPart[]): Buffer {
  const header = Buffer.alloc(MAGIC.length + 4);
  MAGIC.copy(header);
  header.writeUInt32LE(FBX_VERSION, MAGIC.length);
  const chunks: Buffer[] = [header];
  let cursor = header.length;
  for (const top of buildFbxTree(parts)) {
    const buffer = binaryNode(top, cursor);
    chunks.push(buffer);
    cursor += buffer.length;
  }
  chunks.push(NULL_RECORD, FOOTER_ID, Buffer.alloc(4));
  cursor += NULL_RECORD.length + FOOTER_ID.length + 4;
  const pad = (16 - (cursor % 16)) % 16 || 16;
  const version = Buffer.alloc(4);
  version.writeUInt32LE(FBX_VERSION, 0);
  chunks.push(Buffer.alloc(pad), version, Buffer.alloc(120), FOOTER_MAGIC);
  return Buffer.concat(chunks);
}
