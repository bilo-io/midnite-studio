// @ts-check
import { createIsometric } from 'kit/phaser/presets/isometric.js';
import { KitScene } from 'kit/phaser/scenes.js';

import { installGenre } from '../genre/index.js';

// 0 floor, 1 wall block. The player starts in the top-left corner.
const MAP = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

export class Level extends KitScene {
  constructor() {
    super('level');
  }

  create() {
    this.rig = createIsometric(this, { map: MAP, start: { x: 1, y: 1 } });
    // The obstacle is the wall blocks in MAP; the picked tile under the pointer is highlighted.
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
