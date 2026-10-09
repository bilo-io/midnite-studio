import type { map } from '@midnite/studio-shared';

/**
 * The messages between `capture-broker.ts` and `map-capture-worker` (Phase 108 Theme D). Main fetches
 * and decodes tiles (JPEG/WebP need `nativeImage`, which a utility process lacks) and streams them
 * one message at a time, so peak memory is the mosaic, never a second copy of it in a single message.
 * The worker resamples and writes the outputs itself, into a temporary folder main then renames.
 */
export type CaptureWorkerIn =
  | {
      type: 'begin';
      id: string;
      frame: map.CaptureFrame;
      size: number;
      plan: map.TilePlan;
      encoding: map.DemEncoding;
      /** Absolute temporary folder — created by main. */
      outDir: string;
    }
  /** Theme E: stitch satellite tiles (`tile` messages follow) and write `satellite.png` at `size`². */
  | { type: 'begin-satellite'; id: string; frame: map.CaptureFrame; size: number; plan: map.TilePlan; outDir: string }
  /** Theme E: rasterise a road graph into `roads.png` at `size`² and write `roads.graph.json`. */
  | { type: 'begin-roads'; id: string; graph: map.RoadGraph; size: number; outDir: string }
  | { type: 'tile'; id: string; x: number; y: number; width: number; height: number; rgba: Uint8Array }
  | { type: 'finish'; id: string };

export type CaptureStats = {
  minM: number;
  maxM: number;
  /** Fraction of samples at or below 0 m — decides `hasSea` in the hand-off. */
  seaFraction: number;
  files: string[];
};

export type CaptureWorkerOut =
  | { type: 'progress'; id: string; fraction: number }
  | { type: 'reply'; id: string; ok: true; stats: CaptureStats }
  | { type: 'reply'; id: string; ok: false; message: string };
