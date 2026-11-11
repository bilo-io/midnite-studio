import { elementInfo } from './elements';
import type { Atom, Bond } from './parse';

const CELL = 4;

/**
 * Bonds for a structure that carries none (XYZ, PDB without CONECT): a spatial hash of 4 Å cells, each atom
 * checked against the 27 neighbouring cells, a bond where `0.4 Å < d < 1.2 × (rA + rB)` (Phase 126 Theme F.2).
 * O(n) on real structures, never O(n²).
 */
export function inferBonds(atoms: readonly Atom[]): Bond[] {
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const cellOf = (v: number) => Math.floor(v / CELL);
  atoms.forEach((a, i) => {
    const k = key(cellOf(a.x), cellOf(a.y), cellOf(a.z));
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });
  const bonds: Bond[] = [];
  atoms.forEach((a, i) => {
    const ra = elementInfo(a.el).covalent;
    const cx = cellOf(a.x);
    const cy = cellOf(a.y);
    const cz = cellOf(a.z);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
            if (j <= i) continue;
            const b = atoms[j]!;
            const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
            if (d > 0.4 && d < 1.2 * (ra + elementInfo(b.el).covalent)) bonds.push({ a: i, b: j, order: 1 });
          }
        }
      }
    }
  });
  return bonds;
}
