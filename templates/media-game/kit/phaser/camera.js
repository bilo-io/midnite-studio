// @ts-check
/**
 * Midnite game kit — camera follow with a deadzone, and screen shake.
 */

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject & { x: number, y: number }} target
 * @param {{ deadzone?: [number, number], lerp?: number, bounds?: { x: number, y: number, width: number, height: number }, roundPixels?: boolean }} [options]
 */
export function followWithDeadzone(scene, target, options = {}) {
  const camera = scene.cameras.main;
  const lerp = options.lerp ?? 0.12;
  camera.startFollow(target, options.roundPixels ?? true, lerp, lerp);
  const [w, h] = options.deadzone ?? [camera.width * 0.25, camera.height * 0.3];
  camera.setDeadzone(w, h);
  if (options.bounds) camera.setBounds(options.bounds.x, options.bounds.y, options.bounds.width, options.bounds.height);
  return camera;
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ duration?: number, intensity?: number }} [options]
 */
export function shake(scene, options = {}) {
  scene.cameras.main.shake(options.duration ?? 150, options.intensity ?? 0.008);
}
