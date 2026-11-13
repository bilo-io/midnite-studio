// @ts-check
import { extendHook } from 'kit/core/hook.js';
import { levelEntities, levelGrid } from 'kit/core/level.js';
import { castRay } from 'kit/core/raycast.js';
import { createRaycaster } from 'kit/phaser/presets/raycaster.js';
import { KitLevelScene, preloadLevel } from 'kit/phaser/level.js';

import { createFx } from '../fx.js';
import { installGenre } from '../genre/index.js';
import { createRaycastView } from '../render.js';

const STRIDE = 0.85; // cells between footsteps

// The layout is `levels/level.tmj`: a `walls` layer whose gid is the wall material (1-8, render.js; 9 a door), and the
// spawn and enemy objects in pixels, so cell = pixel / tile size. A straight corridor with a door, then a room.
export class Level extends KitLevelScene {
  constructor() {
    super('level');
  }

  preload() {
    preloadLevel(this, this.levelName);
  }

  create() {
    const map = this.cache.tilemap.get(`level:${this.levelName}`)?.data ?? {};
    const cell = Number(map.tilewidth) || 64;
    const entities = levelEntities(map);
    const spawn = entities.find((e) => e.type === 'spawn');
    const enemies = entities.filter((e) => e.type === 'enemy' && e.name === 'grunt');
    // Fidelity kit: juice (shake, hit-stop, particles, numbers), sound effects and post effects, on by default.
    this.fx = createFx(this, { name: 'raycaster', ambient: null });
    this.juice = this.fx.juice;

    // One enemy billboard in the far room. The preset has no physics, so the enemy is scenery until a genre adds shooting.
    this.rig = createRaycaster(this, {
      map: levelGrid(map, 'walls'),
      start: { x: (spawn?.x ?? 96) / cell, y: (spawn?.y ?? 96) / cell, angle: 0 },
      sprites: enemies.map((e) => ({ x: e.x / cell, y: e.y / cell, color: String(e.properties.color ?? '#e5484d'), kind: 'grunt', scale: Number(e.properties.scale ?? 0.8) })),
      minimap: false,
    });
    // The preset draws flat walls; this view reads the same map and sprites and paints them textured, normal-mapped and torch-lit.
    this.view = createRaycastView(this, this.rig);
    // A walled yard open to a dusk sky: the ceiling becomes a gradient with a low sun, the fog and ambient take the sky's
    // colours, and a wind bed runs under it. A genre that wants a roof calls `view.setSky(null)` and its own `fx.ambience`.
    this.view.setSky('dusk', { light: true });
    this.fx.ambience('ambience-wind', { volume: 0.3 });
    this.stride = 0;
    this.last = { x: this.rig.pos.x, y: this.rig.pos.y };
    extendHook('fx', {
      trigger: (name) => this.juice.trigger(name, { x: this.scale.width / 2, y: this.scale.height / 2 }),
      state: () => this.juice.state(),
    });
    this.genre = installGenre(this, { rig: this.rig, view: this.view, fx: this.fx });
  }

  update(time, delta) {
    const scale = this.juice.update(delta); // hit-stop freezes the world and returns 0
    if (scale === 0) return;
    this.rig.update(time, delta);
    this.genre.update(time, delta);

    // Footsteps and a walk bob, by distance covered (not by time, so standing still is silent).
    const moved = Math.hypot(this.rig.pos.x - this.last.x, this.rig.pos.y - this.last.y);
    this.last = { x: this.rig.pos.x, y: this.rig.pos.y };
    this.stride += moved;
    this.view.walk(moved, this.fx.settings.resolved().shake);
    if (this.stride >= STRIDE) {
      this.stride -= STRIDE;
      this.juice.trigger('footstep');
    }
    // A door creaks as it starts to open.
    if (this.rig.input.justPressed('use')) {
      const hit = castRay(this.rig.map, this.rig.pos, { x: Math.cos(this.rig.angle), y: Math.sin(this.rig.angle) }, { isSolid: this.rig.isSolid });
      if (hit.hit && hit.cell === 9 && hit.distance < 1.5) this.fx.play('door');
    }
    this.view.draw(delta / 1000);
  }

  kitState() {
    return { ...super.kitState(), ...this.rig.state(), juice: this.juice.state(), ...this.genre.state() };
  }
}
