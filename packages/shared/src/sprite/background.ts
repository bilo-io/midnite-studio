import { z } from 'zod';

import type { BackgroundSpec } from '../media-sprite';

/**
 * A parallax background's export (Phase 106 Theme I): one horizontally seamless PNG per layer under
 * `layers/`, and `background.json` listing them with their scroll factors — how far a layer moves per
 * pixel the camera moves (0 holds still, 1 moves with the world).
 */
export const BackgroundJsonSchema = z.object({
  version: z.literal(1),
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  layers: z.array(z.object({ image: z.string().min(1), scrollFactor: z.number().min(0).max(1) })).min(1),
});
export type BackgroundJson = z.infer<typeof BackgroundJsonSchema>;

/** Where a layer's PNG lives, relative to the asset (and to the export folder). */
export const backgroundLayerFile = (name: string): string => `layers/${name}.png`;

export function buildBackgroundJson(spec: Pick<BackgroundSpec, 'size' | 'layers'>): BackgroundJson {
  return { version: 1, size: [spec.size[0], spec.size[1]], layers: spec.layers.map((l) => ({ image: backgroundLayerFile(l.name), scrollFactor: l.scrollFactor })) };
}

/** Why this spec cannot be generated, or `null`. */
export function backgroundBlocker(spec: Pick<BackgroundSpec, 'layers'>): string | null {
  const names = spec.layers.map((l) => l.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  return dup ? `Two layers are called ${dup}.` : null;
}

/** Only `sky` is opaque; every other layer is keyed to transparent. */
export const isOpaqueLayer = (name: string): boolean => name === 'sky';
