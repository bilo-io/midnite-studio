// @ts-check
import { extendHook } from 'kit/core/hook.js';
import { createTopDown } from 'kit/phaser/presets/top-down.js';
import { KitScene } from 'kit/phaser/scenes.js';

import { createFx } from '../fx.js';
import { installGenre } from '../genre/index.js';
import { blockTexture, domeTexture, shadowTexture, tileTexture } from '../lit.js';

const WORLD_W = 1600;
const WORLD_H = 1200;
const STRIDE = 46; // px between footsteps

export class Level extends KitScene {
  constructor() {
    super('level');
    this.score = 0;
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    // Fidelity kit: Light2D normal-mapped surfaces from generated textures, juice and sound on by default.
    this.fx = createFx(this, { name: 'top-down', ambient: 0xb4bcd6, postfx: 'vignette' });
    const { juice, lighting } = this.fx;
    const flat = { iso: false };

    // Ground: 64 px lit tiles in two variants so the floor does not read as a grid of copies.
    const ground = [tileTexture(flat, this, 'ground-a', 'dirt', { seed: 3, base: 0x8a7258, accent: 0x5a4632, normalStrength: 0.9 }), tileTexture(flat, this, 'ground-b', 'dirt', { seed: 5, base: 0x7d6650, accent: 0x54402e, normalStrength: 0.9 })];
    for (let y = 0; y < WORLD_H; y += 64) {
      for (let x = 0; x < WORLD_W; x += 64) {
        const pick = (x / 64 + y / 64) % 5 === 0 ? 1 : 0;
        lighting.lit(this.add.image(x + 32, y + 32, /** @type {string} */ (ground[pick])).setDepth(-20));
      }
    }

    const wall = blockTexture(flat, this, 'wall', 'brick', { seed: 9 });
    const shadow = shadowTexture(this);
    const solids = this.physics.add.staticGroup();
    for (const [x, y] of [[400, 300], [464, 300], [528, 300], [800, 600], [800, 664], [1100, 400]]) {
      this.add.image(x + 8, y + 12, shadow).setDisplaySize(96, 56).setDepth(-10);
      lighting.lit(solids.create(x, y, wall));
    }

    const hero = domeTexture(this, 'hero', { size: 32, color: 0x6ea8ff, eyes: true });
    this.rig = createTopDown(this, { x: 96, y: 96, solids, texture: hero });
    this.rig.player.setDisplaySize(30, 30);
    lighting.lit(this.rig.player);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.rig.player, true, 0.1, 0.1);
    this.glow = lighting.add(96, 96, { radius: 420, intensity: 1.8 });
    // A fixed torch by the wall block, flickering without a random call.
    this.torch = lighting.add(430, 360, { radius: 240, intensity: 1.2, color: 0xff9a4a });

    // One pickup and one obstacle-enemy that drifts back and forth.
    const gemTexture = domeTexture(this, 'gem', { size: 20, color: 0xf5d90a, ring: 0.2 });
    const gem = lighting.lit(this.physics.add.staticSprite(1000, 200, gemTexture));
    const gemGlow = lighting.add(1000, 200, { radius: 120, intensity: 1.4, color: 0xffd84a });
    this.physics.add.overlap(this.rig.player, gem, () => {
      this.score += 1;
      juice.trigger('pickup', { x: gem.x, y: gem.y, text: '+1', textKind: 'heal' });
      lighting.lights.removeLight(gemGlow);
      gem.destroy();
    });
    const drifter = lighting.lit(this.physics.add.sprite(600, 500, domeTexture(this, 'drifter', { size: 32, color: 0xe5484d, eyes: true })));
    drifter.setDisplaySize(26, 26).setBounce(1, 1).setCollideWorldBounds(true).setVelocity(90, 60);
    this.drifter = drifter;
    this.physics.add.collider(drifter, solids, () => this.fx.play('block', { x: drifter.x, power: 0.35, volume: 0.5 }));
    this.hurtAt = -1e9;
    this.physics.add.collider(this.rig.player, drifter, () => {
      if (this.time.now - this.hurtAt < 700) return;
      this.hurtAt = this.time.now;
      juice.trigger('hurt', { target: this.rig.player, x: this.rig.player.x, y: this.rig.player.y, text: '-1', textKind: 'crit' });
    });

    this.stride = 0;
    this.last = { x: this.rig.player.x, y: this.rig.player.y };
    this.swingAt = -1e9;
    extendHook('fx', { trigger: (name) => juice.trigger(name, { target: this.rig.player, x: this.rig.player.x, y: this.rig.player.y }), state: () => juice.state() });
    this.genre = installGenre(this, { rig: this.rig, fx: this.fx, lighting, glow: this.glow });
  }

  update(time, delta) {
    const scale = this.fx.juice.update(delta); // hit-stop freezes physics and returns 0
    if (scale === 0) return;
    const { juice } = this.fx;
    const player = this.rig.player;
    this.rig.update(time, delta);
    this.genre.update(time, delta);
    this.glow.setPosition(player.x, player.y);
    this.torch.setIntensity(1.2 * this.fx.flicker(time / 1000));

    // Footsteps by distance walked, with a little dust.
    this.stride += Math.hypot(player.x - this.last.x, player.y - this.last.y);
    this.last = { x: player.x, y: player.y };
    if (this.stride >= STRIDE) {
      this.stride -= STRIDE;
      juice.trigger('footstep');
      juice.burst('dust', player.x, player.y + 12, { count: 2, scale: 0.4 });
    }
    // The action key swings: a slash arc in the facing direction that knocks the drifter back.
    if (this.rig.input.justPressed('action') && time - this.swingAt > 350) {
      this.swingAt = time;
      const [fx, fy] = this.rig.facing;
      const len = Math.hypot(fx, fy) || 1;
      const sx = player.x + (fx / len) * 26;
      const sy = player.y + (fy / len) * 26;
      this.fx.play('swing', { x: player.x });
      juice.burst('spark', sx, sy, { dir: [fx, fy], count: 6, scale: 0.7 });
      this.fx.ring(sx, sy, { radius: 40, ms: 220, color: 0xfff2b0, squash: 1 });
      const d = Math.hypot(this.drifter.x - sx, this.drifter.y - sy);
      if (d < 46) {
        juice.trigger('hit', { target: this.drifter, x: this.drifter.x, y: this.drifter.y, dir: [fx, fy], text: 8 });
        this.drifter.setVelocity((fx / len) * 220, (fy / len) * 220);
      }
    }
  }

  kitState() {
    return { ...this.rig.state(), score: this.score, juice: this.fx.juice.state(), ...this.genre.state() };
  }
}
