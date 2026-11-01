import type { Sf3dGenerateStage, Sf3dResolvedOptions } from '@midnite/studio-shared';

/** The settings the worker's pipeline takes; the cut-out and framing ones are applied in main, before the pixels are sent. */
export type Sf3dRunSettings = Pick<Sf3dResolvedOptions, 'threshold' | 'resolution' | 'decodeBatch' | 'roughness' | 'metalness' | 'cameraDistance' | 'fov'>;

/** Messages the SF3D broker posts to `sf3d-worker`. `rgb` is structured-cloned, never base64. */
export type Sf3dWorkerIn = {
  type: 'generate';
  id: string;
  /** `<userData>/sf3d/assets`. */
  assetsDir: string;
  /** `[512, 512, 3]` float32 in [0, 1] (`prepareSf3dInput`). */
  rgb: Float32Array;
  textureSize: number;
  name: string;
  settings: Sf3dRunSettings;
};

/** Messages the worker posts back. */
export type Sf3dWorkerOut =
  | { type: 'stage'; id: string; stage: Sf3dGenerateStage; fraction?: number }
  | {
      type: 'reply';
      id: string;
      ok: true;
      glb: Uint8Array;
      vertices: number;
      triangles: number;
      bounds: { min: [number, number, number]; max: [number, number, number] };
      textureSize: number;
    }
  | { type: 'reply'; id: string; ok: false; message: string };
