// @ts-check
/**
 * The weapon in the player's hands: one procedurally painted sprite per weapon (no image files), with a
 * walk bob, a recoil kick when it fires and a short raise when it is switched in. Drawn by Phaser on top
 * of the raycast view, so it is unaffected by the view's lighting and costs nothing per pixel.
 */

const SIZE = 96;
const SCALE = 2.8;

/** @type {Record<string, (c: CanvasRenderingContext2D) => void>} */
const PAINT = {
  pistol(c) {
    const slide = c.createLinearGradient(0, 30, 0, 52);
    slide.addColorStop(0, '#9aa3b2');
    slide.addColorStop(0.5, '#59606e');
    slide.addColorStop(1, '#2c313b');
    c.fillStyle = slide;
    c.fillRect(34, 28, 28, 26);
    c.fillStyle = '#1c2028';
    c.fillRect(44, 22, 8, 8);
    c.fillStyle = '#7a4a2a';
    c.fillRect(38, 54, 20, 36);
    c.fillStyle = '#4a2c18';
    c.fillRect(38, 54, 6, 36);
    c.fillStyle = '#d9a37a';
    c.fillRect(30, 62, 10, 22);
    c.fillRect(56, 62, 10, 22);
  },
  shotgun(c) {
    const tube = c.createLinearGradient(0, 8, 0, 40);
    tube.addColorStop(0, '#a4adbb');
    tube.addColorStop(0.5, '#555c6a');
    tube.addColorStop(1, '#262a33');
    c.fillStyle = tube;
    c.fillRect(30, 6, 14, 54);
    c.fillRect(50, 6, 14, 54);
    c.fillStyle = '#6b4424';
    c.fillRect(26, 44, 44, 18);
    c.fillStyle = '#4a2c18';
    c.fillRect(26, 56, 44, 6);
    c.fillStyle = '#d9a37a';
    c.fillRect(22, 60, 12, 30);
    c.fillRect(62, 60, 12, 30);
  },
  rocket(c) {
    const tube = c.createLinearGradient(20, 0, 76, 0);
    tube.addColorStop(0, '#4c5a45');
    tube.addColorStop(0.35, '#8c9d82');
    tube.addColorStop(1, '#2d3629');
    c.fillStyle = tube;
    c.fillRect(24, 14, 48, 50);
    c.fillStyle = '#1b2018';
    c.fillRect(32, 8, 32, 12);
    c.fillStyle = '#e8963a';
    c.fillRect(24, 36, 48, 4);
    c.fillStyle = '#d9a37a';
    c.fillRect(18, 60, 14, 30);
    c.fillRect(64, 60, 14, 30);
  },
};

/** @param {string} name */
function paint(name) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  PAINT[name]?.(/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')));
  return canvas;
}

/**
 * @param {Phaser.Scene} scene
 * @param {{ shake: number }} [motion] `shake` 0..1 scales bob and kick (reduced motion lowers it)
 */
export function createViewmodel(scene, motion = { shake: 1 }) {
  for (const name of Object.keys(PAINT)) if (!scene.textures.exists(`viewmodel-${name}`)) scene.textures.addCanvas(`viewmodel-${name}`, paint(name));
  const baseY = scene.scale.height + 6;
  const image = scene.add.image(scene.scale.width / 2, baseY, 'viewmodel-pistol').setOrigin(0.5, 1).setScale(SCALE).setScrollFactor(0).setDepth(900);
  const muzzle = scene.add.circle(scene.scale.width / 2, baseY - 74 * SCALE - 6, 30, 0xffd27a, 0).setScrollFactor(0).setDepth(901).setBlendMode(1);
  let kick = 0;
  let raise = 0;
  let walk = 0;

  return {
    /** @param {string} weapon */
    setWeapon(weapon) {
      image.setTexture(`viewmodel-${weapon}`);
      raise = 1;
    },
    /** Recoil and a flash at the muzzle. @param {number} [strength] */
    fire(strength = 1) {
      kick = Math.min(1.4, kick + 0.7 * strength);
      muzzle.setAlpha(0.9).setScale(0.6 + strength * 0.5);
    },
    /** @param {number} dt seconds @param {number} moved cells walked this frame */
    update(dt, moved) {
      walk += moved * 5.2;
      kick = Math.max(0, kick - dt * 6);
      raise = Math.max(0, raise - dt * 5);
      const k = motion.shake;
      image.setPosition(scene.scale.width / 2 + Math.cos(walk * 0.5) * 7 * k, baseY + Math.abs(Math.sin(walk * 0.5)) * 6 * k + kick * 26 * k + raise * 70);
      image.setAngle(-kick * 3 * k);
      muzzle.setAlpha(Math.max(0, muzzle.alpha - dt * 14)).setPosition(image.x, image.y - 74 * SCALE - 6);
    },
  };
}
