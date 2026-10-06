// @ts-check
import { createTopDown } from 'kit/phaser/presets/top-down.js';
import { KitScene, placeholderTexture } from 'kit/phaser/scenes.js';

import { installGenre } from '../genre/index.js';

const WORLD_W = 1600;
const WORLD_H = 1200;

export class Level extends KitScene {
  constructor() {
    super('level');
    this.score = 0;
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.add.grid(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 64, 64, 0x1f2937, 1, 0x2d3748, 1);
    const wall = placeholderTexture(this, 'wall', 64, 64, 0x4a5568);
    const solids = this.physics.add.staticGroup();
    for (const [x, y] of [[400, 300], [464, 300], [528, 300], [800, 600], [800, 664], [1100, 400]]) solids.create(x, y, wall);

    this.rig = createTopDown(this, { x: 96, y: 96, solids });
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.rig.player, true, 0.1, 0.1);

    // One pickup and one obstacle-enemy that drifts back and forth.
    const gem = this.physics.add.staticSprite(1000, 200, placeholderTexture(this, 'gem', 16, 16, 0xf5d90a));
    this.physics.add.overlap(this.rig.player, gem, () => {
      this.score += 1;
      gem.destroy();
    });
    const drifter = this.physics.add.sprite(600, 500, placeholderTexture(this, 'drifter', 24, 24, 0xe5484d));
    drifter.setBounce(1, 1).setCollideWorldBounds(true).setVelocity(90, 60);
    this.physics.add.collider(drifter, solids);
    this.physics.add.collider(this.rig.player, drifter);
    this.genre = installGenre(this, { rig: this.rig });
  }

  update(time, delta) {
    this.rig.update(time, delta);
    this.genre.update(time, delta);
  }

  kitState() {
    return { ...this.rig.state(), score: this.score, ...this.genre.state() };
  }
}
