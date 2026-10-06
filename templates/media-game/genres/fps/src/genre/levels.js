// @ts-check
/**
 * The starter level, authored as text and emitted as a Tiled map (`.tmj` shape):
 * a `walls` tile layer (the gid is the raycaster's wall id; 9 is a door) and an
 * `objects` layer of enemies, pickups and the player spawn. Replace it with a
 * map exported from the Maps tab and read it with the same two calls.
 *
 *   #  wall        D  door         R  red locked door     V  violet locked door
 *   P  player      g  grunt        h  health   a  ammo     k  red key   v  violet key
 *   s  shotgun     r  rocket launcher
 */

export const LEVEL_ASCII = [
  '########################',
  '#P..a.#........#...v...#',
  '#.....#...g....#...h...#',
  '#.....D........R.......#',
  '#..g..#........#...g...#',
  '###D###...r....#########',
  '#.....#........#.......#',
  '#..h..#........#...g...#',
  '#.....#........V.......#',
  '#..g..D...s....#.......#',
  '#..k..#........#...a...#',
  '########################',
];

const WALL_CELLS = { '#': 1, D: 9, R: 3, V: 5 };
const OBJECT_TYPES = {
  P: ['player', 'spawn'],
  g: ['grunt', 'enemy'],
  h: ['health', 'pickup'],
  a: ['ammo', 'pickup'],
  k: ['red-key', 'pickup'],
  v: ['violet-key', 'pickup'],
  s: ['shotgun', 'pickup'],
  r: ['rocket', 'pickup'],
};

/** @param {readonly string[]} [rows] */
export function levelMap(rows = LEVEL_ASCII) {
  const width = rows[0]?.length ?? 0;
  /** @type {number[]} */
  const data = [];
  /** @type {object[]} */
  const objects = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      data.push(/** @type {Record<string, number>} */ (WALL_CELLS)[ch] ?? 0);
      const kind = /** @type {Record<string, string[]>} */ (OBJECT_TYPES)[ch];
      if (kind) objects.push({ name: kind[0], type: kind[1], x: x + 0.5, y: y + 0.5 });
    });
  });
  return {
    width,
    height: rows.length,
    layers: [
      { type: 'tilelayer', name: 'walls', width, height: rows.length, data },
      { type: 'objectgroup', name: 'objects', objects },
    ],
  };
}

/**
 * The `walls` layer as rows of wall ids (unlike `collisionGrid`, which flattens to 0/1).
 * @param {ReturnType<typeof levelMap>} map
 */
export function wallGrid(map) {
  const layer = /** @type {{ data: number[], width: number }} */ (map.layers.find((l) => l.name === 'walls'));
  /** @type {number[][]} */
  const rows = [];
  for (let i = 0; i < layer.data.length; i += layer.width) rows.push(layer.data.slice(i, i + layer.width));
  return rows;
}

/**
 * Objects with their grid positions (cell centres), grouped by Tiled type.
 * @param {ReturnType<typeof levelMap>} map
 */
export function levelObjects(map) {
  const layer = /** @type {{ objects: { name: string, type: string, x: number, y: number }[] }} */ (map.layers.find((l) => l.name === 'objects'));
  return layer.objects;
}
