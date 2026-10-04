import { z } from 'zod';
import { TERRAIN_CLASSES, type TerrainClass, type TerrainCluster } from '@midnite/studio-shared';
import type { VisionCall } from '../model/engines';
import { encodePngRgba8 } from '../png/png-codec';

export const TerrainRelabelSchema = z.record(z.string().regex(/^\d+$/), z.enum(TERRAIN_CLASSES));
export type TerrainRelabel = z.infer<typeof TerrainRelabelSchema>;

export const VISION_RELABEL_PROMPT =
  `You are analyzing satellite imagery of a terrain. You are given a downscaled view of the satellite image and a swatch strip of cluster prototypes.
Classify each cluster into one of these land-cover classes:
${TERRAIN_CLASSES.join(', ')}

Return ONLY a JSON object mapping each cluster index string to its class name, e.g.:
{"0": "water", "1": "tree", "2": "grass"}`;

export type VisionRelabelResult = {
  relabelled: Map<number, TerrainClass>;
  warnings: string[];
};

export async function runVisionRelabel(
  call: VisionCall,
  drapeRgba: Uint8Array,
  drapeW: number,
  drapeH: number,
  clusters: TerrainCluster[],
  visionModel?: string,
  signal?: AbortSignal,
): Promise<VisionRelabelResult> {
  const warnings: string[] = [];
  const relabelled = new Map<number, TerrainClass>();

  if (clusters.length === 0) return { relabelled, warnings };

  try {
    // 1. Downscale drape to 512x512
    const targetSide = 512;
    const downscaled = new Uint8Array(targetSide * targetSide * 4);
    for (let y = 0; y < targetSide; y += 1) {
      const srcY = Math.min(drapeH - 1, Math.floor((y / targetSide) * drapeH));
      for (let x = 0; x < targetSide; x += 1) {
        const srcX = Math.min(drapeW - 1, Math.floor((x / targetSide) * drapeW));
        const srcIdx = (srcY * drapeW + srcX) * 4;
        const dstIdx = (y * targetSide + x) * 4;
        downscaled[dstIdx] = drapeRgba[srcIdx]!;
        downscaled[dstIdx + 1] = drapeRgba[srcIdx + 1]!;
        downscaled[dstIdx + 2] = drapeRgba[srcIdx + 2]!;
        downscaled[dstIdx + 3] = drapeRgba[srcIdx + 3]!;
      }
    }
    const drapePngBase64 = encodePngRgba8(downscaled, targetSide, targetSide).toString('base64');

    // 2. Build swatch strip: each cluster gets a 32x32 square
    const swatchSize = 32;
    const swatchW = swatchSize * clusters.length;
    const swatchH = swatchSize;
    const swatchRgba = new Uint8Array(swatchW * swatchH * 4);

    for (let c = 0; c < clusters.length; c += 1) {
      const [r, g, b] = clusters[c]!.rgb;
      const xStart = c * swatchSize;
      for (let y = 0; y < swatchH; y += 1) {
        for (let x = 0; x < swatchSize; x += 1) {
          const idx = (y * swatchW + (xStart + x)) * 4;
          swatchRgba[idx] = r;
          swatchRgba[idx + 1] = g;
          swatchRgba[idx + 2] = b;
          swatchRgba[idx + 3] = 255;
        }
      }
    }
    const swatchPngBase64 = encodePngRgba8(swatchRgba, swatchW, swatchH).toString('base64');

    const result = await call({
      images: [drapePngBase64, swatchPngBase64],
      prompt: VISION_RELABEL_PROMPT,
      visionModel,
      json: true,
      signal,
    });

    if (!result.ok) {
      const msg = result.kind === 'error' ? result.message : 'conflict';
      warnings.push(`Vision relabel skipped: ${msg}.`);
      return { relabelled, warnings };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.value.text);
    } catch {
      warnings.push(`Vision relabel skipped: invalid JSON from model.`);
      return { relabelled, warnings };
    }

    const parsed = TerrainRelabelSchema.safeParse(parsedJson);
    if (!parsed.success) {
      warnings.push(`Vision relabel skipped: schema validation failed.`);
      return { relabelled, warnings };
    }

    const validClusterIndices = new Set(clusters.map((c) => c.index));
    for (const [key, cls] of Object.entries(parsed.data)) {
      const idx = parseInt(key, 10);
      if (validClusterIndices.has(idx)) {
        relabelled.set(idx, cls);
      }
    }
  } catch (error) {
    warnings.push(`Vision relabel skipped: ${error instanceof Error ? error.message : String(error)}.`);
  }

  return { relabelled, warnings };
}
