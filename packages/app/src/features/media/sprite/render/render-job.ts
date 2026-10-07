import {
  libraryParent,
  missingModelAssets,
  missingSculptMeshes,
  modelAssetPath,
  orthoFit,
  parseModelSidecar,
  planRenderedClips,
  resizeArea,
  SPRITE_RENDER_BATCH,
  spriteCameraMatrix,
  type GitOpResult,
  type MeshPart,
  type ModelSpec,
  type SpriteBox,
  type SpriteRenderedFrame,
  type SpriteRenderFramesRequest,
  type SpriteRenderRequestEvent,
} from '@midnite/studio-shared';
import {
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  OrthographicCamera,
  RedFormat,
  Scene,
  WebGLRenderer,
  type Material,
} from 'three';

import { lightingById, DEFAULT_LIGHTING } from '../../model/lighting';
import { assetTexture, loadAsset } from '../../model/model-assets';
import { modelFileUrl } from '../../model/model-utils';
import { poseAt, posedScene, rigModel } from '../../model/rig-pose';
import { editorScene, meshGeometry } from '../../model/spec-geometry';

/**
 * Phase 106 Theme E, the renderer's half: renders a rigged Models character into sprite frames. Loaded
 * lazily by `SpriteRenderHost` on the first request, so three's renderer costs nothing until then.
 *
 * - The model is built exactly as the Models editor builds it (`editorScene`, `rigModel`, `posedScene`
 *   — the kernel's CPU skinning), with the editor's own lights for `lit`.
 * - One orthographic camera per direction (`spriteCameraMatrix`), and one scale for the whole sheet
 *   (`orthoFit` over every sampled pose's bounds), so a character is the same pixel height in every
 *   frame of every direction.
 * - Each frame is drawn at `supersample ×` into a transparent `WebGLRenderer` (on an `OffscreenCanvas`
 *   where there is one), read back, box-downsampled to the frame size and PNG-encoded.
 * - Frames go to main in batches of {@link SPRITE_RENDER_BATCH}; each post resolves once main has
 *   processed it, and a refused post (the job was cancelled) stops the render.
 */
export type RenderJobApi = {
  readText: (req: { repoId: string; project: string; path: string }) => Promise<string | null>;
  post: (req: SpriteRenderFramesRequest) => Promise<GitOpResult>;
};

const designPath = (path: string): string => (path.endsWith('.json') ? path : `${path.replace(/\/+$/, '')}/model.json`);

export async function runRenderJob(event: SpriteRenderRequestEvent, api: RenderJobApi): Promise<void> {
  let renderer: WebGLRenderer | null = null;
  try {
    const path = designPath(event.model.path);
    const text = await api.readText({ repoId: event.repoId, project: event.model.project, path });
    const spec = text ? (parseModelSidecar(text)?.spec ?? null) : null;
    if (!spec) throw new Error(`Could not read the model ${event.model.project}/${path}.`);
    await loadMeshes(spec, event.repoId, event.model.project, libraryParent(path));

    const scene = editorScene(spec);
    const rig = rigModel(spec, scene);
    if (!rig) throw new Error('The attached model has no rig. Rig it in Media ▸ Models first.');
    const mapping = planRenderedClips(event.clips, spec.animations ?? [], event.settings);
    if (mapping.plans.length === 0) throw new Error(`No matching animation: ${mapping.unmatched.join(', ')}.`);
    const notes = mapping.unmatched.length > 0 ? [`No matching animation: ${mapping.unmatched.join(', ')} (skipped).`] : [];

    // Every pose once, for the sheet-wide fit.
    const poses = mapping.plans.map((plan) => plan.times.map((t) => posedScene(scene, rig, poseAt(rig, plan.modelClip, t))));
    const boxes = poses.flat().map((posed) => boundsOf(posed.parts.filter((p) => p.role === 'solid')));
    const views = Object.fromEntries(event.directions.map((dir) => [dir, spriteCameraMatrix(event.settings, dir)]));
    const fit = orthoFit(boxes, views, event.frameSize);

    const [fw, fh] = event.frameSize;
    const ss = event.settings.supersample;
    const [w, h] = [fw * ss, fh * ss];
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);

    const three = new Scene();
    addLights(three, event.settings.shading);
    const camera = new OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    camera.matrixAutoUpdate = false;
    const height = Math.max(1e-3, ...boxes.map((b) => b.max[1] - b.min[1]));
    const materials = new Map<string, Material>();
    const gradient = toonGradient();

    const total = mapping.plans.reduce((sum, plan) => sum + plan.times.length, 0) * event.directions.length;
    const clips = mapping.plans.map((plan) => ({ name: plan.clip.name, frames: plan.clip.frames, fps: plan.clip.fps }));
    let batch: SpriteRenderedFrame[] = [];
    let first = true;
    const flush = async (done: boolean): Promise<boolean> => {
      const answer = await api.post({ jobId: event.jobId, frames: batch, done, ...(first ? { total, clips, ...(notes.length > 0 ? { notes } : {}) } : {}) });
      first = false;
      batch = [];
      return answer.ok;
    };

    for (const dir of event.directions) {
      const view = views[dir]!;
      const f = fit.frusta[dir]!;
      // The view is a rotation, so the camera's world matrix is its transpose (row-major in, three's `set` takes row-major).
      camera.matrix.set(view[0]!, view[4]!, view[8]!, 0, view[1]!, view[5]!, view[9]!, 0, view[2]!, view[6]!, view[10]!, 0, 0, 0, 0, 1);
      camera.matrixWorldNeedsUpdate = true;
      Object.assign(camera, { left: f.left, right: f.right, top: f.top, bottom: f.bottom });
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      for (const [k, plan] of mapping.plans.entries()) {
        for (let index = 0; index < plan.times.length; index += 1) {
          const meshes = buildMeshes(poses[k]![index]!.parts, event.settings, materials, gradient, height * 0.012);
          for (const mesh of meshes) three.add(mesh);
          renderer.render(three, camera);
          for (const mesh of meshes) {
            three.remove(mesh);
            mesh.geometry.dispose();
          }
          const png = await encodePng(readFrame(renderer, w, h, fw, fh));
          batch.push({ clip: plan.clip.name, dir, index, png });
          if (batch.length >= SPRITE_RENDER_BATCH && !(await flush(false))) return;
        }
      }
    }
    await flush(true);
    for (const m of materials.values()) m.dispose();
    gradient.dispose();
  } catch (error) {
    await api.post({ jobId: event.jobId, frames: [], done: true, error: (error instanceof Error ? error.message : String(error)).slice(0, 500) }).catch(() => undefined);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}

async function loadMeshes(spec: ModelSpec, repoId: string, project: string, dir: string): Promise<void> {
  const parts = [...missingModelAssets(spec), ...missingSculptMeshes(spec)];
  const problems = await Promise.all(parts.map((part) => loadAsset(modelFileUrl(repoId, project, modelAssetPath(dir, part.src)), part.hash, part.shape)));
  const failed = problems.find((p) => p !== null);
  if (failed) throw new Error(`The model's mesh could not be loaded: ${failed}`);
}

function boundsOf(parts: readonly MeshPart[]): SpriteBox {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let a = 0; a < 3; a += 1) {
        const v = part.positions[i + a]!;
        if (v < min[a]!) min[a] = v;
        if (v > max[a]!) max[a] = v;
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

function addLights(scene: Scene, shading: SpriteRenderRequestEvent['settings']['shading']): void {
  if (shading === 'flat') return;
  const preset = lightingById(DEFAULT_LIGHTING);
  scene.add(new HemisphereLight(preset.hemisphere.sky, preset.hemisphere.ground, preset.hemisphere.intensity));
  scene.add(new AmbientLight(0xffffff, preset.ambient));
  for (const light of preset.directional) {
    const directional = new DirectionalLight(light.color ?? '#ffffff', light.intensity);
    directional.position.set(...light.position);
    scene.add(directional);
  }
}

/** Toon shading: a 3-step ramp, nearest-filtered so the bands stay hard. */
function toonGradient(): DataTexture {
  const texture = new DataTexture(new Uint8Array([80, 170, 255]), 3, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function materialFor(part: MeshPart, settings: SpriteRenderRequestEvent['settings'], cache: Map<string, Material>, gradient: DataTexture): Material {
  const key = `${settings.shading}:${part.color}:${part.texture ?? ''}:${part.material.roughness}:${part.material.metalness}:${part.material.opacity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const map = part.texture && part.uvs ? assetTexture(part.texture) : null;
  const m = part.material;
  const material =
    settings.shading === 'flat'
      ? new MeshBasicMaterial({ color: new Color(part.color), map })
      : settings.shading === 'toon'
        ? new MeshToonMaterial({ color: new Color(part.color), gradientMap: gradient, map })
        : new MeshStandardMaterial({ color: new Color(part.color), map, roughness: m.roughness, metalness: m.metalness, emissive: new Color(m.emissive), emissiveIntensity: m.emissiveIntensity, transparent: m.opacity < 1, opacity: m.opacity });
  cache.set(key, material);
  return material;
}

const OUTLINE = 'outline';

/** The posed solid parts as meshes; with `outline`, an inverted hull behind each (back faces, pushed out along the normals). */
function buildMeshes(parts: readonly MeshPart[], settings: SpriteRenderRequestEvent['settings'], cache: Map<string, Material>, gradient: DataTexture, push: number): Mesh[] {
  const out: Mesh[] = [];
  for (const part of parts) {
    if (part.role !== 'solid') continue;
    const geometry = meshGeometry(part);
    out.push(new Mesh(geometry, materialFor(part, settings, cache, gradient)));
    if (settings.outline) {
      let hull = cache.get(OUTLINE);
      if (!hull) {
        hull = new MeshBasicMaterial({ color: 0x000000, side: BackSide });
        cache.set(OUTLINE, hull);
      }
      const pushed = new Float32Array(part.positions.length);
      for (let i = 0; i < pushed.length; i += 1) pushed[i] = part.positions[i]! + part.normals[i]! * push;
      const shell = new BufferGeometry();
      shell.setAttribute('position', new Float32BufferAttribute(pushed, 3));
      shell.setIndex(part.indices);
      out.push(new Mesh(shell, hull));
    }
  }
  return out;
}

/** Reads the drawing buffer (bottom-up), flips it, and box-downsamples to the frame size. */
function readFrame(renderer: WebGLRenderer, w: number, h: number, fw: number, fh: number) {
  const gl = renderer.getContext();
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const flipped = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) flipped.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return resizeArea({ width: w, height: h, data: flipped }, fw, fh);
}

/** RGBA → base64 PNG through a 2D canvas. */
async function encodePng(image: { width: number; height: number; data: Uint8ClampedArray }): Promise<string> {
  const data = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
}
