// @ts-check
import { createPlatformer } from 'kit/phaser/presets/platformer.js';
import { KitScene, placeholderTexture } from 'kit/phaser/scenes.js';

import { installGenre } from '../genre/index.js';

const WORLD_W = 1600;
const WORLD_H = 540;

export class Level extends KitScene {
  constructor() {
    super('level');
    this.deaths = 0;
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    const ground = placeholderTexture(this, 'tile', 32, 32, 0x4a5568);
    const solids = this.physics.add.staticGroup();
    for (let x = 0; x < WORLD_W; x += 32) solids.create(x + 16, WORLD_H - 16, ground);
    const oneWay = this.physics.add.staticGroup();
    for (const [x, y] of [[300, 400], [520, 330], [760, 260]]) {
      for (let i = 0; i < 4; i += 1) oneWay.create(x + i * 32, y, placeholderTexture(this, 'ledge', 32, 10, 0x8b8b5a));
    }

    this.rig = createPlatformer(this, { x: 64, y: 400, solids, oneWay });
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.rig.player, true, 0.1, 0.1);

    // One hazard: a walker that patrols the floor. Touching it sends the player back to the start.
    const walker = this.physics.add.sprite(900, WORLD_H - 48, placeholderTexture(this, 'walker', 24, 24, 0xe5484d));
    walker.setCollideWorldBounds(true).setBounce(1, 0).setVelocityX(80);
    this.physics.add.collider(walker, solids);
    this.physics.add.overlap(this.rig.player, walker, () => {
      this.deaths += 1;
      this.rig.player.setPosition(64, 400).setVelocity(0, 0);
    });
    this.genre = installGenre(this, { rig: this.rig });
  }

  update(time, delta) {
    this.rig.update(time, delta);
    this.genre.update(time, delta);
  }

  kitState() {
    return { ...this.rig.state(), deaths: this.deaths, ...this.genre.state() };
  }
}
