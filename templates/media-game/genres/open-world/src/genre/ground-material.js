// @ts-check
/**
 * Gives the terrain's drape material surface detail: three procedural normal maps (grass, dirt, rock,
 * from `kit/core/procedural-textures.js`) blended per patch of land by a splat texture made from the
 * pack's land cover (`ground-splat.js`), plus a little albedo variation from the same heights. The detail
 * fades out with distance so far hills stay clean. No image files.
 */
import * as THREE from 'three';

import { generateTextureData } from 'kit/core/procedural-textures.js';

/** Metres per detail tile, and where it starts to fade and where it is gone. */
const TILE_METRES = 4;
const FADE = /** @type {const} */ ([70, 240]);

/** A tiling RGBA texture: the normal map in rgb, the height in alpha. @param {'grass' | 'dirt' | 'stone'} kind @param {number} seed */
function detailTexture(kind, seed) {
  const size = 256;
  const data = generateTextureData(kind, { seed, size, normalStrength: 3 });
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = data.normal[i * 4] ?? 128;
    rgba[i * 4 + 1] = data.normal[i * 4 + 1] ?? 128;
    rgba[i * 4 + 2] = data.normal[i * 4 + 2] ?? 255;
    rgba[i * 4 + 3] = data.bump[i * 4] ?? 128;
  }
  const texture = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** The drape material the terrain's ground meshes share, or null (a pack with vertex colours has none to detail). @param {THREE.Object3D} root */
export function findGroundMaterial(root) {
  /** @type {THREE.MeshStandardMaterial | null} */
  let found = null;
  root.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    const mat = /** @type {THREE.MeshStandardMaterial} */ (mesh.material);
    if (!found && mesh.isMesh && !(/** @type {any} */ (o).isInstancedMesh) && mat?.map && mat.roughness === 0.95) found = mat;
  });
  return found;
}

/**
 * @param {THREE.MeshStandardMaterial} material the shared drape material
 * @param {Uint8Array} splat RGBA from `splatTexture`
 * @param {number} splatSize
 * @param {number} worldSize metres across the terrain (the drape spans it exactly once)
 */
export function applyGroundDetail(material, splat, splatSize, worldSize) {
  const grass = detailTexture('grass', 3);
  const dirt = detailTexture('dirt', 5);
  const rock = detailTexture('stone', 7);
  const land = new THREE.DataTexture(splat, splatSize, splatSize, THREE.RGBAFormat);
  land.minFilter = land.magFilter = THREE.LinearFilter;
  land.generateMipmaps = false;
  land.needsUpdate = true;
  const repeat = worldSize / TILE_METRES;
  grass.repeat.set(repeat, repeat);
  material.normalMap = grass;
  material.normalScale = new THREE.Vector2(0.9, 0.9);
  material.needsUpdate = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uDirt'] = { value: dirt };
    shader.uniforms['uRock'] = { value: rock };
    shader.uniforms['uLand'] = { value: land };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <normalmap_pars_fragment>',
        `#include <normalmap_pars_fragment>
        uniform sampler2D uDirt; uniform sampler2D uRock; uniform sampler2D uLand;
        // Normal (rgb, encoded) and height (a) blended by the land cover under this fragment.
        vec4 groundDetail(vec2 uv) {
          vec3 w = texture2D(uLand, vMapUv).rgb;
          w /= max(0.001, w.r + w.g + w.b);
          return texture2D(normalMap, uv) * w.r + texture2D(uDirt, uv) * w.g + texture2D(uRock, uv) * w.b;
        }
        float groundFade() { return 1.0 - smoothstep(${FADE[0].toFixed(1)}, ${FADE[1].toFixed(1)}, length(vViewPosition)); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * groundDetail(vNormalMapUv).a, groundFade());`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.split('texture2D( normalMap, vNormalMapUv )').join('mix(vec4(0.5, 0.5, 1.0, 1.0), groundDetail(vNormalMapUv), groundFade())'),
      );
  };
  material.customProgramCacheKey = () => 'midnite-ground-detail';
  return { dispose: () => [grass, dirt, rock, land].forEach((t) => t.dispose()) };
}
