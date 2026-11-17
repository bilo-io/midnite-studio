/**
 * Rendering the 3D level to a PNG for `game_level_view` (Phase 138 Theme H). The scene is drawn once into a
 * `WebGLRenderTarget` through a temporary camera, so the live camera never moves under the user.
 */
import { PerspectiveCamera, SRGBColorSpace, WebGLRenderTarget, type Scene, type WebGLRenderer } from 'three';

import type { LevelViewCamera } from '@midnite/studio-shared';

export type CapturedPixels = { pixels: Uint8Array; width: number; height: number };

/** Render `scene` from `view` at `width` × `height` and read the pixels back (rows bottom-up, as GL gives them). */
export function captureScene(gl: WebGLRenderer, scene: Scene, view: LevelViewCamera, width: number, height: number): CapturedPixels {
  const camera = new PerspectiveCamera(view.fov ?? 50, width / height, 0.05, 5000);
  camera.position.set(...view.position);
  camera.lookAt(...view.target);
  camera.updateMatrixWorld();
  const target = new WebGLRenderTarget(width, height, { samples: 4 });
  target.texture.colorSpace = SRGBColorSpace;
  const previous = gl.getRenderTarget();
  try {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return { pixels, width, height };
  } finally {
    gl.setRenderTarget(previous);
    target.dispose();
  }
}

/** Flip GL's bottom-up rows to top-down. */
export function flipRows(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const stride = width * 4;
  const out = new Uint8ClampedArray(pixels.length);
  for (let row = 0; row < height; row += 1) out.set(pixels.subarray((height - 1 - row) * stride, (height - row) * stride), row * stride);
  return out;
}

/** A canvas's PNG as base64 (no data-URL prefix), through `convertToBlob` for an `OffscreenCanvas`. */
export async function canvasToBase64Png(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Captured GL pixels as a base64 PNG. */
export async function pixelsToPng(captured: CapturedPixels): Promise<string> {
  const canvas = new OffscreenCanvas(captured.width, captured.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is not available to encode the picture.');
  ctx.putImageData(new ImageData(flipRows(captured.pixels, captured.width, captured.height), captured.width, captured.height), 0, 0);
  return canvasToBase64Png(canvas);
}
