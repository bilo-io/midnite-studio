/**
 * Terrain land-cover classes and their visual debug colours (Phase 105 Theme F).
 */
export const TERRAIN_CLASSES = ['water', 'tree', 'grass', 'bare', 'rock', 'road', 'building', 'other'] as const;
export type TerrainClass = (typeof TERRAIN_CLASSES)[number];

export const TERRAIN_CLASS_COLOURS: Record<TerrainClass, string> = {
  water: '#3a7bd5',
  tree: '#2d6a4f',
  grass: '#95d5b2',
  bare: '#d4a373',
  rock: '#8d99ae',
  road: '#343a40',
  building: '#e63946',
  other: '#adb5bd',
};

export const TERRAIN_CLASS_INDICES: Record<TerrainClass, number> = Object.fromEntries(
  TERRAIN_CLASSES.map((cls, idx) => [cls, idx]),
) as Record<TerrainClass, number>;

/** Converts a hex color '#rrggbb' into [r, g, b] in 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export const TERRAIN_CLASS_RGB: Record<TerrainClass, [number, number, number]> = Object.fromEntries(
  TERRAIN_CLASSES.map((cls) => [cls, hexToRgb(TERRAIN_CLASS_COLOURS[cls])]),
) as Record<TerrainClass, [number, number, number]>;
