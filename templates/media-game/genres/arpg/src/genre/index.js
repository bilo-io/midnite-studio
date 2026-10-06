// @ts-check
/**
 * ARPG genre (Phase 107 Theme H): click-to-move, a four-skill hotbar, health and
 * mana, loot with rarity, an inventory with equipment, and a procedural dungeon
 * of connected rooms. Simulated in tile units, drawn top-down or isometric by
 * `kit/phaser/world2d.js`; the rules live in `kit/core/genre/arpg/`.
 */

import * as Phaser from 'phaser';

import { generateDungeon } from 'kit/core/genre/arpg/dungeon.js';
import { createInventory, equip, equippedPower, pickUp } from 'kit/core/genre/arpg/inventory.js';
import { DEFAULT_TABLE, rollLoot } from 'kit/core/genre/arpg/loot.js';
import { astar } from 'kit/core/genre/rts/astar.js';
import { createHud } from 'kit/phaser/hud.js';
import { createInput } from 'kit/phaser/input.js';
import { createWorld2d } from 'kit/phaser/world2d.js';
import { rng } from 'kit/core/rng.js';

import config from '../game.config.js';

const SPEED = 4.2; // tiles/s
const RARITY_COLOR = { common: 0xd1d5db, magic: 0x60a5fa, rare: 0xfacc15, unique: 0xfb923c };
const SKILLS = [
  { id: 'strike', key: 'skill1', mana: 0, cooldown: 400 },
  { id: 'fireball', key: 'skill2', mana: 10, cooldown: 700 },
  { id: 'nova', key: 'skill3', mana: 25, cooldown: 2500 },
  { id: 'potion', key: 'skill4', mana: 0, cooldown: 5000 },
];

/** @param {Phaser.Scene} scene @param {{ rig?: any }} _ctx */
export function installGenre(scene, _ctx) {
  const dungeon = generateDungeon(7, 12);
  const grid = dungeon.grid;
  const world = createWorld2d(scene, { perspective: config.perspective, cols: dungeon.width, rows: dungeon.height });
  world.cover();
  const input = createInput(scene, {
    left: { keys: ['LEFT', 'A'] }, right: { keys: ['RIGHT', 'D'] }, up: { keys: ['UP', 'W'] }, down: { keys: ['DOWN', 'S'] },
    skill1: { keys: ['ONE'] }, skill2: { keys: ['TWO'] }, skill3: { keys: ['THREE'] }, skill4: { keys: ['FOUR'] },
    bag: { keys: ['I'] },
  });
  const hud = createHud(scene, {});

  const floor = scene.add.graphics().setDepth(-10);
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (grid[y][x] === 0) world.drawTile(floor, x, y, (x + y) % 2 === 0 ? 0x3b4252 : 0x353b49);
      else if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === 0)) world.drawTile(floor, x, y, 0x1f2430);
    }
  }
  const open = (/** @type {number} */ x, /** @type {number} */ y) => grid[Math.floor(y)]?.[Math.floor(x)] === 0;

  const start = { x: dungeon.rooms[0].x + dungeon.rooms[0].w / 2, y: dungeon.rooms[0].y + dungeon.rooms[0].h / 2 };
  const player = { x: start.x, y: start.y, hp: 100, maxHp: 100, mana: 50, maxMana: 50, kills: 0, path: /** @type {{x:number,y:number}[]} */ ([]) };
  const body = scene.add.circle(0, 0, world.unit * 0.32, 0xfbbf24).setStrokeStyle(2, 0xffffff);
  const cooldowns = SKILLS.map(() => 0);
  const inventory = createInventory(12);
  let bagOpen = false;
  let time = 0;
  let facing = { x: 1, y: 0 };

  /** @type {any[]} */
  const enemies = [];
  for (const room of dungeon.rooms.slice(1)) {
    for (let i = 0; i < 2; i += 1) {
      const x = room.x + 1 + rng.next() * (room.w - 2);
      const y = room.y + 1 + rng.next() * (room.h - 2);
      enemies.push({ x, y, hp: 40, hitAt: 0, dot: scene.add.circle(0, 0, world.unit * 0.3, 0x9ca3af).setStrokeStyle(2, 0x7f1d1d) });
    }
  }
  /** @type {any[]} */
  const drops = [];
  /** @type {any[]} */
  const shots = [];
  const novaRing = scene.add.circle(0, 0, 10).setStrokeStyle(3, 0x93c5fd).setVisible(false);
  const bagText = scene.add.text(scene.scale.width - 12, 40, '', { fontFamily: 'monospace', fontSize: '12px', color: '#e6edf3', backgroundColor: '#000000aa', align: 'right' }).setOrigin(1, 0).setScrollFactor(0).setDepth(1000).setVisible(false);
  const barText = scene.add.text(12, 46, '', { fontFamily: 'monospace', fontSize: '14px', color: '#93c5fd' }).setScrollFactor(0).setDepth(1000);
  const hotbar = scene.add.text(12, scene.scale.height - 24, '', { fontFamily: 'monospace', fontSize: '13px', color: '#e6edf3' }).setScrollFactor(0).setDepth(1000);
  scene.cameras.main.startFollow(body, true, 0.12, 0.12);

  const damage = () => 20 + equippedPower(inventory);

  function hurt(/** @type {any} */ enemy, /** @type {number} */ amount) {
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    enemy.dot.destroy();
    enemies.splice(enemies.indexOf(enemy), 1);
    player.kills += 1;
    if (rng.next() < 0.6) {
      const item = rollLoot(DEFAULT_TABLE, () => rng.next());
      const gem = scene.add.rectangle(0, 0, 10, 10, /** @type {Record<string, number>} */ (RARITY_COLOR)[item.rarity]).setAngle(45);
      drops.push({ x: enemy.x, y: enemy.y, item, gem });
    }
  }

  function useSkill(/** @type {number} */ index) {
    const skill = SKILLS[index];
    if (!skill || cooldowns[index] > 0 || player.mana < skill.mana) return;
    cooldowns[index] = skill.cooldown;
    player.mana -= skill.mana;
    if (skill.id === 'strike') {
      for (const e of [...enemies]) if (Math.hypot(e.x - player.x, e.y - player.y) < 1.6) hurt(e, damage());
    } else if (skill.id === 'fireball') {
      const aim = world.pointerTile();
      let dx = aim.x - player.x;
      let dy = aim.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.2) [dx, dy] = [facing.x, facing.y];
      else [dx, dy] = [dx / d, dy / d];
      shots.push({ x: player.x, y: player.y, vx: dx * 9, vy: dy * 9, life: 1200, dot: scene.add.circle(0, 0, world.unit * 0.18, 0xf97316) });
    } else if (skill.id === 'nova') {
      for (const e of [...enemies]) if (Math.hypot(e.x - player.x, e.y - player.y) < 3.2) hurt(e, damage() * 0.8);
      novaRing.setVisible(true).setScale(0.5).setAlpha(1);
      scene.tweens.add({ targets: novaRing, scale: world.unit * 0.2, alpha: 0, duration: 350, onComplete: () => novaRing.setVisible(false) });
    } else {
      player.hp = Math.min(player.maxHp, player.hp + 40);
    }
  }

  const onDown = (/** @type {Phaser.Input.Pointer} */ pointer) => {
    if (pointer.rightButtonDown() || bagOpen) return;
    const t = world.pointerTile();
    const goal = { x: Math.floor(t.x), y: Math.floor(t.y) };
    const path = astar(grid, { x: Math.floor(player.x), y: Math.floor(player.y) }, goal);
    player.path = path ? path.slice(1) : [];
  };
  scene.input.on('pointerdown', onDown);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.off('pointerdown', onDown));
  scene.input.keyboard?.on('keydown', (/** @type {KeyboardEvent} */ e) => {
    if (!bagOpen || !/^[1-9]$/.test(e.key)) return;
    equip(inventory, Number(e.key) - 1);
  });

  function moveBy(/** @type {number} */ dx, /** @type {number} */ dy) {
    if (open(player.x + dx + Math.sign(dx) * 0.25, player.y)) player.x += dx;
    if (open(player.x, player.y + dy + Math.sign(dy) * 0.25)) player.y += dy;
  }

  return {
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      const dt = delta / 1000;
      time += delta;
      for (let i = 0; i < cooldowns.length; i += 1) cooldowns[i] = Math.max(0, cooldowns[i] - delta);
      player.mana = Math.min(player.maxMana, player.mana + 4 * dt);

      if (input.justPressed('bag')) bagOpen = !bagOpen;
      if (!bagOpen) SKILLS.forEach((s, i) => input.justPressed(s.key) && useSkill(i));

      const v = input.vector();
      if (v.x !== 0 || v.y !== 0) {
        player.path = [];
        facing = v;
        moveBy(v.x * SPEED * dt, v.y * SPEED * dt);
      } else if (player.path.length > 0) {
        const next = player.path[0];
        const tx = next.x + 0.5;
        const ty = next.y + 0.5;
        const d = Math.hypot(tx - player.x, ty - player.y);
        if (d < 0.1) player.path.shift();
        else {
          facing = { x: (tx - player.x) / d, y: (ty - player.y) / d };
          moveBy(facing.x * Math.min(d, SPEED * dt), facing.y * Math.min(d, SPEED * dt));
        }
      }

      for (const e of enemies) {
        const d = Math.hypot(player.x - e.x, player.y - e.y);
        if (d < 7 && d > 0.8) {
          const nx = e.x + ((player.x - e.x) / d) * 2 * dt;
          const ny = e.y + ((player.y - e.y) / d) * 2 * dt;
          if (open(nx, e.y)) e.x = nx;
          if (open(e.x, ny)) e.y = ny;
        } else if (d <= 0.8 && time - e.hitAt > 1000) {
          e.hitAt = time;
          player.hp = Math.max(0, player.hp - 6);
        }
      }
      for (const s of [...shots]) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= delta;
        const hit = enemies.find((e) => Math.hypot(e.x - s.x, e.y - s.y) < 0.7);
        if (hit) hurt(hit, damage() * 1.3);
        if (hit || s.life <= 0 || !open(s.x, s.y)) {
          s.dot.destroy();
          shots.splice(shots.indexOf(s), 1);
        }
      }
      for (const d of [...drops]) {
        if (Math.hypot(d.x - player.x, d.y - player.y) < 0.8 && pickUp(inventory, d.item)) {
          d.gem.destroy();
          drops.splice(drops.indexOf(d), 1);
        }
      }
      if (player.hp <= 0) {
        player.hp = player.maxHp;
        player.x = start.x;
        player.y = start.y;
      }

      const place = (/** @type {any} */ obj, /** @type {{x:number,y:number}} */ at, /** @type {number} */ z = 0) => {
        const p = world.toScreen(at.x, at.y);
        obj.setPosition(p.x, p.y).setDepth(world.depth(at.x, at.y, z));
      };
      place(body, player, 1);
      for (const e of enemies) place(e.dot, e, 1);
      for (const s of shots) place(s.dot, s, 2);
      for (const d of drops) place(d.gem, d);
      if (novaRing.visible) place(novaRing, player, 3);

      hud.setScore(player.kills);
      hud.setHealth(Math.round(player.hp), player.maxHp);
      barText.setText(`MP ${Math.round(player.mana)}/${player.maxMana}   ATK ${damage()}`);
      hotbar.setText(SKILLS.map((s, i) => `[${i + 1}] ${s.id}${cooldowns[i] > 0 ? ` ${(cooldowns[i] / 1000).toFixed(1)}s` : ''}`).join('   ') + '   [I] bag');
      bagText.setVisible(bagOpen);
      if (bagOpen) {
        const worn = Object.entries(inventory.equipped).map(([slot, it]) => `${slot}: ${it ? `${it.name} (+${it.power})` : '-'}`);
        bagText.setText(['EQUIPPED', ...worn, '', 'BAG (press 1-9 to equip)', ...inventory.bag.map((it, i) => `${i + 1}. ${it.name} (+${it.power})`)].join('\n'));
      }
    },
    state() {
      return {
        player: { position: [Number(player.x.toFixed(3)), Number(player.y.toFixed(3))], health: Math.round(player.hp) },
        arpg: {
          mana: Math.round(player.mana),
          kills: player.kills,
          enemies: enemies.length,
          rooms: dungeon.rooms.length,
          bag: inventory.bag.map((i) => i.name),
          equipped: Object.fromEntries(Object.entries(inventory.equipped).map(([k, v]) => [k, v ? v.name : null])),
          drops: drops.length,
          bagOpen,
        },
      };
    },
  };
}
