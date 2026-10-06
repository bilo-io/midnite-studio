// @ts-check
/**
 * Midnite game kit — a minimal HUD: score, health, a save notice and the
 * fps/frame-time overlay the runner toolbar toggles (`setOverlay`).
 */

import Phaser from 'phaser';

import { EPHEMERAL_SAVE_NOTICE } from '../core/save.js';

/**
 * @param {Phaser.Scene} scene
 * @param {{ persistentSaves?: boolean, font?: string }} [options]
 */
export function createHud(scene, options = {}) {
  const style = { fontFamily: options.font ?? 'monospace', fontSize: '14px', color: '#e6edf3' };
  const score = scene.add.text(12, 10, '', style).setScrollFactor(0).setDepth(1000);
  const health = scene.add.text(12, 28, '', style).setScrollFactor(0).setDepth(1000);
  const notice = scene.add
    .text(scene.scale.width - 12, 10, options.persistentSaves ? '' : EPHEMERAL_SAVE_NOTICE, { ...style, fontSize: '11px', color: '#8b949e' })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(1000);
  const overlay = scene.add
    .text(scene.scale.width - 12, scene.scale.height - 10, '', { ...style, fontSize: '11px' })
    .setOrigin(1, 1)
    .setScrollFactor(0)
    .setDepth(1001)
    .setVisible(false);

  const onOverlay = (/** @type {boolean} */ on) => overlay.setVisible(on);
  scene.game.events.on('midnite:overlay', onOverlay);
  const tick = () => {
    if (!overlay.visible) return;
    const loop = scene.game.loop;
    overlay.setText(`${loop.actualFps.toFixed(0)} fps · ${loop.delta.toFixed(1)} ms`);
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.game.events.off('midnite:overlay', onOverlay);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
  });

  return {
    setScore: (/** @type {number} */ value) => score.setText(`Score ${value}`),
    setHealth: (/** @type {number} */ value, /** @type {number} */ max) => health.setText(`HP ${value}/${max}`),
    setPersistentSaves: (/** @type {boolean} */ on) => notice.setText(on ? '' : EPHEMERAL_SAVE_NOTICE),
  };
}
