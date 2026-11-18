/**
 * Model thumbnails for the asset browser (Phase 139 Theme B). One offscreen renderer draws a {@link THUMB_SIZE}
 * square thumbnail per model, one at a time, and the data URL is cached by `name:sha256` in an LRU of
 * {@link THUMB_CACHE_MAX}. A model that fails answers `null` and is not retried this session, as `ModelCache` does.
 * Generic over the renderer so it tests without WebGL; `createThreeThumbRenderer` is the real one.
 */
import type { GameLevelModelResult, GitOpResult } from '@midnite/studio-shared';

import { Lru } from './lru';

export const THUMB_SIZE = 128;
export const THUMB_CACHE_MAX = 200;

export type ThumbRenderer = { render(glb: ArrayBuffer): Promise<string /* data URL */>; dispose(): void };

export type ModelThumbsDeps = {
  load: (name: string) => Promise<GitOpResult<GameLevelModelResult>>;
  /** Called lazily, once, on the first render. */
  renderer: () => ThumbRenderer;
};

export type ModelThumbs = {
  /** The thumbnail data URL, or `null` when the model could not be loaded or drawn. */
  get(name: string, sha256: string): Promise<string | null>;
  /** Drop the cache and the renderer (the panel unmounted). */
  clear(): void;
};

function decodeBase64(data: string): ArrayBuffer {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function createModelThumbs(deps: ModelThumbsDeps): ModelThumbs {
  const cache = new Lru<string, string>(THUMB_CACHE_MAX);
  const failed = new Set<string>();
  const inflight = new Map<string, Promise<string | null>>();
  let renderer: ThumbRenderer | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let generation = 0;

  async function produce(name: string): Promise<string | null> {
    const loaded = await deps.load(name);
    if (!loaded.ok) return null;
    renderer ??= deps.renderer();
    return renderer.render(decodeBase64(loaded.value.data));
  }

  return {
    get(name, sha256) {
      const key = `${name}:${sha256}`;
      const hit = cache.get(key);
      if (hit !== undefined) return Promise.resolve(hit);
      if (failed.has(key)) return Promise.resolve(null);
      const pending = inflight.get(key);
      if (pending) return pending;
      const gen = generation;
      // Serial: each job starts when the previous one settled, so only one load/GL draw is ever in flight.
      const job = chain
        .then(() => produce(name))
        .catch(() => null)
        .then((url) => {
          inflight.delete(key);
          if (gen !== generation) return url;
          if (url === null) failed.add(key);
          else cache.set(key, url);
          return url;
        });
      chain = job;
      inflight.set(key, job);
      return job;
    },
    clear() {
      generation++;
      cache.clear();
      failed.clear();
      inflight.clear();
      renderer?.dispose();
      renderer = null;
    },
  };
}
