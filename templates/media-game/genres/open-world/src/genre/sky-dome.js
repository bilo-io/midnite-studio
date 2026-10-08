// @ts-check
/**
 * A gradient sky dome tinted by the day/night cycle: the `skyAt` colour at the horizon, a deeper blue
 * overhead, and a warm glow around the sun. It follows the camera, ignores fog and depth, so the world
 * draws over it. The scene's flat `background` stays as the fallback colour beneath.
 */
import * as THREE from 'three';

const VERT = `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
  uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunPower; varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
    float s = max(dot(normalize(vDir), uSunDir), 0.0);
    col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 220.0) * 1.2) * uSunPower;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** @param {THREE.Scene} scene */
export function createSkyDome(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.82, 0.55) },
      uSunPower: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
  dome.scale.setScalar(700);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);
  const zenith = new THREE.Color();
  return {
    /**
     * @param {THREE.Color} horizon the sky colour from `skyAt`
     * @param {{ elevation: number, azimuth: number, night: boolean }} sky
     * @param {number} overcast 0..1: rain greys and flattens the dome
     * @param {THREE.Vector3} at the camera
     */
    update(horizon, sky, overcast, at) {
      dome.position.copy(at);
      zenith.copy(horizon).multiplyScalar(0.62).lerp(new THREE.Color(0.08, 0.2, 0.55), sky.night ? 0 : 0.25);
      material.uniforms['uHorizon'].value.copy(horizon).lerp(new THREE.Color(0.55, 0.58, 0.62), overcast * 0.7);
      material.uniforms['uZenith'].value.copy(zenith).lerp(new THREE.Color(0.4, 0.43, 0.48), overcast * 0.8);
      material.uniforms['uSunDir'].value.set(Math.sin(sky.azimuth) * Math.cos(sky.elevation), Math.sin(sky.elevation), Math.cos(sky.azimuth) * Math.cos(sky.elevation) * 0.4).normalize();
      material.uniforms['uSunPower'].value = sky.night ? 0 : (1 - overcast) * Math.max(0, Math.sin(sky.elevation) + 0.2);
    },
    dispose() {
      scene.remove(dome);
      dome.geometry.dispose();
      material.dispose();
    },
  };
}
