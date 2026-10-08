// @ts-check
import { extendHook } from 'kit/core/hook.js';
import { castRay } from 'kit/core/raycast.js';
import { createRaycaster } from 'kit/phaser/presets/raycaster.js';
import { KitScene } from 'kit/phaser/scenes.js';

import { createFx } from '../fx.js';
import { installGenre } from '../genre/index.js';
import { createRaycastView } from '../render.js';

// 1-8 wall materials (render.js), 9 a door. A straight corridor with a door, then a room.
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const STRIDE = 0.85; // cells between footsteps

export class Level extends KitScene {
  constructor() {
    super('level');
  }

  create() {
    // Fidelity kit: juice (shake, hit-stop, particles, numbers), sound effects and post effects, on by default.
    this.fx = createFx(this, { name: 'raycaster', ambient: null });
    this.juice = this.fx.juice;

    // One enemy billboard in the far room. The preset has no physics, so the enemy is scenery until a genre adds shooting.
    this.rig = createRaycaster(this, {
      map: MAP,
      start: { x: 1.5, y: 1.5, angle: 0 },
      sprites: [{ x: 9.5, y: 3.5, color: '#e5484d', kind: 'grunt', scale: 0.8 }],
      minimap: false,
    });
    // The preset draws flat walls; this view reads the same map and sprites and paints them textured, normal-mapped and torch-lit.
    this.view = createRaycastView(this, this.rig);
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
    return { ...this.rig.state(), juice: this.juice.state(), ...this.genre.state() };
  }
}
