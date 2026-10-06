// @ts-check
/**
 * FPS genre (Phase 107 Theme H): weapon switching, hitscan and projectile
 * weapons, enemies that see and chase, pickups (health, ammo, keys, weapons)
 * and keyed doors, on a level read from a Tiled map (`levels.js`). The weapon
 * table and sight rules are engine-free (`kit/core/genre/fps/`). It drives the
 * raycaster rig through its live `map`, `sprites` and `pos`.
 */

import { addAmmo, createLoadout, fire, grantWeapon, switchWeapon, WEAPONS } from 'kit/core/genre/fps/weapon-table.js';
import { canSee } from 'kit/core/genre/fps/sight.js';
import { castRay } from 'kit/core/raycast.js';
import { rng } from 'kit/core/rng.js';
import { createHud } from 'kit/phaser/hud.js';
import { createInput } from 'kit/phaser/input.js';

import { levelMap, levelObjects, wallGrid } from './levels.js';

const ENEMY = { hp: 30, speed: 1.6, range: 7, damage: 6, everyMs: 1200 };
const KEY_FOR_DOOR = { 3: 'red-key', 5: 'violet-key' };
const PICKUP_COLOR = { health: '#4ade80', ammo: '#facc15', 'red-key': '#ef4444', 'violet-key': '#a78bfa', shotgun: '#fb923c', rocket: '#f472b6' };

/** @param {Phaser.Scene} scene @param {{ rig: any }} ctx */
export function installGenre(scene, ctx) {
  const rig = ctx.rig;
  const level = levelMap();
  const walls = wallGrid(level);
  rig.map.length = 0;
  for (const row of walls) rig.map.push([...row]);
  rig.sprites.length = 0;

  const objects = levelObjects(level);
  const spawn = objects.find((o) => o.type === 'spawn');
  if (spawn) {
    rig.pos.x = spawn.x;
    rig.pos.y = spawn.y;
  }
  rig.setAngle(0);

  const input = createInput(scene, {
    ...rig.input.bindings,
    fire: { keys: ['F', 'CTRL'], pointer: /** @type {const} */ ('left') },
    weapon1: { keys: ['ONE'] }, weapon2: { keys: ['TWO'] }, weapon3: { keys: ['THREE'] },
    nextWeapon: { keys: ['Q'] },
  });
  const hud = createHud(scene, {});
  const ammoText = scene.add.text(scene.scale.width / 2, scene.scale.height - 22, '', { fontFamily: 'monospace', fontSize: '14px', color: '#e6edf3' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);
  const crosshair = scene.add.text(scene.scale.width / 2, scene.scale.height / 2, '+', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
  void crosshair;

  const loadout = createLoadout({ ammo: { bullets: 40 } });
  const player = { hp: 100, keys: /** @type {string[]} */ ([]), kills: 0, msg: '' };
  let time = 0;

  /** @type {any[]} */
  const enemies = [];
  /** @type {any[]} */
  const pickups = [];
  /** @type {any[]} */
  const rockets = [];
  for (const o of objects) {
    if (o.type === 'enemy') {
      const sprite = { x: o.x, y: o.y, color: '#e5484d', scale: 0.6 };
      rig.sprites.push(sprite);
      enemies.push({ sprite, hp: ENEMY.hp, angle: 0, shotAt: 0, awake: false });
    } else if (o.type === 'pickup') {
      const sprite = { x: o.x, y: o.y, color: /** @type {Record<string, string>} */ (PICKUP_COLOR)[o.name] ?? '#fff', scale: 0.25 };
      rig.sprites.push(sprite);
      pickups.push({ kind: o.name, sprite });
    }
  }

  const remove = (/** @type {any[]} */ list, /** @type {any} */ entry) => {
    const i = rig.sprites.indexOf(entry.sprite);
    if (i >= 0) rig.sprites.splice(i, 1);
    list.splice(list.indexOf(entry), 1);
  };
  const walkable = (/** @type {number} */ x, /** @type {number} */ y) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const cell = rig.map[cy]?.[cx];
    return cell !== undefined && !rig.isSolid(cell, cx, cy);
  };

  function wallDistance(/** @type {number} */ angle) {
    const hit = castRay(rig.map, rig.pos, { x: Math.cos(angle), y: Math.sin(angle) }, { isSolid: rig.isSolid });
    return hit.hit ? hit.distance : Infinity;
  }

  /** The nearest enemy along `angle`, nearer than the wall. */
  function enemyAlong(/** @type {number} */ angle, /** @type {number} */ range) {
    const wall = Math.min(wallDistance(angle), range);
    let best = null;
    let bestD = wall;
    for (const e of enemies) {
      const dx = e.sprite.x - rig.pos.x;
      const dy = e.sprite.y - rig.pos.y;
      const d = Math.hypot(dx, dy);
      let off = Math.atan2(dy, dx) - angle;
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (d < bestD && Math.abs(off) < Math.atan2(0.3, d)) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  function damageEnemy(/** @type {any} */ e, /** @type {number} */ amount) {
    e.hp -= amount;
    e.awake = true;
    if (e.hp <= 0 && enemies.includes(e)) {
      remove(enemies, e);
      player.kills += 1;
    }
  }

  function shoot() {
    const shot = fire(loadout, time, () => rng.next());
    if (!shot) return;
    const { weapon } = shot;
    if (weapon.kind === 'hitscan') {
      for (const off of shot.offsetsDeg) {
        const target = enemyAlong(rig.angle + (off * Math.PI) / 180, weapon.range);
        if (target) damageEnemy(target, weapon.damage);
      }
    } else {
      const sprite = { x: rig.pos.x, y: rig.pos.y, color: '#fb923c', scale: 0.12 };
      rig.sprites.push(sprite);
      rockets.push({ sprite, vx: Math.cos(rig.angle) * (weapon.speed ?? 7), vy: Math.sin(rig.angle) * (weapon.speed ?? 7), life: 3000, damage: weapon.damage });
    }
  }

  /** Open the locked door in front of the player if they hold its key. */
  function tryLockedDoor() {
    const hit = castRay(rig.map, rig.pos, { x: Math.cos(rig.angle), y: Math.sin(rig.angle) }, { isSolid: rig.isSolid });
    const key = hit.hit && hit.distance < 1.5 ? /** @type {Record<number, string>} */ (KEY_FOR_DOOR)[hit.cell] : undefined;
    if (!key) return;
    if (player.keys.includes(key)) {
      rig.map[hit.cellY][hit.cellX] = 9;
      rig.openDoor(hit.cellX, hit.cellY);
      player.msg = '';
    } else {
      player.msg = `Needs the ${key.replace('-', ' ')}`;
    }
  }

  function collect(/** @type {any} */ p) {
    switch (p.kind) {
      case 'health':
        if (player.hp >= 100) return false;
        player.hp = Math.min(100, player.hp + 25);
        break;
      case 'ammo':
        addAmmo(loadout, 'bullets', 15);
        addAmmo(loadout, 'shells', 4);
        break;
      case 'shotgun':
        grantWeapon(loadout, 'shotgun');
        addAmmo(loadout, 'shells', 8);
        break;
      case 'rocket':
        grantWeapon(loadout, 'rocket');
        addAmmo(loadout, 'rockets', 4);
        break;
      default:
        player.keys.push(p.kind);
    }
    return true;
  }

  return {
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      time += delta;
      const dt = delta / 1000;
      if (input.justPressed('weapon1')) switchWeapon(loadout, 'pistol');
      if (input.justPressed('weapon2')) switchWeapon(loadout, 'shotgun');
      if (input.justPressed('weapon3')) switchWeapon(loadout, 'rocket');
      if (input.justPressed('nextWeapon')) switchWeapon(loadout, 1);
      if (input.isDown('fire')) shoot();
      if (input.justPressed('use')) tryLockedDoor();

      for (const e of [...enemies]) {
        const dx = rig.pos.x - e.sprite.x;
        const dy = rig.pos.y - e.sprite.y;
        const d = Math.hypot(dx, dy);
        e.angle = Math.atan2(dy, dx);
        if (!e.awake && canSee({ x: e.sprite.x, y: e.sprite.y, angle: e.angle }, rig.pos, rig.map, { range: ENEMY.range, fovDeg: 360, isSolid: rig.isSolid })) e.awake = true;
        if (!e.awake) continue;
        if (d > 1.1) {
          const nx = e.sprite.x + (dx / d) * ENEMY.speed * dt;
          const ny = e.sprite.y + (dy / d) * ENEMY.speed * dt;
          if (walkable(nx, e.sprite.y)) e.sprite.x = nx;
          if (walkable(e.sprite.x, ny)) e.sprite.y = ny;
        }
        if (d < ENEMY.range && time - e.shotAt > ENEMY.everyMs && canSee({ x: e.sprite.x, y: e.sprite.y, angle: e.angle }, rig.pos, rig.map, { range: ENEMY.range, fovDeg: 360, isSolid: rig.isSolid })) {
          e.shotAt = time;
          player.hp = Math.max(0, player.hp - ENEMY.damage);
          scene.cameras.main.flash(80, 160, 0, 0);
        }
      }

      for (const r of [...rockets]) {
        r.sprite.x += r.vx * dt;
        r.sprite.y += r.vy * dt;
        r.life -= delta;
        const hit = !walkable(r.sprite.x, r.sprite.y) || enemies.some((e) => Math.hypot(e.sprite.x - r.sprite.x, e.sprite.y - r.sprite.y) < 0.5);
        if (hit || r.life <= 0) {
          for (const e of [...enemies]) if (Math.hypot(e.sprite.x - r.sprite.x, e.sprite.y - r.sprite.y) < 1.8) damageEnemy(e, r.damage);
          remove(rockets, r);
        }
      }

      for (const p of [...pickups]) {
        if (Math.hypot(p.sprite.x - rig.pos.x, p.sprite.y - rig.pos.y) < 0.6 && collect(p)) remove(pickups, p);
      }
      if (player.hp <= 0) {
        player.hp = 100;
        if (spawn) [rig.pos.x, rig.pos.y] = [spawn.x, spawn.y];
      }

      const w = WEAPONS[loadout.current];
      const ammo = w ? /** @type {Record<string, number>} */ (loadout.ammo)[w.ammoType] ?? 0 : 0;
      hud.setScore(player.kills);
      hud.setHealth(Math.round(player.hp), 100);
      ammoText.setText(`${loadout.current.toUpperCase()}  ${ammo}${player.keys.length ? `   keys: ${player.keys.join(', ')}` : ''}${player.msg ? `   ${player.msg}` : ''}`);
    },
    state() {
      return {
        player: { position: rig.state().player.position, health: Math.round(player.hp) },
        fps: {
          weapon: loadout.current,
          owned: [...loadout.owned],
          ammo: { ...loadout.ammo },
          keys: [...player.keys],
          enemies: enemies.length,
          awake: enemies.filter((e) => e.awake).length,
          pickups: pickups.length,
          kills: player.kills,
          rockets: rockets.length,
        },
      };
    },
  };
}
