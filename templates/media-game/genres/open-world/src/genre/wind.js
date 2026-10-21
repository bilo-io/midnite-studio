// @ts-check
/**
 * Wind sway for the terrain's foliage: the instanced trees and grass get a vertex shader that leans
 * each instance by a travelling wave, more toward its top. `uTime` is the game clock, set by the level,
 * and `uStrength` follows the juice settings (0 with effects off, a fraction under reduced motion).
 */
import * as THREE from 'three';

/**
 * @param {THREE.Object3D} root the terrain's group
 * @returns {{ set(seconds: number, strength: number): void, count: number }}
 */
export function addFoliageWind(root) {
  const uniforms = { uTime: { value: 0 }, uStrength: { value: 1 } };
  const done = new Set();
  root.traverse((o) => {
    const mesh = /** @type {THREE.InstancedMesh} */ (o);
    if (!mesh.isInstancedMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(material)) continue;
      done.add(material);
      material.onBeforeCompile = (shader) => {
        shader.uniforms['uTime'] = uniforms.uTime;
        shader.uniforms['uStrength'] = uniforms.uStrength;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uStrength;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            {
              vec3 root = instanceMatrix[3].xyz;
              float phase = uTime * 1.7 + root.x * 0.21 + root.z * 0.17;
              float lean = clamp(position.y * 0.12, 0.0, 1.0);
              transformed.x += (sin(phase) + 0.4 * sin(phase * 2.3)) * 0.18 * lean * uStrength;
              transformed.z += cos(phase * 0.8) * 0.1 * lean * uStrength;
            }`,
          );
      };
      material.customProgramCacheKey = () => 'midnite-foliage-wind';
      material.needsUpdate = true;
    }
  });
  return {
    count: done.size,
    set(seconds, strength) {
      uniforms.uTime.value = seconds;
      uniforms.uStrength.value = strength;
    },
  };
}
