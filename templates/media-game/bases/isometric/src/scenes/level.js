// @ts-check
import { extendHook } from 'kit/core/hook.js';
import { isoDepth, isoToScreen } from 'kit/core/iso.js';
import { createIsometric } from 'kit/phaser/presets/isometric.js';
import { KitScene } from 'kit/phaser/scenes.js';

import { createFx } from '../fx.js';
import { installGenre } from '../genre/index.js';
import { blockTexture, domeTexture, shadowTexture, tileTexture } from '../lit.js';

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
const TILE_W = 64;
const TILE_H = 32;
const BLOCK_DEPTH = 36;
const GEMS = [[5, 1], [8, 5], [2, 6]];
const STRIDE = 0.8; // tiles between footsteps

export class Level extends KitScene {
  constructor() {
    super('level');
    this.score = 0;
  }

  create() {
    // Fidelity kit: Light2D normal-mapped tiles and blocks from generated textures, juice and sound on by default.
    this.fx = createFx(this, { name: 'isometric', ambient: 0xb4bcd6, postfx: 'vignette' });
    const { juice, lighting } = this.fx;
    this.rig = createIsometric(this, { map: MAP, start: { x: 1, y: 1 } });
    // The preset paints flat diamonds (depth -1) and an ellipse for the player; hide them and draw lit ones in their place.
    for (const child of this.children.list) {
      const object = /** @type {Phaser.GameObjects.GameObject & { depth: number, setVisible(v: boolean): unknown }} */ (child);
      if (object.type === 'Graphics' && object.depth === -1) object.setVisible(false);
    }
    this.rig.player.setVisible(false);

    const origin = { x: this.scale.width / 2, y: 80 };
    const at = (/** @type {number} */ x, /** @type {number} */ y) => {
      const p = isoToScreen(x, y, TILE_W, TILE_H);
      return { x: p.x + origin.x, y: p.y + origin.y };
    };
    this.at = at;
    const floorA = tileTexture({ iso: true }, this, 'floor-a', 'stone', { seed: 3, base: 0x8a93a6, accent: 0xaeb6c6, normalStrength: 1.1 });
    const floorB = tileTexture({ iso: true }, this, 'floor-b', 'stone', { seed: 8, base: 0x7d869a, accent: 0xa2abbc, normalStrength: 1.1 });
    const block = blockTexture({ iso: true }, this, 'block', 'brick', { seed: 9, depth: BLOCK_DEPTH });
    const shadow = shadowTexture(this);
    MAP.forEach((row, y) => row.forEach((cell, x) => {
      const p = at(x, y);
      if (cell === 0) {
        lighting.lit(this.add.image(p.x - TILE_W / 2, p.y, (x + y) % 3 === 0 ? floorB : floorA).setOrigin(0).setDepth(-20));
      } else {
        lighting.lit(this.add.image(p.x - TILE_W / 2, p.y, (x + y) % 3 === 0 ? floorB : floorA).setOrigin(0).setDepth(-20));
        this.add.image(p.x + 8, p.y + TILE_H / 2 + 4, shadow).setDisplaySize(96, 48).setDepth(-15).setAlpha(0.8);
        lighting.lit(this.add.image(p.x - TILE_W / 2, p.y - BLOCK_DEPTH, block).setOrigin(0).setDepth(isoDepth(x, y, 0.5)));
      }
    }));

    this.hero = lighting.lit(this.add.image(0, 0, domeTexture(this, 'hero', { size: 32, color: 0x6ea8ff, eyes: true })).setDisplaySize(24, 24));
    this.heroShadow = this.add.image(0, 0, shadow).setDisplaySize(30, 15);
    this.glow = lighting.add(origin.x, origin.y, { radius: 330, intensity: 1.8 });
    this.torches = [[2, 3], [7, 4], [5, 5]].map(([x, y]) => {
      const p = at((x ?? 0) + 0.5, (y ?? 0) + 0.5);
      return lighting.add(p.x, p.y - 10, { radius: 190, intensity: 1.2, color: 0xff9a4a });
    });

    // Collect the gems: a chime, sparks and a "+1".
    const gemTexture = domeTexture(this, 'gem', { size: 20, color: 0xf5d90a, ring: 0.2 });
    this.gems = GEMS.map(([x, y]) => {
      const p = at((x ?? 0) + 0.5, (y ?? 0) + 0.5);
      return { x: (x ?? 0) + 0.5, y: (y ?? 0) + 0.5, sprite: lighting.lit(this.add.image(p.x, p.y - 10, gemTexture).setDepth(isoDepth((x ?? 0) + 0.5, (y ?? 0) + 0.5, 1))), phase: (x ?? 0) * 1.3 };
    });

    // Clicking a tile pings it.
    this.input.on('pointerdown', () => {
      const tile = this.rig.hovered;
      if (!tile) return;
      const p = at(tile.x + 0.5, tile.y + 0.5);
      this.fx.ring(p.x, p.y, { radius: 36, ms: 360, color: 0xf6e05e, squash: 0.5 });
      this.fx.play('ui-click', { x: p.x, volume: 0.6 });
    });

    this.stride = 0;
    this.last = { x: 1.5, y: 1.5 };
    extendHook('fx', { trigger: (name) => juice.trigger(name, { x: this.hero.x, y: this.hero.y }), state: () => juice.state() });
    this.genre = installGenre(this, { rig: this.rig, fx: this.fx, lighting, glow: this.glow });
  }

  update(time, delta) {
    const scale = this.fx.juice.update(delta);
    if (scale === 0) return;
    this.rig.update(time, delta);
    this.genre.update(time, delta);
    const state = this.rig.state().player.position;
    const px = state[0] ?? 0;
    const py = state[1] ?? 0;
    const p = this.at(px, py);
    this.hero.setPosition(p.x, p.y - 8).setDepth(isoDepth(px, py, 1));
    this.heroShadow.setPosition(p.x, p.y + 2).setDepth(isoDepth(px, py, 0.4));
    this.glow.setPosition(p.x, p.y - 12);
    this.torches.forEach((light, i) => light.setIntensity(1.2 * this.fx.flicker(time / 1000, i * 2)));

    this.stride += Math.hypot(px - this.last.x, py - this.last.y);
    this.last = { x: px, y: py };
    if (this.stride >= STRIDE) {
      this.stride -= STRIDE;
      this.fx.juice.trigger('footstep');
      this.fx.juice.burst('dust', p.x, p.y, { count: 2, scale: 0.4 });
    }
    for (const gem of [...this.gems]) {
      const g = this.at(gem.x, gem.y);
      gem.sprite.setPosition(g.x, g.y - 12 + Math.sin(time / 260 + gem.phase) * 3);
      if (Math.hypot(gem.x - px, gem.y - py) < 0.6) {
        this.score += 1;
        this.fx.juice.trigger('pickup', { x: g.x, y: g.y - 12, text: '+1', textKind: 'heal' });
        gem.sprite.destroy();
        this.gems.splice(this.gems.indexOf(gem), 1);
      }
    }
  }

  kitState() {
    return { ...this.rig.state(), score: this.score, juice: this.fx.juice.state(), ...this.genre.state() };
  }
}
