import * as THREE from 'three';

export type SplatMaterialTextures = {
  splatMap: THREE.Texture;
  drapeMap?: THREE.Texture | null;
  grassAlbedo?: THREE.Texture | null;
  rockAlbedo?: THREE.Texture | null;
  dirtAlbedo?: THREE.Texture | null;
  snowAlbedo?: THREE.Texture | null;
  worldSize: number;
};

/**
 * Creates a MeshStandardMaterial with custom onBeforeCompile shader logic that
 * blends the 4 PBR materials (grass, rock, dirt, snow) using build/splat.png,
 * repeating tiles every 8m, and fading into drape.png between 150m and 400m.
 */
export function createSplatMaterial({
  splatMap,
  drapeMap,
  grassAlbedo,
  rockAlbedo,
  dirtAlbedo,
  snowAlbedo,
  worldSize,
}: SplatMaterialTextures): THREE.MeshStandardMaterial {
  const dummyTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  })();

  const setupTileTexture = (tex?: THREE.Texture | null) => {
    if (!tex) return dummyTexture;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  };

  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.1,
  });

  const uniforms = {
    uSplatMap: { value: splatMap },
    uDrapeMap: { value: drapeMap ?? dummyTexture },
    uHasDrape: { value: drapeMap ? 1.0 : 0.0 },
    uGrassAlbedo: { value: setupTileTexture(grassAlbedo) },
    uRockAlbedo: { value: setupTileTexture(rockAlbedo) },
    uDirtAlbedo: { value: setupTileTexture(dirtAlbedo) },
    uSnowAlbedo: { value: setupTileTexture(snowAlbedo) },
    uWorldSize: { value: worldSize },
    uTileSize: { value: 8.0 },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPos;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPos;
       uniform sampler2D uSplatMap;
       uniform sampler2D uDrapeMap;
       uniform float uHasDrape;
       uniform sampler2D uGrassAlbedo;
       uniform sampler2D uRockAlbedo;
       uniform sampler2D uDirtAlbedo;
       uniform sampler2D uSnowAlbedo;
       uniform float uTileSize;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       vec4 splatWeights = texture2D(uSplatMap, vUv);
       vec2 tileUv = vWorldPos.xz / uTileSize;

       vec4 colGrass = texture2D(uGrassAlbedo, tileUv);
       vec4 colRock = texture2D(uRockAlbedo, tileUv);
       vec4 colDirt = texture2D(uDirtAlbedo, tileUv);
       vec4 colSnow = texture2D(uSnowAlbedo, tileUv);

       vec4 blendedTiles = splatWeights.r * colGrass +
                           splatWeights.g * colRock +
                           splatWeights.b * colDirt +
                           splatWeights.a * colSnow;

       float cameraDist = length(vWorldPos - cameraPosition);
       float drapeFade = uHasDrape > 0.5 ? clamp((cameraDist - 150.0) / 250.0, 0.0, 1.0) : 0.0;
       vec4 drapeColor = texture2D(uDrapeMap, vUv);

       diffuseColor = mix(blendedTiles, drapeColor, drapeFade);
      `,
    );
  };

  return mat;
}
