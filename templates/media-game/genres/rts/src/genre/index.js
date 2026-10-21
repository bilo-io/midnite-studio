// @ts-check
/**
 * RTS genre (Phase 107 Theme H): box and click select, control groups, A* and
 * flow-field movement, gathering, a build queue, fog of war and a scripted
 * opponent. The simulation is in tile units; `kit/phaser/world2d.js` draws it
 * top-down or isometric. The engine-free rules live in `kit/core/genre/rts/`.
 */

import * as Phaser from 'phaser';

import { aiStep, createAi } from 'kit/core/genre/rts/ai.js';
import { astar } from 'kit/core/genre/rts/astar.js';
import { UNIT_TYPES, createEconomy, deposit, queueUnit, tickEconomy, GATHER_PER_TRIP } from 'kit/core/genre/rts/economy.js';
import { FOG, createVisibility, fogUpdate, visibleCount } from 'kit/core/genre/rts/fog.js';
import { flowField } from 'kit/core/genre/rts/flow-field.js';
import { createControlGroups, selectAt, selectInBox } from 'kit/core/genre/rts/selection.js';
import { createInput } from 'kit/phaser/input.js';
import { createWorld2d } from 'kit/phaser/world2d.js';

import config from '../game.config.js';
import { blockTexture, domeTexture, shadowTexture, tileTexture } from '../lit.js';

const COLS = 40;
const ROWS = 30;
const SIGHT = 5;
const SPEED = 3; // tiles/s
const HOME = { x: 3.5, y: 3.5 };
const ENEMY_HOME = { x: 36.5, y: 26.5 };
const MINERALS = [{ x: 6, y: 3 }, { x: 6, y: 4 }, { x: 33, y: 26 }, { x: 33, y: 27 }];
const TEAM_COLOR = { player: 0x6ea8ff, enemy: 0xe5484d };
const KIND = { worker: { hp: 20, radius: 0.28 }, soldier: { hp: 40, radius: 0.36 } };

/** 0 walkable, 1 rock. A few ridges to path around. */
function makeGrid() {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
  for (let y = 8; y < 22; y += 1) grid[y][20] = 1;
  for (let x = 12; x < 29; x += 1) grid[14][x] = x === 22 ? 0 : 1;
  for (const m of MINERALS) grid[m.y][m.x] = 2;
  return grid;
}

/** @param {Phaser.Scene} scene @param {{ rig?: any, fx: any, glow?: any }} ctx */
export function installGenre(scene, ctx) {
  const world = createWorld2d(scene, { perspective: config.perspective, cols: COLS, rows: ROWS });
  world.cover();
  // The base made the lighting and juice; this genre re-uses them for its own world.
  const { fx } = ctx;
  const { juice, lighting } = fx;
  fx.takeOver(null);
  // Open daylit grass under a steady wind. `ambience` replaces the base's own bed, so the two never stack.
  fx.tint('day');
  fx.ambience('ambience-wind', { volume: 0.32 });
  const shadow = shadowTexture(scene);
  const iso = world.iso;
  /** Pixel size of one tile along the grid axis, for sizing sprites on either perspective. */
  const tile = world.unit;
  scene.cameras.main.setBackgroundColor(0x0b0d12);
  const input = createInput(scene, {
    left: { keys: ['LEFT', 'A'] }, right: { keys: ['RIGHT', 'D'] }, up: { keys: ['UP', 'W'] }, down: { keys: ['DOWN', 'S'] },
    trainWorker: { keys: ['Q'] }, trainSoldier: { keys: ['E'] },
  });
  const grid = makeGrid();
  // Rock and minerals both block walking.
  const walls = grid.map((row) => row.map((c) => (c === 0 ? 0 : 1)));

  // The battlefield: lit grass tiles in two variants, rock as raised blocks, minerals as glowing crystals.
  const grass = [tileTexture(world, scene, 'rts-grass-a', 'grass', { seed: 2, normalStrength: 1.2 }), tileTexture(world, scene, 'rts-grass-b', 'grass', { seed: 6, base: 0x3f7a35, normalStrength: 1.2 })];
  const rock = blockTexture(world, scene, 'rts-rock', 'stone', { seed: 4, depth: 30 });
  const crystal = domeTexture(scene, 'rts-crystal', { size: 32, color: 0x2dd4bf, ring: 0.2 });
  /** Put a ground-or-block image on tile (x, y); a block stands `lift` px above its tile. */
  const placeTile = (/** @type {string} */ key, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, lift = 0) => {
    const p = world.toScreen(x, y);
    const image = scene.add.image(iso ? p.x - 32 : p.x, p.y - lift, key).setOrigin(0).setDepth(z);
    if (!iso) image.setDisplaySize(world.tileWidth, world.tileHeight);
    return lighting.lit(image);
  };
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const c = grid[y][x];
      placeTile(/** @type {string} */ (grass[(x * 7 + y * 3) % 5 === 0 ? 1 : 0]), x, y, -20);
      if (c === 1) placeTile(rock, x, y, world.depth(x, y, 0.5), iso ? 30 : 0);
      else if (c === 2) {
        const p = world.toScreen(x + 0.5, y + 0.5);
        lighting.lit(scene.add.image(p.x, p.y - (iso ? 8 : 0), crystal).setDisplaySize(tile * 0.9, tile * 0.9).setDepth(world.depth(x, y, 0.6)));
        scene.add.image(p.x, p.y + 4, shadow).setDisplaySize(tile * 1.2, tile * 0.6).setDepth(-15);
      }
    }
  }
  for (const m of MINERALS) {
    const p = world.toScreen(m.x + 0.5, m.y + 0.5);
    lighting.add(p.x, p.y, { radius: tile * 4, intensity: 1.0, color: 0x2dd4bf });
  }
  const fogLayer = scene.add.graphics().setDepth(9000);
  const box = scene.add.graphics().setDepth(9500).setScrollFactor(0);

  const economy = createEconomy({ minerals: 150, supplyCap: 12 });
  const enemyEconomy = createEconomy({ minerals: 300, supplyCap: 20 });
  const ai = createAi(3, 25000);
  const groups = createControlGroups();
  const visibility = createVisibility(COLS, ROWS);
  /** @type {any[]} */
  const units = [];
  let nextId = 1;
  let clock = 0;
  let frame = 0;
  /** @type {number[]} */
  let selected = [];
  /** @type {{ x: number, y: number } | null} */
  let dragStart = null;

  function spawn(/** @type {'player'|'enemy'} */ team, /** @type {'worker'|'soldier'} */ type, /** @type {{x:number,y:number}} */ at) {
    // A lit, round-shaded unit in its team colour; soldiers are brighter and wear eyes so they read as fighters.
    const key = domeTexture(scene, `rts-${team}-${type}`, { size: 32, color: type === 'soldier' ? (team === 'player' ? 0x9cc4ff : 0xff8a8d) : TEAM_COLOR[team], eyes: type === 'soldier' });
    const size = KIND[type].radius * world.unit * 2.4;
    const dot = lighting.lit(scene.add.image(0, 0, key).setDisplaySize(size, size));
    const dropShadow = scene.add.image(0, 0, shadow).setDisplaySize(size * 1.3, size * 0.65);
    const ring = scene.add.ellipse(0, 0, size * 1.3, size * 0.8).setStrokeStyle(2, 0x4ade80, 0.95).setVisible(false);
    const unit = { id: nextId++, team, type, x: at.x, y: at.y, hp: KIND[type].hp, radius: KIND[type].radius, path: /** @type {{x:number,y:number}[]} */ ([]), goal: /** @type {any} */ (null), task: /** @type {any} */ (null), carry: 0, dot, dropShadow, ring, hitAt: 0, combo: 0, size };
    units.push(unit);
    return unit;
  }
  const base = (/** @type {{x:number,y:number}} */ at, /** @type {number} */ color) => {
    // A metal block in the team colour with a glow beside it.
    const key = blockTexture(world, scene, `rts-hq-${color}`, 'metal', { seed: 12, base: color, accent: 0x1f2937, depth: 40 });
    const p = world.toScreen(at.x, at.y);
    const hq = lighting.lit(scene.add.image(p.x, p.y + (iso ? 20 : 0), key).setOrigin(0.5, iso ? 1 : 0.5).setScale(iso ? 1.4 : 1).setDepth(world.depth(at.x, at.y, 0.5)));
    if (!iso) hq.setDisplaySize(world.unit * 1.8, world.unit * 1.8);
    lighting.add(p.x, p.y, { radius: tile * 5, intensity: 1.1, color });
    return hq;
  };
  const homeHq = base(HOME, TEAM_COLOR.player);
  const enemyHq = base(ENEMY_HOME, TEAM_COLOR.enemy);
  let enemyHqHp = 300;
  let won = false;
  for (let i = 0; i < 3; i += 1) spawn('player', 'worker', { x: HOME.x + 1.2 + i * 0.5, y: HOME.y + 1 });
  spawn('player', 'soldier', { x: HOME.x + 1.5, y: HOME.y + 2.2 });
  spawn('enemy', 'worker', { x: ENEMY_HOME.x - 1.2, y: ENEMY_HOME.y - 1 });
  world.centreOn(HOME.x, HOME.y);

  const cell = (/** @type {{x:number,y:number}} */ p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
  const nearestOpen = (/** @type {{x:number,y:number}} */ target) => {
    const c = cell(target);
    for (let r = 0; r < 4; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (walls[c.y + dy]?.[c.x + dx] === 0) return { x: c.x + dx, y: c.y + dy };
    }
    return c;
  };

  /** Order units to a tile: one unit uses A*, a group shares a flow field. */
  function moveTo(/** @type {any[]} */ movers, /** @type {{x:number,y:number}} */ target) {
    const goal = nearestOpen(target);
    if (movers.length > 1) {
      const field = flowField(walls, goal);
      for (const u of movers) Object.assign(u, { path: [], goal, field, task: null });
    } else {
      for (const u of movers) {
        const path = astar(walls, cell(u), goal);
        Object.assign(u, { path: path ? path.slice(1) : [], goal, field: null, task: null });
      }
    }
  }

  function command(/** @type {{x:number,y:number}} */ at) {
    const picked = units.filter((u) => selected.includes(u.id) && u.team === 'player');
    if (picked.length === 0) return;
    const c = cell(at);
    // A ping where the order lands (green for gather, white for move) and a click, panned by where it is on screen.
    const ping = world.toScreen(at.x, at.y);
    fx.ring(ping.x, ping.y, { radius: tile * 1.2, ms: 420, color: grid[c.y]?.[c.x] === 2 ? 0x2dd4bf : 0xffffff, squash: iso ? 0.5 : 1 });
    fx.play('ui-click', { x: ping.x, pitch: 0.9, volume: 0.7 });
    for (const u of picked) juice.squash(u.dot, [1.18, 1.18], { ms: 220 });
    if (grid[c.y]?.[c.x] === 2) {
      for (const u of picked.filter((p) => p.type === 'worker')) {
        const stand = nearestOpen({ x: c.x + 0.5, y: c.y + 0.5 });
        const path = astar(walls, cell(u), stand);
        Object.assign(u, { path: path ? path.slice(1) : [], goal: stand, field: null, task: { kind: 'gather', mineral: c, left: 1500 } });
      }
      return;
    }
    moveTo(picked, at);
  }

  function step(/** @type {any} */ u, /** @type {number} */ dt) {
    let target = null;
    if (u.field) {
      const here = cell(u);
      const dir = u.field.dir[here.y]?.[here.x];
      if (dir) target = { x: here.x + 0.5 + dir.x, y: here.y + 0.5 + dir.y };
      else u.field = null;
    } else if (u.path.length > 0) {
      const next = u.path[0];
      target = { x: next.x + 0.5, y: next.y + 0.5 };
      if (Math.hypot(target.x - u.x, target.y - u.y) < 0.12) u.path.shift();
    }
    if (!target) return false;
    const d = Math.hypot(target.x - u.x, target.y - u.y) || 1;
    const move = Math.min(d, SPEED * dt);
    u.x += ((target.x - u.x) / d) * move;
    u.y += ((target.y - u.y) / d) * move;
    return true;
  }

  function work(/** @type {any} */ u, /** @type {number} */ dtMs) {
    if (u.task?.kind === 'gather' && u.path.length === 0 && !u.field) {
      if (u.carry > 0) {
        // Back at the base: drop the load, then return to the same patch.
        if (Math.hypot(HOME.x - u.x, HOME.y - u.y) < 2.4) {
          deposit(economy, u.carry);
          const hq = world.toScreen(HOME.x, HOME.y);
          juice.text(hq.x, hq.y - tile, `+${u.carry}`, 'heal');
          juice.burst('spark', hq.x, hq.y, { count: 5, scale: 0.6, colors: [0x2dd4bf, 0xa7f3d0] });
          fx.play('coin', { x: hq.x, volume: 0.7 });
          u.carry = 0;
          const p = astar(walls, cell(u), nearestOpen({ x: u.task.mineral.x + 0.5, y: u.task.mineral.y + 0.5 }));
          u.path = p ? p.slice(1) : [];
          u.task.left = 1500;
        }
      } else {
        u.task.left -= dtMs;
        if (u.task.left <= 0) {
          u.carry = GATHER_PER_TRIP;
          const p = astar(walls, cell(u), nearestOpen({ x: HOME.x + 1, y: HOME.y + 1 }));
          u.path = p ? p.slice(1) : [];
        }
      }
    }
  }

  function fight(/** @type {number} */ dtMs) {
    for (const u of units) {
      if (u.type !== 'soldier') continue;
      const foe = units.find((o) => o.team !== u.team && Math.hypot(o.x - u.x, o.y - u.y) < 1.6);
      const hq = !foe && u.team === 'player' && Math.hypot(ENEMY_HOME.x - u.x, ENEMY_HOME.y - u.y) < 2;
      if (foe) foe.hp -= (12 * dtMs) / 1000;
      else if (hq) enemyHqHp -= (12 * dtMs) / 1000;
      // A blow lands about twice a second: sparks, a thud, a flash and a number, on whoever is being hit.
      if ((foe || hq) && clock - u.hitAt > 480) {
        // Blows landed in a row build a combo (the gap is the loop's own clock, so a replay matches): the second and third
        // ring as combo hits, every fourth is a critical that bites for half again.
        u.combo = clock - u.hitAt < 900 ? u.combo + 1 : 1;
        u.hitAt = clock;
        const at = foe ?? ENEMY_HOME;
        const p = world.toScreen(at.x, at.y);
        const crit = u.combo % 4 === 0;
        if (crit) {
          if (foe) foe.hp -= 6;
          else enemyHqHp -= 6;
          juice.trigger('critical', { x: p.x, y: p.y, strength: 0.7, text: 12, textKind: 'crit' });
        } else {
          juice.burst('spark', p.x, p.y, { count: 5, scale: 0.6 });
          fx.play(u.combo >= 2 ? 'combo-hit' : 'hit', { x: p.x, power: 0.55, volume: 0.6 });
          juice.text(p.x, p.y - tile * 0.6, 6, 'hit');
        }
        if (foe) juice.flash(foe.dot);
        else if (!crit) juice.shake(0.08);
        if (u.dot.visible) juice.squash(u.dot, [1.2, 0.85], { ms: 160 });
      }
    }
    for (let i = units.length - 1; i >= 0; i -= 1) {
      if (units[i].hp <= 0) {
        const dead = units[i];
        const p = world.toScreen(dead.x, dead.y);
        juice.burst('debris', p.x, p.y, { scale: 1, colors: [TEAM_COLOR[dead.team], 0xffffff, 0x4b5563] });
        fx.play('death', { x: p.x, power: 0.6, volume: 0.7 });
        juice.shake(dead.team === 'player' ? 0.2 : 0.12);
        dead.dot.destroy();
        dead.dropShadow.destroy();
        dead.ring.destroy();
        units.splice(i, 1);
      }
    }
    if (enemyHqHp <= 0 && !won) {
      won = true;
      const p = world.toScreen(ENEMY_HOME.x, ENEMY_HOME.y);
      juice.trigger('explosion', { x: p.x, y: p.y, strength: 1.4 });
      juice.trigger('quest-complete', { x: p.x, y: p.y });
    }
  }

  const onDown = (/** @type {Phaser.Input.Pointer} */ p) => {
    if (p.rightButtonDown()) command(world.pointerTile());
    else dragStart = { x: p.x, y: p.y };
  };
  const onUp = (/** @type {Phaser.Input.Pointer} */ p) => {
    if (!dragStart) return;
    // Select in screen space, so the same drag works on the diamond grid as on the square one.
    const camera = scene.cameras.main;
    const onScreen = units
      .filter((u) => u.team === 'player')
      .map((u) => {
        const at = world.toScreen(u.x, u.y);
        return { id: u.id, x: at.x, y: at.y, radius: u.radius * world.unit * 1.5 };
      });
    const here = { x: p.x + camera.scrollX, y: p.y + camera.scrollY };
    const there = { x: dragStart.x + camera.scrollX, y: dragStart.y + camera.scrollY };
    const dragged = Math.hypot(p.x - dragStart.x, p.y - dragStart.y) > 6;
    if (dragged) selected = selectInBox(onScreen, { x1: there.x, y1: there.y, x2: here.x, y2: here.y });
    else {
      const id = selectAt(onScreen, here);
      selected = id === null ? [] : [id];
    }
    dragStart = null;
    if (selected.length > 0) {
      fx.play('ui-click', { pitch: 1.5, volume: 0.6 });
      for (const u of units) if (selected.includes(u.id)) juice.squash(u.dot, [1.25, 1.25], { ms: 240 });
    }
  };
  scene.input.mouse?.disableContextMenu();
  scene.input.on('pointerdown', onDown);
  scene.input.on('pointerup', onUp);
  scene.input.keyboard?.on('keydown', (/** @type {KeyboardEvent} */ e) => {
    if (!/^[0-9]$/.test(e.key)) return;
    const n = Number(e.key);
    if (e.ctrlKey || e.metaKey) groups.set(n, selected);
    else selected = groups.recall(n, (id) => units.some((u) => u.id === id));
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off('pointerdown', onDown);
    scene.input.off('pointerup', onUp);
  });

  function drawFog() {
    fogLayer.clear();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const v = visibility[y][x];
        if (v === FOG.visible) continue;
        world.drawTile(fogLayer, x, y, 0x000000, v === FOG.hidden ? 1 : 0.55);
      }
    }
  }

  return {
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const dt = delta / 1000;
      clock += delta;
      const v = input.vector();
      world.pan(v.x * 420 * dt, v.y * 420 * dt);

      if (input.justPressed('trainWorker')) {
        queueUnit(economy, 'worker');
        fx.play('ui-click', { pitch: 1.1, volume: 0.7 });
      }
      if (input.justPressed('trainSoldier')) {
        queueUnit(economy, 'soldier');
        fx.play('ui-click', { pitch: 0.8, volume: 0.7 });
      }
      for (const type of tickEconomy(economy, delta)) {
        const fresh = spawn('player', /** @type {any} */ (type), { x: HOME.x + 1, y: HOME.y + 1.5 });
        // A new unit pops out of the base: a chime, dust and a squash.
        const p = world.toScreen(fresh.x, fresh.y);
        fx.play('powerup', { x: p.x, power: 0.6, volume: 0.7 });
        juice.burst('dust', p.x, p.y + 4, { count: 6, scale: 0.7 });
        juice.squash(fresh.dot, [0.7, 1.3], { ms: 360 });
      }
      for (const type of tickEconomy(enemyEconomy, delta)) spawn('enemy', /** @type {any} */ (type), { x: ENEMY_HOME.x - 1, y: ENEMY_HOME.y - 1.5 });
      enemyEconomy.minerals += (6 * delta) / 1000;

      const enemySoldiers = units.filter((u) => u.team === 'enemy' && u.type === 'soldier').map((u) => u.id);
      for (const cmd of aiStep(ai, { time: clock, minerals: enemyEconomy.minerals, queueLength: enemyEconomy.queue.length, soldierIds: enemySoldiers }, { unitCost: (t) => UNIT_TYPES[t]?.cost ?? 0 })) {
        if (cmd.kind === 'train') queueUnit(enemyEconomy, cmd.type);
        else {
          moveTo(units.filter((u) => cmd.ids.includes(u.id)), HOME);
          // The scripted opponent sends a wave: a low horn and a red pulse so the player knows to look.
          fx.play('laser', { pitch: 0.45, power: 0.7 });
          juice.screenFlash(0xff3b3b, 0.12, 300);
        }
      }

      for (const u of units) {
        step(u, dt);
        work(u, delta);
        const p = world.toScreen(u.x, u.y);
        const shown = u.team === 'player' || visibility[Math.floor(u.y)]?.[Math.floor(u.x)] === FOG.visible;
        u.dot.setPosition(p.x, p.y - u.size * 0.15).setDepth(world.depth(u.x, u.y, 1)).setVisible(shown);
        u.dropShadow.setPosition(p.x, p.y + u.size * 0.2).setDepth(world.depth(u.x, u.y, 0.2)).setVisible(shown);
        u.ring.setPosition(p.x, p.y + u.size * 0.2).setDepth(world.depth(u.x, u.y, 0.3)).setVisible(shown && selected.includes(u.id));
      }
      fight(delta);
      enemyHq.setVisible(visibility[Math.floor(ENEMY_HOME.y)]?.[Math.floor(ENEMY_HOME.x)] !== FOG.hidden);
      fogUpdate(visibility, [...units.filter((u) => u.team === 'player'), HOME], SIGHT);
      if (frame++ % 4 === 0) drawFog();

      box.clear();
      const pointer = scene.input.activePointer;
      if (dragStart && pointer.isDown && Math.hypot(pointer.x - dragStart.x, pointer.y - dragStart.y) > 6) {
        box.lineStyle(1, 0x4ade80, 1).strokeRect(dragStart.x, dragStart.y, pointer.x - dragStart.x, pointer.y - dragStart.y);
      }
      homeHq.setVisible(true);
    },
    state() {
      const camera = scene.cameras.main;
      const mine = units.filter((u) => u.team === 'player');
      return {
        player: { position: [Number(HOME.x.toFixed(2)), Number(HOME.y.toFixed(2))] },
        camera: { x: Math.round(camera.scrollX), y: Math.round(camera.scrollY) },
        rts: {
          minerals: Math.floor(economy.minerals),
          supply: `${economy.supplyUsed}/${economy.supplyCap}`,
          queue: economy.queue.map((q) => q.type),
          selected: [...selected],
          units: mine.length,
          workers: mine.filter((u) => u.type === 'worker').length,
          soldiers: mine.filter((u) => u.type === 'soldier').length,
          enemyUnits: units.length - mine.length,
          enemyHqHp: Math.max(0, Math.round(enemyHqHp)),
          aiWaves: ai.waves,
          visibleTiles: visibleCount(visibility),
          groups: groups.snapshot(),
        },
      };
    },
  };
}
