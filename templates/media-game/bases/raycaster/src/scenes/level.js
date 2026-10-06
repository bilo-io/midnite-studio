// @ts-check
import { createRaycaster } from 'kit/phaser/presets/raycaster.js';
import { KitScene } from 'kit/phaser/scenes.js';

import { installGenre } from '../genre/index.js';

// 1-8 wall colours, 9 a door. A straight corridor with a door, then a room.
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export class Level extends KitScene {
  constructor() {
    super('level');
  }

  create() {
    // One enemy billboard in the far room. The preset has no physics, so the enemy is scenery until a genre adds shooting.
    this.rig = createRaycaster(this, {
      map: MAP,
      start: { x: 1.5, y: 1.5, angle: 0 },
      sprites: [{ x: 9.5, y: 3.5, color: '#e5484d', scale: 0.6 }],
    });
    this.genre = installGenre(this, { rig: this.rig });
  }

  update(time, delta) {
    this.rig.update(time, delta);
    this.genre.update(time, delta);
  }

  kitState() {
    return { ...this.rig.state(), ...this.genre.state() };
  }
}
