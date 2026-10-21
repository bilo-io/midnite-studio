// @ts-check
/**
 * Midnite game kit — loading glTF models (Models tab exports and others).
 *
 * One shared `GLTFLoader`; every mesh casts and receives shadows; skinned
 * models keep their clips for the animator. `cloneModel` makes an independent
 * copy of a skinned model (a plain `clone()` would share the skeleton).
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();

/**
 * @param {string} url e.g. `assetUrl('hero')` or `assets/models/hero/hero.glb`
 * @returns {Promise<{ scene: import('three').Group, animations: import('three').AnimationClip[], gltf: import('three/addons/loaders/GLTFLoader.js').GLTF }>}
 */
export async function loadModel(url) {
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse((object) => {
    const mesh = /** @type {import('three').Mesh} */ (object);
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { scene: gltf.scene, animations: gltf.animations, gltf };
}

/** An independent copy of a (possibly skinned) model. */
export function cloneModel(/** @type {import('three').Object3D} */ root) {
  return SkeletonUtils.clone(root);
}

export { loader as gltfLoader };
