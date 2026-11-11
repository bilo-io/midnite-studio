// @vitest-environment node
import { describe, expect, it } from 'vitest';

import caffeineMol from './__fixtures__/caffeine.mol?raw';
import tripeptidePdb from './__fixtures__/tripeptide.pdb?raw';
import waterXyz from './__fixtures__/water.xyz?raw';
import { inferBonds } from './bonds';
import { parseStructure } from './parse';

const fixtures: Record<string, string> = { 'water.xyz': waterXyz, 'caffeine.mol': caffeineMol, 'tripeptide.pdb': tripeptidePdb };
const fixture = (name: string) => fixtures[name] ?? '';

describe('parseStructure', () => {
  it('reads water XYZ and infers two bonds', () => {
    const r = parseStructure(fixture('water.xyz'), 'xyz');
    if (!r.ok) throw new Error(r.message);
    expect(r.atoms.map((a) => a.el)).toEqual(['O', 'H', 'H']);
    expect(inferBonds(r.atoms)).toHaveLength(2);
  });
  it('rejects an XYZ whose count does not match', () => {
    expect(parseStructure('3\nx\nO 0 0 0\n', 'xyz')).toMatchObject({ ok: false });
  });
  it('reads caffeine MOL: 24 atoms and 25 bonds', () => {
    const r = parseStructure(fixture('caffeine.mol'), 'mol');
    if (!r.ok) throw new Error(r.message);
    expect(r.atoms).toHaveLength(24);
    expect(r.bonds).toHaveLength(25);
    expect(r.bonds.some((b) => b.order === 2)).toBe(true);
  });
  it('refuses MOL V3000', () => {
    const v3 = 'x\n\n\n  0  0  0     0  0            999 V3000\n';
    expect(parseStructure(v3, 'mol')).toEqual({ ok: false, message: 'MOL V3000 is not supported yet' });
  });
  it('reads PDB element columns and CONECT bonds', () => {
    const r = parseStructure(fixture('tripeptide.pdb'), 'pdb');
    if (!r.ok) throw new Error(r.message);
    expect(r.atoms.map((a) => a.el)).toEqual(['N', 'C', 'C', 'O', 'Zn']);
    expect(r.bonds).toEqual([
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 1 },
      { a: 2, b: 3, order: 1 },
    ]);
  });
  it('fails a 50,001-atom XYZ with the size message', () => {
    const body = Array.from({ length: 50_001 }, (_, i) => `C ${i} 0 0`).join('\n');
    expect(parseStructure(`50001\nbig\n${body}`, 'xyz')).toEqual({ ok: false, message: 'Over 50,000 atoms — too large to view' });
  });
});

describe('inferBonds', () => {
  it('finds bonds across a grid cell boundary and stays near-linear', () => {
    const atoms = Array.from({ length: 3000 }, (_, i) => ({ el: 'C', x: (i % 30) * 1.5, y: Math.floor(i / 30) * 1.5, z: 0 }));
    const bonds = inferBonds(atoms);
    expect(bonds.length).toBe(30 * 99 + 29 * 100);
  });
});
