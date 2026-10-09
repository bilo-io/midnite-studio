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
import { blockTexture, domeTexture, gridImage, shadowTexture, tileTexture } from '../lit.js';
import { COLS, ROWS, TILE, cityMap, isRoad } from './city.js';

const WALK = 4; // tiles/s

/** A car seen from above: a painted body with a windscreen, rear window and lamps. Drawn in code, one texture per colour. @param {Phaser.Scene} scene @param {string} key @param {number} color */
function carTexture(scene, key, color) {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const css = `#${color.toString(16).padStart(6, '0')}`;
  const body = c.createLinearGradient(0, 0, 0, 32);
  body.addColorStop(0, '#ffffff55');
  body.addColorStop(0.2, css);
  body.addColorStop(1, '#00000088');
  c.fillStyle = '#111';
  c.fillRect(8, 0, 12, 5);
  c.fillRect(8, 27, 12, 5);
  c.fillRect(42, 0, 12, 5);
  c.fillRect(42, 27, 12, 5);
  c.fillStyle = css;
  c.beginPath();
  c.roundRect(2, 3, 60, 26, 7);
  c.fill();
  c.fillStyle = body;
  c.beginPath();
  c.roundRect(2, 3, 60, 26, 7);
  c.fill();
  c.fillStyle = '#9fd0ff';
  c.fillRect(38, 7, 11, 18);
  c.fillStyle = '#5d86b0';
  c.fillRect(14, 8, 8, 16);
  c.fillStyle = '#fff6c2';
  c.fillRect(59, 6, 3, 6);
  c.fillRect(59, 20, 3, 6);
  c.fillStyle = '#ff4a4a';
  c.fillRect(2, 6, 3, 6);
  c.fillRect(2, 20, 3, 6);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** @param {Phaser.Scene} scene @param {{ rig?: any, fx: any, glow: Phaser.GameObjects.Light }} ctx */
export function installGenre(scene, ctx) {
  const map = cityMap();
  const solid = collisionGrid(map);
  const objects = tiledObjects(map);
  const world = createWorld2d(scene, { perspective: config.perspective, cols: COLS, rows: ROWS });
  world.cover();
  // The base made the lighting and juice; this genre re-uses them for its own world, keeping the light that follows the player.
  const { fx } = ctx;
  const { juice, lighting } = fx;
  fx.takeOver(ctx.glow);
  ctx.glow.setRadius(world.unit * 7).setIntensity(0.9);
  // A city at dusk with its crowd murmur. `ambience` replaces the base's own bed rather than stacking on it.
  fx.tint('dusk');
  fx.ambience('ambience-crowd', { volume: 0.34 });
  /** The driven car's engine bed: started on entering, retuned from its speed every frame, stopped on leaving. @type {{ stop(): void, set(p: object): void } | null} */
  let engine = null;
  const stopEngine = () => {
    engine?.stop();
    engine = null;
  };
  const shadow = shadowTexture(scene);
  const screen = (/** @type {number} */ tx, /** @type {number} */ ty) => world.toScreen(tx, ty);
  /** An image with a soft drop shadow that `place` keeps under it. @param {Phaser.GameObjects.Image} image @param {number} w @param {number} h */
  const shadowed = (image, w, h) => {
    /** @type {any} */ (image).shadow = scene.add.image(0, 0, shadow).setDisplaySize(w, h);
    return image;
  };
  const input = createInput(scene, {
    left: { keys: ['LEFT', 'A'] }, right: { keys: ['RIGHT', 'D'] }, up: { keys: ['UP', 'W'] }, down: { keys: ['DOWN', 'S'] },
    enter: { keys: ['E', 'SPACE'] }, fire: { keys: ['F', 'J'] },
  });
  const hud = createHud(scene, {});
  const stars = scene.add.text(scene.scale.width / 2, 10, '', { fontFamily: 'monospace', fontSize: '18px', color: '#fde047' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);

  // Asphalt and pavement as lit tiles, buildings as raised blocks, and a street lamp at every junction.
  const asphalt = [tileTexture(world, scene, 'crime-road-a', 'stone', { seed: 2, base: 0x6b7280, accent: 0x4b5260, normalStrength: 0.5 }), tileTexture(world, scene, 'crime-road-b', 'stone', { seed: 9, base: 0x636a78, accent: 0x474e5b, normalStrength: 0.5 })];
  const pavement = tileTexture(world, scene, 'crime-pavement', 'tiles', { seed: 4, base: 0xb4bac6, accent: 0x8d94a3, normalStrength: 0.5 });
  const buildings = [blockTexture(world, scene, 'crime-bld-a', 'brick', { seed: 5, depth: 44 }), blockTexture(world, scene, 'crime-bld-b', 'metal', { seed: 7, base: 0x7a8aa6, accent: 0x3b4a66, depth: 44 }), blockTexture(world, scene, 'crime-bld-c', 'brick', { seed: 13, base: 0x8a6a4a, accent: 0xc9b8a0, depth: 44 })];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (solid[y][x]) {
        lighting.lit(gridImage(scene, world, /** @type {string} */ (pavement), x, y, -20));
        lighting.lit(gridImage(scene, world, /** @type {string} */ (buildings[(Math.floor(x / 14) + Math.floor(y / 14)) % 3]), x, y, world.depth(x, y, 0.5), world.iso ? 44 : 0));
      } else {
        lighting.lit(gridImage(scene, world, /** @type {string} */ (isRoad(x, y) ? asphalt[(x * 3 + y) % 4 === 0 ? 1 : 0] : pavement), x, y, -20));
      }
    }
  }
  /** Street lamps: a warm pool of light and a bright bulb at each junction. */
  const lamps = [];
  for (let by = 0; by * 14 + 1.5 < ROWS; by += 1) {
    for (let bx = 0; bx * 14 + 1.5 < COLS; bx += 1) {
      const p = screen(bx * 14 + 1.5, by * 14 + 1.5);
      lamps.push({ light: lighting.add(p.x, p.y, { radius: world.unit * 7, intensity: 0.8, color: 0xffd9a0 }), bulb: scene.add.image(p.x, p.y - 8, 'kit-juice-dot').setTint(0xffe2a0).setBlendMode(1).setDisplaySize(22, 22).setDepth(world.depth(bx * 14 + 1.5, by * 14 + 1.5, 3)), seed: bx * 2.3 + by });
    }
  }
  const blocked = (/** @type {number} */ tx, /** @type {number} */ ty) => solid[Math.floor(ty)]?.[Math.floor(tx)] !== 0;

  const spawn = objects.spawns[0] ?? { x: 48, y: 48 };
  const player = { x: spawn.x / TILE, y: spawn.y / TILE, hp: 100, car: /** @type {any} */ (null), facing: { x: 1, y: 0 } };
  const home = { x: player.x, y: player.y };
  const body = shadowed(lighting.lit(scene.add.image(0, 0, domeTexture(scene, 'crime-hero', { size: 32, color: 0xfde68a, eyes: true })).setDisplaySize(world.unit * 0.7, world.unit * 0.7)), world.unit, world.unit * 0.5);
  let stride = 0;
  let lastWalk = { x: player.x, y: player.y };
  let lastLevel = 0;
  let lastSiren = 0;
  let lastHurt = -1e9;
  let clockMs = 0;
  let skidAt = 0;
  let wanted = createWanted();
  let seen = false;
  let killed = 0;

  /** Cars live in sim pixels (the handling constants are px/s); everything else in tiles. */
  const makeCar = (/** @type {number} */ tx, /** @type {number} */ ty, /** @type {number} */ color, /** @type {'parked'|'police'} */ kind) => {
    const sprite = shadowed(lighting.lit(scene.add.image(0, 0, carTexture(scene, `crime-car-${color}`, color)).setDisplaySize(world.unit * 1.5, world.unit * 0.75)), world.unit * 1.7, world.unit * 0.8);
    // Police cars carry a light bar: two additive dots that swap red and blue.
    const bar = kind === 'police' ? [0xff2a2a, 0x2a6bff].map((tint) => scene.add.image(0, 0, 'kit-juice-dot').setTint(tint).setBlendMode(1).setDisplaySize(world.unit * 0.7, world.unit * 0.7)) : [];
    return { ...createCar({ x: tx * TILE, y: ty * TILE, heading: 0 }), kind, stolen: false, sprite, bar, bumpAt: 0 };
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
    const color = [0x93c5fd, 0xf9a8d4, 0xbef264, 0xfcd34d][i % 4] ?? 0x93c5fd;
    peds.push({ x: at.x + 0.5, y: at.y + 0.5, path: [], color, dot: shadowed(lighting.lit(scene.add.image(0, 0, domeTexture(scene, `crime-ped-${color}`, { size: 24, color })).setDisplaySize(world.unit * 0.45, world.unit * 0.45)), world.unit * 0.6, world.unit * 0.3) });
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
      // A crash: sparks, a clang and a shake that scale with the speed it hit at (rate-limited per car).
      const speed = carSpeed(car);
      if (speed > 60 && clockMs - car.bumpAt > 400) {
        car.bumpAt = clockMs;
        const p = screen(car.x / TILE, car.y / TILE);
        const power = Math.min(1.4, speed / 160);
        juice.burst('spark', p.x, p.y, { scale: power });
        fx.play('block', { x: p.x, power: 0.5 + power * 0.5 });
        if (car === player.car) juice.shake(0.15 + power * 0.35);
      }
      car.vx *= -0.3;
      car.vy *= -0.3;
      return;
    }
    Object.assign(car, { x: next.x, y: next.y, heading: next.heading, vx: next.vx, vy: next.vy });
  }

  /** A pedestrian goes down: a hit-stop thump, debris in their colour, a scream-ish cry and a flash of shake. */
  function killPed(/** @type {any} */ ped, /** @type {number} */ strength) {
    const p = screen(ped.x, ped.y);
    juice.trigger('hit', { x: p.x, y: p.y - 8, strength });
    juice.burst('debris', p.x, p.y, { colors: [ped.color, 0xffffff, 0x7f1d1d], scale: strength });
    fx.play('death', { x: p.x, power: 0.6, volume: 0.7 });
    ped.dot.shadow.destroy();
    ped.dot.destroy();
    peds.splice(peds.indexOf(ped), 1);
    killed += 1;
    crime('pedestrian');
  }

  return {
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const dt = delta / 1000;
      clockMs += delta;
      const v = input.vector();
      const car = player.car;

      if (input.justPressed('enter')) {
        if (car) {
          player.car = null;
          stopEngine();
          player.x = car.x / TILE + Math.cos(car.heading + Math.PI / 2) * 1.2;
          player.y = car.y / TILE + Math.sin(car.heading + Math.PI / 2) * 1.2;
          if (blocked(player.x, player.y)) [player.x, player.y] = [car.x / TILE, car.y / TILE];
          fx.play('door', { x: screen(player.x, player.y).x, power: 0.8 });
        } else {
          const near = nearestCar(2.4);
          if (near) {
            player.car = near;
            stopEngine();
            engine = fx.loop('engine-loop', { volume: 0.25, pitch: 0.75 });
            fx.play('door', { x: near.sprite.x, power: 0.8 });
            juice.squash(near.sprite, [1.08, 1.15], { ms: 260 });
            if (!near.stolen) {
              near.stolen = true;
              crime('vehicle');
            }
          }
        }
      }

      if (car) {
        driveCar(car, { throttle: -v.y, steer: v.x }, dt, CAR_DEFAULTS);
        // Revs follow speed: an idle growl at a standstill, a scream near the top end.
        const rev = Math.min(1, carSpeed(car) / CAR_DEFAULTS.maxSpeed);
        engine?.set({ pitch: 0.75 + rev * 1.1, volume: 0.22 + rev * 0.2 });
        player.x = car.x / TILE;
        player.y = car.y / TILE;
        for (const ped of [...peds]) {
          if (carSpeed(car) > 110 && Math.hypot(ped.x - player.x, ped.y - player.y) < 0.9) {
            killPed(ped, 1.2);
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
          // The shot: a muzzle flash that lights the street for an instant, a bang and a flick of shake.
          const at = screen(player.x, player.y);
          const flash = lighting.add(at.x, at.y, { radius: world.unit * 5, intensity: 1.6, color: 0xffd28a });
          scene.time.delayedCall(70, () => lighting.lights.removeLight(flash));
          juice.trigger('gunshot-pistol', { x: at.x + player.facing.x * 12, y: at.y + player.facing.y * 8 - 6, dir: [player.facing.x, player.facing.y] });
          const target = peds.find((p) => {
            const dx = p.x - player.x;
            const dy = p.y - player.y;
            const d = Math.hypot(dx, dy);
            return d < 6 && (dx * player.facing.x + dy * player.facing.y) / (d || 1) > 0.8;
          });
          if (target) {
            killPed(target, 0.8);
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
      while (police.length > want.cars) {
        const gone = police.pop();
        gone.sprite.shadow.destroy();
        gone.sprite.destroy();
        for (const b of gone.bar) b.destroy();
      }
      seen = false;
      for (const cop of police) {
        const dx = player.x - cop.x / TILE;
        const dy = player.y - cop.y / TILE;
        const distance = Math.hypot(dx, dy);
        if (distance < 14) seen = true;
        let turn = Math.atan2(dy, dx) - cop.heading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        driveCar(cop, { throttle: distance > 1.2 ? 1 : 0, steer: Math.max(-1, Math.min(1, turn * 2)) }, dt, { ...CAR_DEFAULTS, maxSpeed: want.speed });
        if (distance < 1.1) {
          player.hp -= 12 * dt;
          if (clockMs - lastHurt > 600) {
            lastHurt = clockMs;
            const at = screen(player.x, player.y);
            juice.trigger('hurt', { target: player.car ? player.car.sprite : body, x: at.x, y: at.y - 8, strength: 0.6 });
          }
        }
      }
      wanted = wantedReducer(wanted, { type: 'tick', dt: delta, seen });
      // A new star: a siren sting and a red pulse. Losing the cops: a relieved click.
      if (wanted.level > lastLevel) {
        fx.play('laser', { pitch: 0.6, power: 0.8 });
        juice.screenFlash(0xff3b3b, 0.15, 260);
        juice.shake(0.2);
      } else if (wanted.level < lastLevel) fx.play('ui-click', { pitch: 1.4, volume: 0.8 });
      lastLevel = wanted.level;
      // While they are on the chase: a two-tone siren from the nearest cop.
      if (police.length > 0 && clockMs - lastSiren > 650) {
        lastSiren = clockMs;
        const near = police[0];
        fx.play('laser', { x: near.sprite.x, pitch: Math.floor(clockMs / 650) % 2 === 0 ? 0.95 : 0.7, power: 0.25, volume: 0.5 });
      }
      if (player.hp <= 0) {
        const at = screen(player.x, player.y);
        juice.trigger('death', { x: at.x, y: at.y });
        player.hp = 100;
        player.car = null;
        stopEngine();
        [player.x, player.y] = [home.x, home.y];
        wanted = wantedReducer(wanted, { type: 'clear' });
      }

      const place = (/** @type {any} */ obj, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z = 0) => {
        const p = world.toScreen(x, y);
        obj.setPosition(p.x, p.y).setDepth(world.depth(x, y, z));
      };
      place(body, player.x, player.y, 2);
      body.setVisible(!player.car);
      /** @type {any} */ (body).shadow.setVisible(!player.car);
      /** @type {any} */ (body).shadow.setPosition(body.x, body.y + world.unit * 0.25).setDepth(world.depth(player.x, player.y, 0.2));
      const blink = Math.floor(clockMs / 180) % 2 === 0;
      for (const c of [...cars, ...police]) {
        place(c.sprite, c.x / TILE, c.y / TILE, 1);
        c.sprite.setRotation(world.iso ? c.heading - Math.PI / 4 : c.heading);
        c.sprite.shadow.setPosition(c.sprite.x + 4, c.sprite.y + 6).setDepth(world.depth(c.x / TILE, c.y / TILE, 0.2));
        c.bar.forEach((b, i) => b.setPosition(c.sprite.x, c.sprite.y - 8).setDepth(c.sprite.depth + 1).setAlpha((i === 0) === blink ? 0.95 : 0.15));
      }
      // The player's headlights: a warm cone ahead of the car while driving, and a skid of dust when it slides.
      if (player.car) {
        const c = player.car;
        ctx.glow.setPosition(c.sprite.x + Math.cos(c.heading) * world.unit * 3, c.sprite.y + Math.sin(c.heading) * world.unit * 3 * (world.iso ? 0.5 : 1));
        if (Math.abs(v.x) > 0.5 && carSpeed(c) > 140 && clockMs - skidAt > 120) {
          skidAt = clockMs;
          juice.burst('dust', c.sprite.x, c.sprite.y + 6, { count: 3, scale: 0.6 });
        }
      } else ctx.glow.setPosition(body.x, body.y);
      for (const ped of peds) {
        place(ped.dot, ped.x, ped.y, 1);
        ped.dot.shadow.setPosition(ped.dot.x, ped.dot.y + world.unit * 0.2).setDepth(world.depth(ped.x, ped.y, 0.2));
      }
      for (const l of lamps) {
        const f = fx.flicker(clockMs / 1000, l.seed);
        l.light.setIntensity(0.8 * (0.94 + 0.06 * f));
        l.bulb.setAlpha(0.7 + 0.3 * f);
      }
      // Footsteps on foot.
      stride += Math.hypot(player.x - lastWalk.x, player.y - lastWalk.y);
      lastWalk = { x: player.x, y: player.y };
      if (!player.car && stride >= 0.8) {
        stride -= 0.8;
        juice.trigger('footstep');
      } else if (player.car) stride = 0;

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
          engine: engine !== null,
          ambience: fx.bedName,
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
