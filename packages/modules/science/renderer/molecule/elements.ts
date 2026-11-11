/** Jmol CPK colours and covalent radii (Å) for H to Kr plus Ag, I, Pt, Au, Hg and Pb (Phase 126 Theme F.2). */
export const ELEMENTS: Record<string, { color: string; covalent: number }> = {
  H: { color: '#ffffff', covalent: 0.31 },
  He: { color: '#d9ffff', covalent: 0.28 },
  Li: { color: '#cc80ff', covalent: 1.28 },
  Be: { color: '#c2ff00', covalent: 0.96 },
  B: { color: '#ffb5b5', covalent: 0.84 },
  C: { color: '#909090', covalent: 0.76 },
  N: { color: '#3050f8', covalent: 0.71 },
  O: { color: '#ff0d0d', covalent: 0.66 },
  F: { color: '#90e050', covalent: 0.57 },
  Ne: { color: '#b3e3f5', covalent: 0.58 },
  Na: { color: '#ab5cf2', covalent: 1.66 },
  Mg: { color: '#8aff00', covalent: 1.41 },
  Al: { color: '#bfa6a6', covalent: 1.21 },
  Si: { color: '#f0c8a0', covalent: 1.11 },
  P: { color: '#ff8000', covalent: 1.07 },
  S: { color: '#ffff30', covalent: 1.05 },
  Cl: { color: '#1ff01f', covalent: 1.02 },
  Ar: { color: '#80d1e3', covalent: 1.06 },
  K: { color: '#8f40d4', covalent: 2.03 },
  Ca: { color: '#3dff00', covalent: 1.76 },
  Sc: { color: '#e6e6e6', covalent: 1.7 },
  Ti: { color: '#bfc2c7', covalent: 1.6 },
  V: { color: '#a6a6ab', covalent: 1.53 },
  Cr: { color: '#8a99c7', covalent: 1.39 },
  Mn: { color: '#9c7ac7', covalent: 1.39 },
  Fe: { color: '#e06633', covalent: 1.32 },
  Co: { color: '#f090a0', covalent: 1.26 },
  Ni: { color: '#50d050', covalent: 1.24 },
  Cu: { color: '#c88033', covalent: 1.32 },
  Zn: { color: '#7d80b0', covalent: 1.22 },
  Ga: { color: '#c28f8f', covalent: 1.22 },
  Ge: { color: '#668f8f', covalent: 1.2 },
  As: { color: '#bd80e3', covalent: 1.19 },
  Se: { color: '#ffa100', covalent: 1.2 },
  Br: { color: '#a62929', covalent: 1.2 },
  Kr: { color: '#5cb8d1', covalent: 1.16 },
  Ag: { color: '#c0c0c0', covalent: 1.45 },
  I: { color: '#940094', covalent: 1.39 },
  Pt: { color: '#d0d0e0', covalent: 1.36 },
  Au: { color: '#ffd123', covalent: 1.36 },
  Hg: { color: '#b8b8d0', covalent: 1.32 },
  Pb: { color: '#575961', covalent: 1.46 },
};

export const UNKNOWN_ELEMENT = { color: '#ff1493', covalent: 1.5 } as const;

/** The entry for an element symbol (any case); unknown symbols are hot pink and 1.5 Å. */
export function elementInfo(symbol: string): { color: string; covalent: number } {
  const key = symbol.length === 0 ? '' : symbol[0]!.toUpperCase() + symbol.slice(1).toLowerCase();
  return ELEMENTS[key] ?? UNKNOWN_ELEMENT;
}
