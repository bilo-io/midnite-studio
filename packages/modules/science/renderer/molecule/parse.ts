export type Atom = { el: string; x: number; y: number; z: number };
export type Bond = { a: number; b: number; order: 1 | 2 | 3 };
export type StructureFormat = 'xyz' | 'pdb' | 'mol';
export type ParseResult = { ok: true; atoms: Atom[]; bonds: Bond[] } | { ok: false; message: string };

/** Largest structure the viewer takes. */
export const MAX_ATOMS = 50_000;
const TOO_LARGE: ParseResult = { ok: false, message: 'Over 50,000 atoms — too large to view' };

const fail = (message: string): ParseResult => ({ ok: false, message });
const num = (s: string): number => Number(s.trim());
const cap = (s: string): string => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1).toLowerCase());

function parseXyz(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const count = Number(lines[0]?.trim());
  if (!Number.isInteger(count) || count < 0) return fail('XYZ: the first line must be the atom count');
  if (count > MAX_ATOMS) return TOO_LARGE;
  const atoms: Atom[] = [];
  for (const line of lines.slice(2)) {
    if (line.trim() === '') continue;
    const [el, x, y, z] = line.trim().split(/\s+/);
    const p = { x: Number(x), y: Number(y), z: Number(z) };
    if (el === undefined || ![p.x, p.y, p.z].every(Number.isFinite)) return fail(`XYZ: cannot read atom line "${line.trim().slice(0, 40)}"`);
    atoms.push({ el: cap(el.replace(/[^A-Za-z]/g, '')), ...p });
  }
  if (atoms.length !== count) return fail(`XYZ: the header says ${count} atoms but the file has ${atoms.length}`);
  return { ok: true, atoms, bonds: [] };
}

function parsePdb(text: string): ParseResult {
  const atoms: Atom[] = [];
  const serial = new Map<number, number>();
  const bonds: Bond[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      if (atoms.length >= MAX_ATOMS) return TOO_LARGE;
      const x = num(line.slice(30, 38));
      const y = num(line.slice(38, 46));
      const z = num(line.slice(46, 54));
      if (![x, y, z].every(Number.isFinite)) return fail('PDB: an ATOM record has unreadable coordinates');
      const fromColumns = line.slice(76, 78).trim();
      const el = cap(fromColumns !== '' ? fromColumns : line.slice(12, 16).replace(/[^A-Za-z]/g, '').slice(0, 1));
      serial.set(num(line.slice(6, 11)), atoms.length);
      atoms.push({ el, x, y, z });
    } else if (line.startsWith('CONECT')) {
      const ids = line.slice(6).match(/.{1,5}/g)?.map((s) => num(s)) ?? [];
      const from = serial.get(ids[0] ?? Number.NaN);
      if (from === undefined) continue;
      for (const id of ids.slice(1)) {
        const to = serial.get(id);
        if (to === undefined || to === from) continue;
        const k = from < to ? `${from}-${to}` : `${to}-${from}`;
        if (seen.has(k)) continue;
        seen.add(k);
        bonds.push({ a: Math.min(from, to), b: Math.max(from, to), order: 1 });
      }
    }
  }
  if (atoms.length === 0) return fail('PDB: no ATOM or HETATM records');
  return { ok: true, atoms, bonds };
}

function parseMol(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const counts = lines[3] ?? '';
  if (/V3000/.test(counts)) return fail('MOL V3000 is not supported yet');
  const nAtoms = num(counts.slice(0, 3));
  const nBonds = num(counts.slice(3, 6));
  if (!Number.isInteger(nAtoms) || !Number.isInteger(nBonds) || nAtoms < 0 || nBonds < 0) return fail('MOL: unreadable counts line');
  if (nAtoms > MAX_ATOMS) return TOO_LARGE;
  const atoms: Atom[] = [];
  for (let i = 0; i < nAtoms; i += 1) {
    const l = lines[4 + i];
    if (l === undefined) return fail('MOL: the atom block ends early');
    const x = num(l.slice(0, 10));
    const y = num(l.slice(10, 20));
    const z = num(l.slice(20, 30));
    if (![x, y, z].every(Number.isFinite)) return fail('MOL: an atom has unreadable coordinates');
    atoms.push({ el: cap(l.slice(31, 34).trim()), x, y, z });
  }
  const bonds: Bond[] = [];
  for (let i = 0; i < nBonds; i += 1) {
    const l = lines[4 + nAtoms + i];
    if (l === undefined) return fail('MOL: the bond block ends early');
    const a = num(l.slice(0, 3)) - 1;
    const b = num(l.slice(3, 6)) - 1;
    const order = num(l.slice(6, 9));
    if (!(a >= 0 && a < nAtoms && b >= 0 && b < nAtoms)) return fail('MOL: a bond names an atom that does not exist');
    bonds.push({ a, b, order: order === 2 ? 2 : order === 3 ? 3 : 1 });
  }
  return { ok: true, atoms, bonds };
}

/** Parses XYZ, PDB or MOL/SDF (V2000, first record) text into atoms and any bonds the file carries (Phase 126 Theme F.1). */
export function parseStructure(text: string, format: StructureFormat): ParseResult {
  const first = format === 'mol' ? text.split(/\r?\n\$\$\$\$/)[0]! : text;
  try {
    return format === 'xyz' ? parseXyz(first) : format === 'pdb' ? parsePdb(first) : parseMol(first);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not read the structure');
  }
}
