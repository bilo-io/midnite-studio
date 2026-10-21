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

import { levelMap, levelObjects, skylitCells, wallGrid } from './levels.js';
import { createViewmodel } from './viewmodel.js';

const ENEMY = { hp: 30, speed: 1.6, range: 7, damage: 6, everyMs: 1200 };
const RELOAD_MS = 850;
const KEY_FOR_DOOR = { 3: 'red-key', 5: 'violet-key' };
const PICKUP_KIND = { health: 'health', ammo: 'ammo', 'red-key': 'key', 'violet-key': 'key', shotgun: 'weapon', rocket: 'weapon' };
const PICKUP_TEXT = { health: '+25 HP', ammo: '+ammo', 'red-key': 'red key', 'violet-key': 'violet key', shotgun: 'shotgun', rocket: 'rocket launcher' };
const PICKUP_COLOR = { health: '#4ade80', ammo: '#facc15', 'red-key': '#ef4444', 'violet-key': '#a78bfa', shotgun: '#fb923c', rocket: '#f472b6' };

/** The screen-centre fallback for an effect whose source is behind the camera. */
const CENTRE = { x: 480, y: 270 };

/** @param {Phaser.Scene} scene @param {{ rig: any, view: any, fx: any }} ctx */
export function installGenre(scene, ctx) {
  const rig = ctx.rig;
  const { view, fx } = ctx;
  const juice = fx.juice;
  const viewmodel = createViewmodel(scene, { get shake() { return fx.settings.resolved().shake; } });
  const level = levelMap();
  const walls = wallGrid(level);
  rig.map.length = 0;
  for (const row of walls) rig.map.push([...row]);
  rig.sprites.length = 0;

  // The east hall is a courtyard under a dusk sky; the rest keeps its stone ceiling. The sound follows: wind out there,
  // room tone inside. `fx.ambience` replaces the base's own bed, and a repeat call for the same bed does nothing.
  const underSky = skylitCells();
  view.setSky('dusk', { skylit: underSky });
  const bedFor = () => (underSky(Math.floor(rig.pos.x), Math.floor(rig.pos.y)) ? 'ambience-wind' : 'ambience-room');
  fx.ambience(bedFor(), { volume: 0.32 });

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
    reload: { keys: ['R'] },
  });
  const hud = createHud(scene, {});
  const ammoText = scene.add.text(scene.scale.width / 2, scene.scale.height - 22, '', { fontFamily: 'monospace', fontSize: '14px', color: '#e6edf3' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000);
  const crosshair = scene.add.text(scene.scale.width / 2, scene.scale.height / 2, '+', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
  void crosshair;

  const loadout = createLoadout({ ammo: { bullets: 40 } });
  const player = { hp: 100, keys: /** @type {string[]} */ ([]), kills: 0, msg: '' };
  let time = 0;
  let lastPos = { x: rig.pos.x, y: rig.pos.y };

  /** @type {any[]} */
  const enemies = [];
  /** @type {any[]} */
  const pickups = [];
  /** @type {any[]} */
  const rockets = [];
  /** Dead enemies fold down and fade; they are scenery, not targets. @type {any[]} */
  const corpses = [];
  let lastDry = -1e9;
  let reloadUntil = -1e9;
  for (const o of objects) {
    if (o.type === 'enemy') {
      const sprite = { x: o.x, y: o.y, color: '#c2564d', kind: 'grunt', scale: 0.8, flash: 0 };
      rig.sprites.push(sprite);
      enemies.push({ sprite, hp: ENEMY.hp, angle: 0, shotAt: 0, awake: false, stagger: 0 });
    } else if (o.type === 'pickup') {
      const kind = /** @type {Record<string, string>} */ (PICKUP_KIND)[o.name] ?? 'orb';
      const sprite = { x: o.x, y: o.y, color: /** @type {Record<string, string>} */ (PICKUP_COLOR)[o.name] ?? '#fff', kind, scale: 0.32, lift: 0.1, emissive: kind !== 'ammo' };
      rig.sprites.push(sprite);
      pickups.push({ kind: o.name, sprite, phase: pickups.length * 1.7 });
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

  /** Stereo position of a world point relative to where the player faces, -0.8 left .. 0.8 right. */
  function panOf(/** @type {number} */ x, /** @type {number} */ y) {
    let off = Math.atan2(y - rig.pos.y, x - rig.pos.x) - rig.angle;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    return Math.max(-0.8, Math.min(0.8, Math.sin(off) * 0.8));
  }
  const at = (/** @type {number} */ x, /** @type {number} */ y, lift = 0.45) => view.project(x, y, lift) ?? CENTRE;

  function damageEnemy(/** @type {any} */ e, /** @type {number} */ amount) {
    const wasAwake = e.awake;
    e.hp -= amount;
    e.awake = true;
    e.stagger = 0.18;
    e.sprite.flash = 0.1;
    const p = at(e.sprite.x, e.sprite.y);
    if (e.hp <= 0 && enemies.includes(e)) {
      remove(enemies, e);
      player.kills += 1;
      corpses.push({ sprite: { ...e.sprite, flash: 0.14, sy: 1, alpha: 1 }, age: 0 });
      rig.sprites.push(corpses[corpses.length - 1].sprite);
      juice.trigger('hit', { x: p.x, y: p.y, strength: 1.5, text: Math.round(amount), textKind: 'crit' });
      juice.burst('debris', p.x, p.y, { colors: [0xb1262b, 0x7a1d1d, 0xe5484d], scale: 1.4, dir: [0, -1] });
      fx.play('death', { power: 0.9 });
      return;
    }
    if (!wasAwake) fx.sfx.play('laser', { pitch: 0.6, power: 0.35, pan: panOf(e.sprite.x, e.sprite.y) });
    juice.trigger('hit', { x: p.x, y: p.y, strength: Math.min(1.4, amount / 14), text: Math.round(amount) });
  }

  function shoot() {
    if (time < reloadUntil) return; // the weapon is coming back up
    const shot = fire(loadout, time, () => rng.next());
    if (!shot) {
      const w = WEAPONS[loadout.current];
      const dry = w ? ((/** @type {Record<string, number>} */ (loadout.ammo)[w.ammoType] ?? 0) < w.ammoPerShot) : false;
      if (dry && time - lastDry > 450) {
        lastDry = time;
        juice.trigger('empty-click', { x: CENTRE.x, y: CENTRE.y });
      }
      return;
    }
    const { weapon } = shot;
    const muzzle = { x: CENTRE.x, y: 470 };
    const heavy = weapon.id === 'shotgun' ? 1.7 : weapon.id === 'rocket' ? 1.4 : 1;
    viewmodel.fire(heavy);
    view.flash(weapon.id === 'rocket' ? 1.6 : 1.1);
    // Each weapon has its own report: the pistol's crack and the shotgun's boom from the kit's gunshot presets, the
    // rocket launcher's whoosh from the generic shot plus a low laser.
    const report = weapon.id === 'pistol' ? 'gunshot-pistol' : weapon.id === 'shotgun' ? 'gunshot-shotgun' : 'shoot';
    juice.trigger(report, { x: muzzle.x, y: muzzle.y, dir: [0, -1], strength: heavy });
    if (weapon.id === 'rocket') fx.play('laser', { pitch: 0.5, power: 0.9 });
    if (weapon.kind === 'hitscan') {
      // One effect per enemy per shot, however many pellets landed, so a shotgun blast is one thump, not six.
      /** @type {Map<any, number>} */
      const landed = new Map();
      for (const off of shot.offsetsDeg) {
        const target = enemyAlong(rig.angle + (off * Math.PI) / 180, weapon.range);
        if (target) landed.set(target, (landed.get(target) ?? 0) + weapon.damage);
      }
      for (const [target, damage] of landed) damageEnemy(target, damage);
      if (landed.size === 0) {
        // A miss still marks the wall: sparks where the ray ended.
        const d = wallDistance(rig.angle);
        if (Number.isFinite(d) && d < weapon.range) {
          const p = at(rig.pos.x + Math.cos(rig.angle) * d, rig.pos.y + Math.sin(rig.angle) * d, 0.5);
          juice.burst('spark', p.x, p.y, { scale: 0.6 });
        }
      }
    } else {
      const sprite = { x: rig.pos.x, y: rig.pos.y, color: '#ffa04a', kind: 'orb', scale: 0.22, lift: 0.3, emissive: true };
      rig.sprites.push(sprite);
      rockets.push({ sprite, vx: Math.cos(rig.angle) * (weapon.speed ?? 7), vy: Math.sin(rig.angle) * (weapon.speed ?? 7), life: 3000, damage: weapon.damage, trail: 0 });
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
      fx.play('door');
      fx.play('powerup', { power: 0.6, volume: 0.7 });
    } else {
      player.msg = `Needs the ${key.replace('-', ' ')}`;
      fx.play('block', { power: 0.9 });
      juice.shake(0.12);
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
    const text = /** @type {Record<string, string>} */ (PICKUP_TEXT)[p.kind] ?? p.kind;
    const big = p.kind !== 'health' && p.kind !== 'ammo';
    juice.trigger(p.kind === 'health' ? 'heal' : 'pickup', { x: CENTRE.x, y: 400, strength: big ? 1.3 : 1, text, textKind: 'heal' });
    if (big) fx.play('powerup', { power: 0.8 });
    return true;
  }

  return {
    update(/** @type {number} */ _time, /** @type {number} */ delta) {
      time += delta;
      const dt = delta / 1000;
      const held = loadout.current;
      if (input.justPressed('weapon1')) switchWeapon(loadout, 'pistol');
      if (input.justPressed('weapon2')) switchWeapon(loadout, 'shotgun');
      if (input.justPressed('weapon3')) switchWeapon(loadout, 'rocket');
      if (input.justPressed('nextWeapon')) switchWeapon(loadout, 1);
      if (loadout.current !== held) {
        viewmodel.setWeapon(loadout.current);
        fx.play('ui-click', { pitch: 1.3, power: 0.7 });
      }
      if (input.justPressed('reload') && time >= reloadUntil) {
        // The kit has no magazines here, so a reload is the weapon lowering and coming back: a pause with the sound.
        reloadUntil = time + RELOAD_MS;
        viewmodel.setWeapon(loadout.current);
        juice.trigger('reload', { x: CENTRE.x, y: CENTRE.y });
      }
      if (input.isDown('fire')) shoot();
      fx.ambience(bedFor(), { volume: 0.32 });
      if (input.justPressed('use')) tryLockedDoor();

      for (const e of [...enemies]) {
        const dx = rig.pos.x - e.sprite.x;
        const dy = rig.pos.y - e.sprite.y;
        const d = Math.hypot(dx, dy);
        e.angle = Math.atan2(dy, dx);
        if (!e.awake && canSee({ x: e.sprite.x, y: e.sprite.y, angle: e.angle }, rig.pos, rig.map, { range: ENEMY.range, fovDeg: 360, isSolid: rig.isSolid })) e.awake = true;
        if (!e.awake) continue;
        e.sprite.flash = Math.max(0, e.sprite.flash - dt);
        e.stagger = Math.max(0, e.stagger - dt);
        if (d > 1.1 && e.stagger === 0) {
          const nx = e.sprite.x + (dx / d) * ENEMY.speed * dt;
          const ny = e.sprite.y + (dy / d) * ENEMY.speed * dt;
          if (walkable(nx, e.sprite.y)) e.sprite.x = nx;
          if (walkable(e.sprite.x, ny)) e.sprite.y = ny;
        }
        if (d < ENEMY.range && time - e.shotAt > ENEMY.everyMs && canSee({ x: e.sprite.x, y: e.sprite.y, angle: e.angle }, rig.pos, rig.map, { range: ENEMY.range, fovDeg: 360, isSolid: rig.isSolid })) {
          e.shotAt = time;
          player.hp = Math.max(0, player.hp - ENEMY.damage);
          e.sprite.flash = 0.08;
          fx.sfx.play('gunshot-rifle', { pitch: 1.1, power: 0.55, pan: panOf(e.sprite.x, e.sprite.y) }); // the grunts carry rifles
          juice.trigger('hurt', { x: CENTRE.x, y: CENTRE.y, strength: 0.75, text: ENEMY.damage, textKind: 'crit' });
        }
      }

      for (const r of [...rockets]) {
        r.sprite.x += r.vx * dt;
        r.sprite.y += r.vy * dt;
        r.life -= delta;
        r.trail -= delta;
        if (r.trail <= 0) {
          r.trail = 55;
          const p = view.project(r.sprite.x, r.sprite.y, 0.3);
          if (p) juice.burst('spark', p.x, p.y, { count: 2, scale: 0.4 });
        }
        const hit = !walkable(r.sprite.x, r.sprite.y) || enemies.some((e) => Math.hypot(e.sprite.x - r.sprite.x, e.sprite.y - r.sprite.y) < 0.5);
        if (hit || r.life <= 0) {
          for (const e of [...enemies]) if (Math.hypot(e.sprite.x - r.sprite.x, e.sprite.y - r.sprite.y) < 1.8) damageEnemy(e, r.damage);
          const p = at(r.sprite.x, r.sprite.y, 0.3);
          const near = Math.hypot(r.sprite.x - rig.pos.x, r.sprite.y - rig.pos.y);
          juice.trigger('explosion', { x: p.x, y: p.y, strength: Math.max(0.4, 1.5 - near * 0.18) });
          view.flash(2);
          remove(rockets, r);
        }
      }

      for (const p of pickups) p.sprite.lift = 0.1 + 0.05 * Math.sin(time / 280 + p.phase);
      for (const c of [...corpses]) {
        c.age += dt;
        c.sprite.flash = Math.max(0, c.sprite.flash - dt);
        c.sprite.sy = Math.max(0.1, 1 - c.age * 3.2);
        c.sprite.alpha = c.age > 1.6 ? Math.max(0, 1 - (c.age - 1.6) * 2) : 1;
        if (c.age > 2.2) {
          const i = rig.sprites.indexOf(c.sprite);
          if (i >= 0) rig.sprites.splice(i, 1);
          corpses.splice(corpses.indexOf(c), 1);
        }
      }
      for (const p of [...pickups]) {
        if (Math.hypot(p.sprite.x - rig.pos.x, p.sprite.y - rig.pos.y) < 0.6 && collect(p)) remove(pickups, p);
      }
      if (player.hp <= 0) {
        player.hp = 100;
        juice.trigger('death', { x: CENTRE.x, y: CENTRE.y });
        if (spawn) [rig.pos.x, rig.pos.y] = [spawn.x, spawn.y];
      }

      viewmodel.update(dt, Math.hypot(rig.pos.x - lastPos.x, rig.pos.y - lastPos.y));
      lastPos = { x: rig.pos.x, y: rig.pos.y };
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
          reloading: time < reloadUntil,
          ambience: fx.bedName,
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
