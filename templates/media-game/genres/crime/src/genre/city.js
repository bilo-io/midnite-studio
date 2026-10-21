// @ts-check
/**
 * The starter city, as a Tiled map (`.tmj` shape): a `collision` tile layer
 * (buildings are solid) and an `objects` layer with the player spawn, three
 * parked cars and the police station. Built in code so the starter needs no
 * binary asset; replace it with a map exported from the Maps tab and read it
 * with the same `collisionGrid` / `tiledObjects` calls.
 */

export const TILE = 32;
const BLOCK = 14;
const ROAD = 3;
export const COLS = 4 * BLOCK + ROAD;
export const ROWS = 3 * BLOCK + ROAD;

/** Road cell: inside a road band along either axis. @param {number} x @param {number} y */
export const isRoad = (x, y) => x % BLOCK < ROAD || y % BLOCK < ROAD;

/** @param {number} x @param {number} y */
function isBuilding(x, y) {
  if (isRoad(x, y)) return false;
  const bx = (x % BLOCK) - ROAD;
  const by = (y % BLOCK) - ROAD;
  return bx >= 1 && bx <= 9 && by >= 1 && by <= 9;
}

const point = (/** @type {string} */ name, /** @type {string} */ type, /** @type {number} */ tx, /** @type {number} */ ty) => ({ name, type, x: tx * TILE, y: ty * TILE, width: 0, height: 0 });

export function cityMap() {
  const data = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) data.push(isBuilding(x, y) ? 1 : 0);
  return {
    width: COLS,
    height: ROWS,
    tilewidth: TILE,
    tileheight: TILE,
    layers: [
      { type: 'tilelayer', name: 'collision', width: COLS, height: ROWS, data },
      {
        type: 'objectgroup',
        name: 'objects',
        objects: [
          point('player', 'spawn', 1.5, 1.5),
          point('car1', 'car', 7.5, 1.5),
          point('car2', 'car', 15.5, 15.5),
          point('car3', 'car', 1.5, 22.5),
          point('station', 'police', COLS - 1.5, ROWS - 1.5),
        ],
      },
    ],
  };
}
