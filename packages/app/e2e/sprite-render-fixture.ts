/**
 * Phase 106 Theme E: a browser-side fixture for the render smoke e2e and the screenshots. Loaded by
 * the specs through the Vite dev server (`import('/e2e/sprite-render-fixture.ts')`), so it runs the
 * real `runRenderJob` — real three.js, real WebGL, real `OffscreenCanvas` — against an auto-rigged
 * copy of the kernel's example biped, with a fake bridge that collects the posted frames.
 */
import { autoRig, RIG_EXAMPLE_BIPED, type SpriteRenderedFrame, type SpriteRenderRequestEvent } from '@midnite/studio-shared';

import { runRenderJob } from '../src/features/media/sprite/render/render-job';

export type FixtureResult = { frames: SpriteRenderedFrame[]; error: string | null; total: number | null; clips: unknown };

export async function renderFixture(over: Partial<SpriteRenderRequestEvent> = {}): Promise<FixtureResult> {
  const spec = { ...RIG_EXAMPLE_BIPED, anatomy: 'biped' as const, rig: autoRig(RIG_EXAMPLE_BIPED, 'biped')!, animations: [{ name: 'walk', kind: 'walk' as const }, { name: 'idle', kind: 'idle' as const }] };
  const sidecar = JSON.stringify({ version: 1, name: 'robot', prompt: 'a robot', engine: 'mcp', spec, createdAt: '2026-10-07T10:00:00.000Z' });
  const out: FixtureResult = { frames: [], error: null, total: null, clips: null };
  await runRenderJob(
    {
      jobId: 'fixture',
      repoId: 'repo-1',
      model: { project: 'characters', path: 'robot/robot.json' },
      frameSize: [64, 64],
      directions: ['s', 'w', 'n', 'e'],
      settings: { camera: 'side', elevationDeg: 0, azimuthDeg: 0, shading: 'lit', outline: false, supersample: 4 },
      clips: [{ name: 'walk', frames: 8, fps: 8, loop: 'loop' }],
      ...over,
    },
    {
      readText: async () => sidecar,
      post: async (req) => {
        out.frames.push(...req.frames);
        if (req.error) out.error = req.error;
        if (req.total !== undefined) out.total = req.total;
        if (req.clips) out.clips = req.clips;
        return { ok: true };
      },
    },
  );
  return out;
}

/** Decodes a base64 PNG and reports its size, opaque pixel count and corner alphas. */
export async function inspectPng(png: string): Promise<{ width: number; height: number; opaque: number; corners: number[] }> {
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, bitmap.width, bitmap.height);
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 8) opaque += 1;
  const at = (x: number, y: number) => data[(y * width + x) * 4 + 3]!;
  return { width, height, opaque, corners: [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)] };
}
