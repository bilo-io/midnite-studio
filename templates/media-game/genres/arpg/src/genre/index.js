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
import { createRng, rng } from 'kit/core/rng.js';

import config from '../game.config.js';
import { blockTexture, domeTexture, gridImage, shadowTexture, tileTexture } from '../lit.js';

const SPEED = 4.2; // tiles/s
const RARITY_COLOR = { common: 0xd1d5db, magic: 0x60a5fa, rare: 0xfacc15, unique: 0xfb923c };
const SKILLS = [
  { id: 'strike', key: 'skill1', mana: 0, cooldown: 400 },
  { id: 'fireball', key: 'skill2', mana: 10, cooldown: 700 },
  { id: 'nova', key: 'skill3', mana: 25, cooldown: 2500 },
  { id: 'potion', key: 'skill4', mana: 0, cooldown: 5000 },
];

/** @param {Phaser.Scene} scene @param {{ rig?: any, fx: any, glow: Phaser.GameObjects.Light }} ctx */
export function installGenre(scene, ctx) {
  const dungeon = generateDungeon(7, 12);
  const grid = dungeon.grid;
  const world = createWorld2d(scene, { perspective: config.perspective, cols: dungeon.width, rows: dungeon.height });
  world.cover();
  // The base made the lighting and juice; this genre re-uses them for its own world, keeping the light that follows the player.
  const { fx } = ctx;
  const { juice, lighting } = fx;
  fx.takeOver(ctx.glow);
  ctx.glow.setRadius(world.unit * 9).setIntensity(1.1);
  // A dusk-dark dungeon with a room tone under it. `ambience` replaces the base's own bed rather than stacking on it.
  fx.tint('dusk');
  fx.ambience('ambience-room', { volume: 0.4 });
  const critRng = createRng(0xc417); // its own stream: crits must not shift the loot rolls
  const shadow = shadowTexture(scene);
  const screen = (/** @type {{x:number,y:number}} */ at) => world.toScreen(at.x, at.y);
  const input = createInput(scene, {
    left: { keys: ['LEFT', 'A'] }, right: { keys: ['RIGHT', 'D'] }, up: { keys: ['UP', 'W'] }, down: { keys: ['DOWN', 'S'] },
    skill1: { keys: ['ONE'] }, skill2: { keys: ['TWO'] }, skill3: { keys: ['THREE'] }, skill4: { keys: ['FOUR'] },
    bag: { keys: ['I'] },
  });
  const hud = createHud(scene, {});

  // Flagstone floor in two variants; the cells that edge a room become raised brick walls. Both are normal-mapped, so torch light rakes across them.
  const flags = [tileTexture(world, scene, 'arpg-floor-a', 'tiles', { seed: 3, base: 0xa8aebb, accent: 0x7d8493, normalStrength: 0.5 }), tileTexture(world, scene, 'arpg-floor-b', 'tiles', { seed: 11, base: 0x9aa1ae, accent: 0x727989, normalStrength: 0.5 })];
  const wallTexture = blockTexture(world, scene, 'arpg-wall', 'brick', { seed: 5, base: 0x8a5a48, accent: 0xb8a48e, depth: 34 });
  const edge = (/** @type {number} */ x, /** @type {number} */ y) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] === 0);
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (grid[y][x] === 0) lighting.lit(gridImage(scene, world, /** @type {string} */ (flags[(x + y * 3) % 4 === 0 ? 1 : 0]), x, y, -20));
      else if (edge(x, y)) {
        lighting.lit(gridImage(scene, world, wallTexture, x, y, world.depth(x, y, 0.5), world.iso ? 34 : 0));
        if (world.iso) scene.add.image(world.toScreen(x + 0.5, y + 0.5).x, world.toScreen(x + 0.5, y + 0.5).y, shadow).setDisplaySize(90, 40).setDepth(-15).setAlpha(0.7);
      }
    }
  }
  // A torch in the middle of every room: a warm light that flickers (deterministically) and a small flame.
  const flame = 'kit-juice-dot';
  const torches = dungeon.rooms.map((room, i) => {
    const p = world.toScreen(room.x + room.w / 2, room.y + room.h / 2);
    return { light: lighting.add(p.x, p.y, { radius: world.unit * 8, intensity: 0.9, color: 0xff9a4a }), flame: scene.add.image(p.x, p.y - 6, flame).setTint(0xffa040).setBlendMode(1).setDisplaySize(26, 26).setDepth(world.depth(room.x + room.w / 2, room.y + room.h / 2, 2)), seed: i * 1.7 };
  });
  const open = (/** @type {number} */ x, /** @type {number} */ y) => grid[Math.floor(y)]?.[Math.floor(x)] === 0;

  const start = { x: dungeon.rooms[0].x + dungeon.rooms[0].w / 2, y: dungeon.rooms[0].y + dungeon.rooms[0].h / 2 };
  const player = { x: start.x, y: start.y, hp: 100, maxHp: 100, mana: 50, maxMana: 50, kills: 0, level: 1, path: /** @type {{x:number,y:number}[]} */ ([]) };
  const body = lighting.lit(scene.add.image(0, 0, domeTexture(scene, 'arpg-hero', { size: 32, color: 0xfbbf24, eyes: true })).setDisplaySize(world.unit * 0.8, world.unit * 0.8));
  const bodyShadow = scene.add.image(0, 0, shadow).setDisplaySize(world.unit * 1.1, world.unit * 0.55);
  let stride = 0;
  let lastPlayer = { x: start.x, y: start.y };
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
      enemies.push({ x, y, hp: 40, hitAt: 0, aggro: false, dot: lighting.lit(scene.add.image(0, 0, domeTexture(scene, 'arpg-ghoul', { size: 32, color: 0x8b95a5, eyes: true })).setDisplaySize(world.unit * 0.75, world.unit * 0.75)), shadow: scene.add.image(0, 0, shadow).setDisplaySize(world.unit, world.unit * 0.5) });
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

  const damage = () => 20 + equippedPower(inventory) + (player.level - 1) * 2;

  /** A level every four kills: more health, a full heal and the fanfare. */
  function checkLevel() {
    const level = 1 + Math.floor(player.kills / 4);
    if (level <= player.level) return;
    player.level = level;
    player.maxHp += 10;
    player.hp = player.maxHp;
    const at = screen(player);
    juice.trigger('level-up', { x: at.x, y: at.y - world.unit * 0.4 });
    juice.text(at.x, at.y - world.unit, `LEVEL ${level}`, 'heal');
    fx.ring(at.x, at.y, { radius: world.unit * 2.5, ms: 600, color: 0xfff2b0, squash: world.iso ? 0.5 : 1 });
  }

  function hurt(/** @type {any} */ enemy, /** @type {number} */ amount) {
    // One in six blows crits: bigger number, harder hit-stop. A separate rng stream, so loot rolls are unchanged.
    const crit = critRng.next() < 0.17;
    const dealt = Math.round(amount * (crit ? 1.8 : 1));
    enemy.hp -= dealt;
    const p = screen(enemy);
    enemy.aggro = true;
    if (enemy.hp > 0) {
      juice.trigger(crit ? 'critical' : 'hit', { target: enemy.dot, x: p.x, y: p.y - world.unit * 0.3, strength: crit ? 1.3 : 0.7, text: dealt, textKind: crit ? 'crit' : 'hit' });
      return;
    }
    juice.trigger('hit', { x: p.x, y: p.y - world.unit * 0.3, strength: 1.4, text: dealt, textKind: 'crit' });
    juice.burst('debris', p.x, p.y, { colors: [0x8b95a5, 0x4b5563, 0xe5484d], scale: 1.2 });
    fx.play('death', { x: p.x, power: 0.7 });
    enemy.dot.destroy();
    enemy.shadow.destroy();
    enemies.splice(enemies.indexOf(enemy), 1);
    player.kills += 1;
    checkLevel();
    if (rng.next() < 0.6) {
      const item = rollLoot(DEFAULT_TABLE, () => rng.next());
      const color = /** @type {Record<string, number>} */ (RARITY_COLOR)[item.rarity];
      const gem = lighting.lit(scene.add.image(0, 0, domeTexture(scene, `arpg-loot-${item.rarity}`, { size: 20, color, ring: 0.2 })).setDisplaySize(14, 14));
      // Loot glows in its rarity colour and announces itself with a chime that rises with the rarity.
      const light = lighting.add(p.x, p.y, { radius: world.unit * 2.5, intensity: 0.9, color });
      drops.push({ x: enemy.x, y: enemy.y, item, gem, light, phase: drops.length });
      fx.ring(p.x, p.y, { radius: world.unit * 1.2, ms: 500, color, squash: world.iso ? 0.5 : 1 });
      fx.play(item.rarity === 'common' ? 'coin' : 'powerup', { x: p.x, power: 0.7 });
    }
  }

  function useSkill(/** @type {number} */ index) {
    const skill = SKILLS[index];
    if (!skill) return;
    if (cooldowns[index] > 0 || player.mana < skill.mana) {
      fx.play('block', { pitch: 0.8, power: 0.5, volume: 0.6 }); // not ready, or out of mana
      return;
    }
    cooldowns[index] = skill.cooldown;
    player.mana -= skill.mana;
    const here = screen(player);
    if (skill.id === 'strike') {
      // A slash in front of the player: an arc of sparks and a swing, then the blows.
      const sx = here.x + facing.x * world.unit * 0.9;
      const sy = here.y + facing.y * world.unit * 0.9 * (world.iso ? 0.5 : 1);
      fx.play('swing', { x: here.x });
      juice.burst('spark', sx, sy, { dir: [facing.x, facing.y], count: 8, scale: 0.8 });
      fx.ring(sx, sy, { radius: world.unit * 1.4, ms: 240, color: 0xfff2b0, squash: world.iso ? 0.5 : 1 });
      juice.squash(body, [1.25, 0.85], { ms: 200 });
      let struck = 0;
      for (const e of [...enemies]) {
        if (Math.hypot(e.x - player.x, e.y - player.y) >= 1.6) continue;
        struck += 1;
        hurt(e, damage());
      }
      if (struck > 0) fx.play('sword-clash', { x: here.x, power: 0.8, volume: 0.7 }); // steel on bone, once per swing
    } else if (skill.id === 'fireball') {
      juice.trigger('magic-cast', { x: here.x, y: here.y });
      juice.burst('muzzle', here.x, here.y, { dir: [facing.x, facing.y], scale: 0.8 });
      const aim = world.pointerTile();
      let dx = aim.x - player.x;
      let dy = aim.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.2) [dx, dy] = [facing.x, facing.y];
      else [dx, dy] = [dx / d, dy / d];
      // The bolt is a glowing additive orb carrying its own light, so it lights the walls it flies past.
      const orb = scene.add.image(0, 0, 'kit-juice-dot').setTint(0xff8a2a).setBlendMode(1).setDisplaySize(world.unit * 0.8, world.unit * 0.8);
      shots.push({ x: player.x, y: player.y, vx: dx * 9, vy: dy * 9, life: 1200, dot: orb, light: lighting.add(here.x, here.y, { radius: world.unit * 5, intensity: 1.2, color: 0xff8a2a }), trail: 0 });
    } else if (skill.id === 'nova') {
      fx.play('magic-cast', { x: here.x, pitch: 0.7, power: 1.2 }); // a deeper, heavier cast than the fireball
      fx.ring(here.x, here.y, { radius: world.unit * 7, ms: 420, color: 0x93c5fd, width: 3, squash: world.iso ? 0.5 : 1 });
      juice.shake(0.3);
      juice.screenFlash(0x93c5fd, 0.18, 220);
      for (const e of [...enemies]) if (Math.hypot(e.x - player.x, e.y - player.y) < 3.2) hurt(e, damage() * 0.8);
      novaRing.setVisible(true).setScale(0.5).setAlpha(1);
      scene.tweens.add({ targets: novaRing, scale: world.unit * 0.2, alpha: 0, duration: 350, onComplete: () => novaRing.setVisible(false) });
    } else {
      player.hp = Math.min(player.maxHp, player.hp + 40);
      juice.trigger('heal', { x: here.x, y: here.y - world.unit * 0.3, text: '+40', textKind: 'heal' });
      juice.burst('spark', here.x, here.y, { colors: [0x6ee7a8, 0xbbf7d0], scale: 1 });
    }
  }

  const onDown = (/** @type {Phaser.Input.Pointer} */ pointer) => {
    if (pointer.rightButtonDown() || bagOpen) return;
    const t = world.pointerTile();
    const goal = { x: Math.floor(t.x), y: Math.floor(t.y) };
    const path = astar(grid, { x: Math.floor(player.x), y: Math.floor(player.y) }, goal);
    player.path = path ? path.slice(1) : [];
    const ping = world.toScreen(goal.x + 0.5, goal.y + 0.5);
    fx.ring(ping.x, ping.y, { radius: world.unit * 1.1, ms: 320, color: 0xf6e05e, squash: world.iso ? 0.5 : 1 });
    fx.play('ui-click', { x: ping.x, volume: 0.5 });
  };
  scene.input.on('pointerdown', onDown);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.off('pointerdown', onDown));
  scene.input.keyboard?.on('keydown', (/** @type {KeyboardEvent} */ e) => {
    if (!bagOpen || !/^[1-9]$/.test(e.key)) return;
    equip(inventory, Number(e.key) - 1);
    fx.play('ui-click', { pitch: 1.2, volume: 0.7 });
    fx.play('powerup', { power: 0.5, volume: 0.5 });
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

      if (input.justPressed('bag')) {
        bagOpen = !bagOpen;
        fx.play('ui-click', { pitch: bagOpen ? 1.3 : 0.9, volume: 0.7 });
      }
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
        if (d < 7 && !e.aggro) {
          e.aggro = true; // it noticed the player: a low growl, panned to where it stands
          const at = screen(e);
          fx.play('laser', { x: at.x, pitch: 0.4, power: 0.35, volume: 0.6 });
          juice.squash(e.dot, [0.8, 1.25], { ms: 260 });
        }
        if (d < 7 && d > 0.8) {
          const nx = e.x + ((player.x - e.x) / d) * 2 * dt;
          const ny = e.y + ((player.y - e.y) / d) * 2 * dt;
          if (open(nx, e.y)) e.x = nx;
          if (open(e.x, ny)) e.y = ny;
        } else if (d <= 0.8 && time - e.hitAt > 1000) {
          e.hitAt = time;
          player.hp = Math.max(0, player.hp - 6);
          const at = screen(player);
          juice.trigger('hurt', { target: body, x: at.x, y: at.y - world.unit * 0.4, strength: 0.8, text: 6, textKind: 'crit' });
        }
      }
      for (const s of [...shots]) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= delta;
        s.trail -= delta;
        if (s.trail <= 0) {
          s.trail = 50;
          const at = screen(s);
          juice.burst('spark', at.x, at.y, { count: 2, scale: 0.4, colors: [0xff8a2a, 0xffd28a] });
        }
        const hit = enemies.find((e) => Math.hypot(e.x - s.x, e.y - s.y) < 0.7);
        if (hit) hurt(hit, damage() * 1.3);
        if (hit || s.life <= 0 || !open(s.x, s.y)) {
          const at = screen(s);
          if (hit || !open(s.x, s.y)) juice.trigger('explosion', { x: at.x, y: at.y, strength: 0.5 });
          lighting.lights.removeLight(s.light);
          s.dot.destroy();
          shots.splice(shots.indexOf(s), 1);
        }
      }
      for (const d of [...drops]) {
        if (Math.hypot(d.x - player.x, d.y - player.y) < 0.8 && pickUp(inventory, d.item)) {
          const at = screen(d);
          juice.trigger('pickup', { x: at.x, y: at.y - 10, text: d.item.name, textKind: 'heal' });
          if (d.item.rarity !== 'common') fx.play('powerup', { x: at.x, power: 0.8 });
          lighting.lights.removeLight(d.light);
          d.gem.destroy();
          drops.splice(drops.indexOf(d), 1);
        }
      }
      if (player.hp <= 0) {
        const at = screen(player);
        juice.trigger('death', { x: at.x, y: at.y });
        player.hp = player.maxHp;
        player.x = start.x;
        player.y = start.y;
      }

      const place = (/** @type {any} */ obj, /** @type {{x:number,y:number}} */ at, /** @type {number} */ z = 0) => {
        const p = world.toScreen(at.x, at.y);
        obj.setPosition(p.x, p.y).setDepth(world.depth(at.x, at.y, z));
      };
      place(body, player, 1);
      body.y -= world.unit * 0.2;
      place(bodyShadow, player, 0.2);
      for (const e of enemies) {
        place(e.dot, e, 1);
        e.dot.y -= world.unit * 0.2;
        place(e.shadow, e, 0.2);
      }
      for (const s of shots) {
        place(s.dot, s, 2);
        s.light.setPosition(s.dot.x, s.dot.y);
      }
      for (const d of drops) {
        place(d.gem, d, 0.5);
        d.gem.y -= 6 + Math.sin(time / 300 + d.phase) * 3;
        d.light.setPosition(d.gem.x, d.gem.y);
      }
      // The follow-light rides the player; the room torches flicker.
      ctx.glow.setPosition(body.x, body.y);
      for (const t of torches) {
        t.light.setIntensity(0.9 * fx.flicker(time / 1000, t.seed));
        t.flame.setAlpha(0.6 + 0.4 * fx.flicker(time / 1000, t.seed));
      }
      // Footsteps by distance walked.
      stride += Math.hypot(player.x - lastPlayer.x, player.y - lastPlayer.y);
      lastPlayer = { x: player.x, y: player.y };
      if (stride >= 0.75) {
        stride -= 0.75;
        juice.trigger('footstep');
        juice.burst('dust', body.x, body.y + world.unit * 0.4, { count: 2, scale: 0.4 });
      }
      if (novaRing.visible) place(novaRing, player, 3);

      hud.setScore(player.kills);
      hud.setHealth(Math.round(player.hp), player.maxHp);
      barText.setText(`LV ${player.level}   MP ${Math.round(player.mana)}/${player.maxMana}   ATK ${damage()}`);
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
          level: player.level,
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
