import type { InstallProgress, RuntimeStatus } from './runtime';

/** Messages the music broker posts to the worker. */
export type MusicWorkerIn =
  | { type: 'configure'; directory: string }
  | { type: 'status'; id: string }
  | { type: 'install'; id: string }
  | { type: 'render'; id: string; prompt: string; seconds: number }
  | { type: 'cancel'; id: string };

/** Messages the worker posts back. `samples` is structured-cloned, never base64. */
export type MusicWorkerOut =
  | { type: 'status-reply'; id: string; value: RuntimeStatus }
  | { type: 'install-progress'; progress: InstallProgress }
  | { type: 'install-reply'; id: string; ok: boolean; message?: string }
  | { type: 'render-progress'; id: string; fraction: number }
  | { type: 'render-reply'; id: string; ok: true; samples: Float32Array; sampleRate: number }
  | { type: 'render-reply'; id: string; ok: false; message: string };
