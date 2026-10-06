// @ts-check
/**
 * Top-down crime genre (Phase 107 Theme H): on foot and in cars, pedestrians
 * walking the streets, a wanted level with pursuing police, in a city read from
 * a Tiled map (`city.js`). Handling is `kit/core/genre/crime/car2d.js` and the
 * wanted level `wanted.js`; this file wires them to the scene. Drawn top-down or
 * isometric through `kit/phaser/world2d.js`.
 */

import * as Phaser from 'phaser';

import { CAR_DEFAULTS, car2dStep, carSpeed, createCar } from 'kit/core/genre/crime/car2d.js';
import { createWanted, pursuit, wantedReducer } from 'kit/core/genre/crime/wanted.js';
import { astar } from 'kit/core/genre/rts/astar.js';
import { rng } from 'kit/core/rng.js';
import { collisionGrid, tiledObjects } from 'kit/core/tiled-objects.js';
import { createHud } from 'kit/phaser/hud.js';
import { createInput } from 'kit/phaser/input.js';
import { createWorld2d } from 'kit/phaser/world2d.js';

import config from '../game.config.js';
import { COLS, ROWS, TILE, cityMap, isRoad } from './city.js';

const WALK = 4; // tiles/s
const COLORS = { road: 0x2b2f36, sidewalk: 0x5b6270, building: 0x8b5e3c, roof: 0x6b4a32 };

/** @param {Phaser.Scene} scene @param {{ rig?: any }} _ctx */
export function installGenre(scene, _ctx) {
  const map = cityMap();
  const solid = collisionGrid(map);
  const objects = tiledObjects(map);
  const world = createWorld2d(scene, { perspective: config.perspective, cols: COLS, rows: ROWS });
  world.cover();
  const input = createInput(scene, {
    left: { keys: ['LEFT', 'A'] }, right: { keys: ['RIGHT', 'D'] }, up: { keys: ['UP', 'W'] }, down: { keys: ['DOWN', 'S'] },
    enter: { keys: ['E', 'SPACE'] }, fire: { keys: ['F', 'J'] },
  });
  const hud = createHud(scene, {});
  const stars = scene.add.text(scene.scale.width / 2, 10, '', { fontFamily: 'monospace', fontSize: '18px', color: '#fde047' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);

  const floor = scene.add.graphics().setDepth(-10);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      world.drawTile(floor, x, y, solid[y][x] ? COLORS.building : isRoad(x, y) ? COLORS.road : COLORS.sidewalk);
    }
  }
  const blocked = (/** @type {number} */ tx, /** @type {number} */ ty) => solid[Math.floor(ty)]?.[Math.floor(tx)] !== 0;

  const spawn = objects.spawns[0] ?? { x: 48, y: 48 };
  const player = { x: spawn.x / TILE, y: spawn.y / TILE, hp: 100, car: /** @type {any} */ (null), facing: { x: 1, y: 0 } };
  const home = { x: player.x, y: player.y };
  const body = scene.add.circle(0, 0, world.unit * 0.28, 0xfde68a).setStrokeStyle(2, 0x000000);
  let wanted = createWanted();
  let seen = false;
  let killed = 0;

  /** Cars live in sim pixels (the handling constants are px/s); everything else in tiles. */
  const makeCar = (/** @type {number} */ tx, /** @type {number} */ ty, /** @type {number} */ color, /** @type {'parked'|'police'} */ kind) => {
    const sprite = scene.add.rectangle(0, 0, world.unit * 1.1, world.unit * 0.6, color).setStrokeStyle(2, 0x000000);
    return { ...createCar({ x: tx * TILE, y: ty * TILE, heading: 0 }), kind, stolen: false, sprite };
  };
  const cars = Object.entries(objects.points)
    .filter(([, p]) => p.type === 'car')
    .map(([, p], i) => makeCar(p.x / TILE, p.y / TILE, [0xdc2626, 0x2563eb, 0x16a34a][i % 3] ?? 0x888888, 'parked'));
  /** @type {any[]} */
  const police = [];
  const station = objects.points['station'] ?? { x: (COLS - 1.5) * TILE, y: (ROWS - 1.5) * TILE };

  /** @type {any[]} */
  const peds = [];
  const openCells = [];
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) if (!solid[y][x]) openCells.push({ x, y });
  for (let i = 0; i < 16; i += 1) {
    const at = /** @type {{x:number,y:number}} */ (rng.pick(openCells));
    peds.push({ x: at.x + 0.5, y: at.y + 0.5, path: [], dot: scene.add.circle(0, 0, world.unit * 0.2, [0x93c5fd, 0xf9a8d4, 0xbef264, 0xfcd34d][i % 4]) });
  }

  const crime = (/** @type {string} */ kind) => {
    wanted = wantedReducer(wanted, { type: 'crime', crime: kind });
  };
  scene.cameras.main.startFollow(body, true, 0.12, 0.12);

  function walkTo(/** @type {any} */ ped) {
    const from = { x: Math.floor(ped.x), y: Math.floor(ped.y) };
    const near = openCells.filter((c) => Math.abs(c.x - from.x) <= 10 && Math.abs(c.y - from.y) <= 10);
    const goal = rng.pick(near.length > 0 ? near : openCells);
    const path = astar(solid, from, goal);
    ped.path = path ? path.slice(1) : [];
  }

  function nearestCar(/** @type {number} */ maxTiles) {
    let best = null;
    let bestD = maxTiles;
    for (const c of cars) {
      const d = Math.hypot(c.x / TILE - player.x, c.y / TILE - player.y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  function driveCar(/** @type {any} */ car, /** @type {{throttle:number, steer:number}} */ cmd, /** @type {number} */ dt, /** @type {any} */ tune) {
    const next = car2dStep(car, cmd, dt, tune);
    if (blocked(next.x / TILE, next.y / TILE)) {
      car.vx *= -0.3;
      car.vy *= -0.3;
      return;
    }
    Object.assign(car, { x: next.x, y: next.y, heading: next.heading, vx: next.vx, vy: next.vy });
  }

  return {
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const dt = delta / 1000;
      const v = input.vector();
      const car = player.car;

      if (input.justPressed('enter')) {
        if (car) {
          player.car = null;
          player.x = car.x / TILE + Math.cos(car.heading + Math.PI / 2) * 1.2;
          player.y = car.y / TILE + Math.sin(car.heading + Math.PI / 2) * 1.2;
          if (blocked(player.x, player.y)) [player.x, player.y] = [car.x / TILE, car.y / TILE];
        } else {
          const near = nearestCar(2.4);
          if (near) {
            player.car = near;
            if (!near.stolen) {
              near.stolen = true;
              crime('vehicle');
            }
          }
        }
      }

      if (car) {
        driveCar(car, { throttle: -v.y, steer: v.x }, dt, CAR_DEFAULTS);
        player.x = car.x / TILE;
        player.y = car.y / TILE;
        for (const ped of [...peds]) {
          if (carSpeed(car) > 110 && Math.hypot(ped.x - player.x, ped.y - player.y) < 0.9) {
            ped.dot.destroy();
            peds.splice(peds.indexOf(ped), 1);
            killed += 1;
            crime('pedestrian');
          }
        }
      } else {
        if (v.x !== 0 || v.y !== 0) player.facing = v;
        const nx = player.x + v.x * WALK * dt;
        const ny = player.y + v.y * WALK * dt;
        if (!blocked(nx, player.y)) player.x = nx;
        if (!blocked(player.x, ny)) player.y = ny;
        if (input.justPressed('fire')) {
          crime('shooting');
          const target = peds.find((p) => {
            const dx = p.x - player.x;
            const dy = p.y - player.y;
            const d = Math.hypot(dx, dy);
            return d < 6 && (dx * player.facing.x + dy * player.facing.y) / (d || 1) > 0.8;
          });
          if (target) {
            target.dot.destroy();
            peds.splice(peds.indexOf(target), 1);
            killed += 1;
            crime('pedestrian');
          }
        }
      }

      // Pedestrians stroll between random nearby cells, and step aside from nothing: they are traffic.
      for (const ped of peds) {
        if (ped.path.length === 0) {
          walkTo(ped);
          continue;
        }
        const t = ped.path[0];
        const d = Math.hypot(t.x + 0.5 - ped.x, t.y + 0.5 - ped.y);
        if (d < 0.08) ped.path.shift();
        else {
          ped.x += ((t.x + 0.5 - ped.x) / d) * 1.4 * dt;
          ped.y += ((t.y + 0.5 - ped.y) / d) * 1.4 * dt;
        }
      }

      // Police: as many cars as the level calls for, all driving at the player.
      const want = pursuit(wanted.level);
      while (police.length < want.cars) police.push({ ...makeCar(station.x / TILE, station.y / TILE, 0x1d4ed8, 'police') });
      while (police.length > want.cars) police.pop().sprite.destroy();
      seen = false;
      for (const cop of police) {
        const dx = player.x - cop.x / TILE;
        const dy = player.y - cop.y / TILE;
        const distance = Math.hypot(dx, dy);
        if (distance < 14) seen = true;
        let turn = Math.atan2(dy, dx) - cop.heading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        driveCar(cop, { throttle: distance > 1.2 ? 1 : 0, steer: Math.max(-1, Math.min(1, turn * 2)) }, dt, { ...CAR_DEFAULTS, maxSpeed: want.speed });
        if (distance < 1.1) player.hp -= 12 * dt;
      }
      wanted = wantedReducer(wanted, { type: 'tick', dt: delta, seen });
      if (player.hp <= 0) {
        player.hp = 100;
        player.car = null;
        [player.x, player.y] = [home.x, home.y];
        wanted = wantedReducer(wanted, { type: 'clear' });
      }

      const place = (/** @type {any} */ obj, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z = 0) => {
        const p = world.toScreen(x, y);
        obj.setPosition(p.x, p.y).setDepth(world.depth(x, y, z));
      };
      place(body, player.x, player.y, 2);
      body.setVisible(!player.car);
      for (const c of [...cars, ...police]) {
        place(c.sprite, c.x / TILE, c.y / TILE, 1);
        c.sprite.setRotation(world.iso ? c.heading - Math.PI / 4 : c.heading);
      }
      for (const ped of peds) place(ped.dot, ped.x, ped.y, 1);

      hud.setScore(killed);
      hud.setHealth(Math.round(player.hp), 100);
      stars.setText('★'.repeat(wanted.level) + '☆'.repeat(5 - wanted.level));
    },
    state() {
      return {
        player: { position: [Number(player.x.toFixed(3)), Number(player.y.toFixed(3))], health: Math.round(player.hp) },
        crime: {
          wanted: wanted.level,
          unseenMs: Math.round(wanted.unseenMs),
          inCar: player.car !== null,
          speed: player.car ? Math.round(carSpeed(player.car)) : 0,
          police: police.length,
          pedestrians: peds.length,
          killed,
          cars: cars.length,
        },
      };
    },
  };
}
