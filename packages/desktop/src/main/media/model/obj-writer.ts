import type { MeshPart } from '@midnite/studio-shared';

/**
 * Wavefront OBJ + MTL for a built scene. One `o` object per part, one
 * material per distinct colour, vertices indexed globally (1-based) with
 * `v//vn` face corners. Y up, as three.js `OBJLoader` reads it.
 */

/** Trim to 6 decimals, never `-0` or an exponent — every importer reads this. */
export function formatNumber(value: number): string {
  const text = value.toFixed(6).replace(/\.?0+$/, '');
  return text === '-0' || text === '' ? '0' : text;
}

/** Names that survive every importer: no spaces, no punctuation beyond `_-`. */
export function safeName(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

/** Part names made unique (`leg`, `leg_2`, …) so objects stay addressable. */
export function uniqueNames(parts: readonly MeshPart[]): string[] {
  const seen = new Map<string, number>();
  return parts.map((part, index) => {
    const base = safeName(part.name, `part${index + 1}`);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

/** Distinct colours in first-use order, with each part's index into them. */
export function materialsOf(parts: readonly MeshPart[]): { colors: string[]; indexOf: number[] } {
  const colors: string[] = [];
  const indexOf = parts.map((part) => {
    let index = colors.indexOf(part.color);
    if (index < 0) {
      index = colors.length;
      colors.push(part.color);
    }
    return index;
  });
  return { colors, indexOf };
}

export const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

export const materialName = (index: number): string => `material_${index + 1}`;

export function writeMtl(parts: readonly MeshPart[]): string {
  const { colors } = materialsOf(parts);
  const lines = ['# Midnite Studio — generated materials'];
  colors.forEach((color, index) => {
    const [r, g, b] = hexToRgb(color).map(formatNumber);
    lines.push('', `newmtl ${materialName(index)}`, `Ka ${r} ${g} ${b}`, `Kd ${r} ${g} ${b}`, 'Ks 0.2 0.2 0.2', 'Ns 32', 'd 1', 'illum 2');
  });
  return lines.join('\n') + '\n';
}

/** `mtlFile` is the sibling file name written beside the `.obj`. */
export function writeObj(parts: readonly MeshPart[], mtlFile: string, title = 'model'): string {
  const names = uniqueNames(parts);
  const { indexOf } = materialsOf(parts);
  const lines = ['# Midnite Studio — generated model', `# ${title}`, `mtllib ${mtlFile}`];
  let offset = 0;
  parts.forEach((part, partIndex) => {
    lines.push(`o ${names[partIndex]}`, `usemtl ${materialName(indexOf[partIndex]!)}`);
    for (let i = 0; i < part.positions.length; i += 3) {
      lines.push(`v ${formatNumber(part.positions[i]!)} ${formatNumber(part.positions[i + 1]!)} ${formatNumber(part.positions[i + 2]!)}`);
    }
    for (let i = 0; i < part.normals.length; i += 3) {
      lines.push(`vn ${formatNumber(part.normals[i]!)} ${formatNumber(part.normals[i + 1]!)} ${formatNumber(part.normals[i + 2]!)}`);
    }
    for (let i = 0; i < part.indices.length; i += 3) {
      const corner = (k: number): string => {
        const index = part.indices[i + k]! + 1 + offset;
        return `${index}//${index}`;
      };
      lines.push(`f ${corner(0)} ${corner(1)} ${corner(2)}`);
    }
    offset += part.positions.length / 3;
  });
  return lines.join('\n') + '\n';
}
