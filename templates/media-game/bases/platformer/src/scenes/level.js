// @ts-check
import { extendHook } from 'kit/core/hook.js';
import { levelEntities, levelGrid } from 'kit/core/level.js';
import { createJuiceSettings } from 'kit/core/juice-settings.js';
import { createAudio } from 'kit/phaser/audio.js';
import { applyPostFx, createJuice, createLighting, litTexture } from 'kit/phaser/juice.js';
import { createPlatformer } from 'kit/phaser/presets/platformer.js';
import { KitLevelScene, preloadLevel } from 'kit/phaser/level.js';
import { placeholderTexture } from 'kit/phaser/scenes.js';

import { installGenre } from '../genre/index.js';

const WORLD_W = 1600;
const WORLD_H = 540;

/** A dusk gradient behind the world, drawn once to a texture (no image file). */
const backdrop = (scene) => {
  const canvas = scene.textures.createCanvas('backdrop', 4, 256);
  const ctx = canvas.context;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#16204a');
  g.addColorStop(0.65, '#3d4a82');
  g.addColorStop(1, '#8c6f8e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  canvas.refresh();
  scene.add.image(0, 0, 'backdrop').setOrigin(0).setScrollFactor(0.1, 0).setDisplaySize(960 + WORLD_W * 0.1, WORLD_H).setDepth(-10);
};

// The layout (ground row, one-way ledges, coins, the walker, the spawn) is `levels/level.tmj`; the textures, lights and juice are here.
export class Level extends KitLevelScene {
  constructor() {
    super('level');
    this.deaths = 0;
    this.coins = 0;
  }

  preload() {
    preloadLevel(this, this.levelName);
  }

  create() {
    const map = this.cache.tilemap.get(`level:${this.levelName}`)?.data ?? {};
    const entities = levelEntities(map);
    const ground = levelGrid(map, 'ground');
    const spawn = entities.find((e) => e.type === 'spawn') ?? { x: 64, y: 400 };
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    backdrop(this);

    // Fidelity kit: Light2D normal-mapped surfaces from generated textures, juice on by default.
    this.settings = createJuiceSettings({ gameName: 'platformer' });
    this.audio = createAudio(this);
    this.audio.sfx.setVolume(this.settings.resolved().volume);
    this.settings.subscribe(() => this.audio.sfx.setVolume(this.settings.resolved().volume));
    this.juice = createJuice(this, { settings: this.settings, sfx: this.audio.sfx, floorY: WORLD_H - 32 });
    this.lighting = createLighting(this, { ambient: 0xb4bcd6 });
    this.glow = this.lighting.add(spawn.x, spawn.y, { radius: 420, intensity: 1.1 });
    applyPostFx(this, this.settings);

    const groundTexture = litTexture(this, 'ground', 'stone', { size: 32, base: 0x5b6577, accent: 0x8b95a8, normalStrength: 1.1 });
    const ledge = litTexture(this, 'ledge', 'wood', { size: 32, normalStrength: 1.2 });
    const solids = this.physics.add.staticGroup();
    // Ground cells are anchored to the bottom of the world, so a world height that is not a multiple of 32 still sits on the floor.
    ground.forEach((row, ry) => row.forEach((gid, rx) => {
      if (gid) this.lighting.lit(solids.create(rx * 32 + 16, WORLD_H - (ground.length - ry) * 32 + 16, groundTexture));
    }));
    const oneWay = this.physics.add.staticGroup();
    for (const ledgeObject of entities.filter((e) => e.type === 'oneway')) {
      const y = ledgeObject.y + ledgeObject.height / 2;
      for (let i = 0; i < Math.floor(ledgeObject.width / 32); i += 1) this.lighting.lit(oneWay.create(ledgeObject.x + 16 + i * 32, y, ledge).setDisplaySize(32, 12).refreshBody());
    }

    this.rig = createPlatformer(this, { x: spawn.x, y: spawn.y, solids, oneWay });
    this.lighting.lit(this.rig.player);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.rig.player, true, 0.1, 0.1);

    // Coins on the ledges: collect one for a pickup chime, sparks and a "+1".
    const coinTexture = placeholderTexture(this, 'coin', 12, 12, 0xffd84a);
    this.coinGroup = this.physics.add.staticGroup();
    for (const coin of entities.filter((e) => e.name === 'coin')) this.lighting.lit(this.coinGroup.create(coin.x, coin.y, coinTexture));
    this.physics.add.overlap(this.rig.player, this.coinGroup, (_player, coin) => {
      coin.destroy();
      this.coins += 1;
      this.juice.trigger('pickup', { x: coin.x, y: coin.y, text: '+1', textKind: 'heal' });
    });

    // One hazard: a walker that patrols the floor. Touching it sends the player back to the start.
    for (const home of entities.filter((e) => e.name === 'walker')) {
      const walker = this.physics.add.sprite(home.x, home.y, placeholderTexture(this, 'walker', 24, 24, 0xe5484d));
      this.lighting.lit(walker);
      walker.setCollideWorldBounds(true).setBounce(1, 0).setVelocityX(80);
      this.physics.add.collider(walker, solids);
      this.physics.add.overlap(this.rig.player, walker, () => {
        this.deaths += 1;
        this.juice.trigger('hurt', { target: this.rig.player, x: this.rig.player.x, y: this.rig.player.y, text: '-1', textKind: 'crit' });
        this.rig.player.setPosition(spawn.x, spawn.y).setVelocity(0, 0);
      });
    }
    this.wasOnGround = true;
    this.fell = 0;
    extendHook('fx', { trigger: (name) => this.juice.trigger(name, { target: this.rig.player, x: this.rig.player.x, y: this.rig.player.y + 12 }), state: () => this.juice.state() });
    this.genre = installGenre(this, { rig: this.rig });
  }

  update(time, delta) {
    const scale = this.juice.update(delta); // hit-stop freezes physics and returns 0
    if (scale === 0) return;
    const player = this.rig.player;
    const body = /** @type {Phaser.Physics.Arcade.Body} */ (player.body);
    this.rig.update(time, delta);
    this.genre.update(time, delta);
    this.glow.setPosition(player.x, player.y - 20);

    const onGround = body.blocked.down || body.touching.down;
    const feet = player.y + 14;
    if (this.wasOnGround && !onGround && body.velocity.y < -50) this.juice.trigger('jump', { target: player, x: player.x, y: feet });
    if (!this.wasOnGround && onGround && this.fell > 0.18) this.juice.trigger('land', { target: player, x: player.x, y: feet, strength: Math.min(1.4, this.fell) });
    this.fell = onGround ? 0 : this.fell + delta / 1000;
    this.wasOnGround = onGround;
  }

  kitState() {
    return { ...super.kitState(), ...this.rig.state(), deaths: this.deaths, coins: this.coins, juice: this.juice.state(), ...this.genre.state() };
  }
}
