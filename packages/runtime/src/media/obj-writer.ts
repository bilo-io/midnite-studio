import type { MeshPart, ResolvedMaterial } from '@midnite/studio-shared';

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

export type SceneMaterial = { color: string; material: ResolvedMaterial; maps?: MeshPart['maps']; pbr?: MeshPart['pbr'] };

const materialKey = (part: MeshPart): string => {
  const m = part.material;
  return [part.color, m.metalness, m.roughness, m.emissive, m.emissiveIntensity, m.opacity, part.uvs ? part.maps?.normal?.hash : '', part.uvs ? part.maps?.ao?.hash : '', part.uvs ? part.pbr?.baseColor?.hash : '', part.uvs ? part.pbr?.normal?.hash : '', part.uvs ? part.pbr?.emissive?.hash : ''].join('|');
};

/** Distinct materials (colour + PBR values) in first-use order, with each part's index into them. */
export function materialsOf(parts: readonly MeshPart[]): { materials: SceneMaterial[]; colors: string[]; indexOf: number[] } {
  const materials: SceneMaterial[] = [];
  const seen = new Map<string, number>();
  const indexOf = parts.map((part) => {
    const key = materialKey(part);
    let index = seen.get(key);
    if (index === undefined) {
      index = materials.length;
      seen.set(key, index);
      materials.push({ color: part.color, material: part.material, ...(part.uvs && part.maps ? { maps: part.maps } : {}), ...(part.uvs && part.pbr ? { pbr: part.pbr } : {}) });
    }
    return index;
  });
  return { materials, colors: materials.map((m) => m.color), indexOf };
}

export const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

export const materialName = (index: number): string => `material_${index + 1}`;

/**
 * How the PBR values map onto what a legacy Phong/MTL reader understands: specular colour blends from
 * a dielectric grey to the base colour with metalness, the exponent falls with roughness. `Pr`/`Pm`/`Ke`
 * carry the exact values for readers that know them (Blender does).
 */
export function phongOf(entry: SceneMaterial): { kd: [number, number, number]; ks: [number, number, number]; ns: number; ke: [number, number, number] } {
  const kd = hexToRgb(entry.color);
  const { metalness, roughness, emissive, emissiveIntensity } = entry.material;
  const ks = kd.map((c) => 0.2 + (c - 0.2) * metalness) as [number, number, number];
  const ns = Math.max(1, Math.min(1000, Math.round(1000 * (1 - roughness) ** 2.5)));
  const ke = hexToRgb(emissive).map((c) => Math.min(1, c * emissiveIntensity)) as [number, number, number];
  return { kd, ks, ns, ke };
}

export function writeMtl(parts: readonly MeshPart[]): string {
  const { materials } = materialsOf(parts);
  const lines = ['# Midnite Studio — generated materials'];
  materials.forEach((entry, index) => {
    const { kd, ks, ns, ke } = phongOf(entry);
    const f = (v: readonly number[]): string => v.map(formatNumber).join(' ');
    lines.push(
      '',
      `newmtl ${materialName(index)}`,
      `Ka ${f(kd)}`,
      `Kd ${f(kd)}`,
      `Ks ${f(ks)}`,
      `Ke ${f(ke)}`,
      `Ns ${ns}`,
      `d ${formatNumber(entry.material.opacity)}`,
      'illum 2',
      `Pr ${formatNumber(entry.material.roughness)}`,
      `Pm ${formatNumber(entry.material.metalness)}`,
    );
    // Maps sit beside the .obj: a painted part's flattened colour, normal and glow (Theme G), else the baked
    // normal map as a bump map and occlusion as the ambient map. MTL has no packed ORM, so that one stays glb-only.
    const file = (map: { src: string }): string => map.src.split('/').pop()!;
    if (entry.pbr?.baseColor) lines.push(`map_Kd ${file(entry.pbr.baseColor)}`);
    const bump = entry.pbr?.normal ?? entry.maps?.normal;
    if (bump) lines.push(`map_Bump ${file(bump)}`);
    if (entry.maps?.ao) lines.push(`map_Ka ${file(entry.maps.ao)}`);
    if (entry.pbr?.emissive) lines.push(`map_Ke ${file(entry.pbr.emissive)}`);
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
    // Texture coordinates, one per vertex, when the part is unwrapped. OBJ's v runs up the image, glTF's down.
    const hasUvs = part.uvs !== undefined && part.uvs.length === (part.positions.length / 3) * 2;
    if (hasUvs) {
      for (let i = 0; i < part.uvs!.length; i += 2) lines.push(`vt ${formatNumber(part.uvs![i]!)} ${formatNumber(1 - part.uvs![i + 1]!)}`);
    }
    for (let i = 0; i < part.indices.length; i += 3) {
      const corner = (k: number): string => {
        const index = part.indices[i + k]! + 1 + offset;
        return hasUvs ? `${index}/${index}/${index}` : `${index}//${index}`;
      };
      lines.push(`f ${corner(0)} ${corner(1)} ${corner(2)}`);
    }
    offset += part.positions.length / 3;
  });
  return lines.join('\n') + '\n';
}
