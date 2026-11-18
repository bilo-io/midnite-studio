/**
 * Where the asset browser's thumbnails come from (Phase 139 Theme C): images through `games.levels.assetThumb`
 * (a data URL, cached here by `name:sha256`), models through Theme B's `createModelThumbs`, whose three.js renderer
 * is imported only when the first model tile asks, so a game of sprites never pulls three.
 */
import { bridge } from '@midnite/studio-frame';

import { createModelThumbs, type ModelThumbs } from './model-thumbs';
import { Lru } from './lru';
import type { BrowserAsset } from './asset-browser-model';

export type ThumbSource = {
  /** A data URL, or `null` when no thumbnail could be made (the tile shows its kind icon). */
  get(asset: BrowserAsset): Promise<string | null>;
  dispose(): void;
};

export function createThumbSource(gameId: string): ThumbSource {
  const images = new Lru<string, string | null>(200);
  let models: Promise<ModelThumbs> | null = null;
  const modelThumbs = (): Promise<ModelThumbs> => {
    models ??= import('./three-thumb-renderer').then((m) =>
      createModelThumbs({
        load: async (name) => (await bridge()?.games.levels.model({ gameId, name })) ?? { ok: false, kind: 'error', message: 'The app bridge is not available.' },
        renderer: m.createThreeThumbRenderer,
      }),
    );
    return models;
  };
  return {
    async get(asset) {
      if (asset.kind === 'model') return (await modelThumbs()).get(asset.name, asset.sha256);
      const key = `${asset.name}:${asset.sha256}`;
      if (images.has(key)) return images.get(key) ?? null;
      const result = await bridge()?.games.levels.assetThumb({ gameId, name: asset.name });
      const url = result?.ok ? result.value.dataUrl : null;
      images.set(key, url);
      return url;
    },
    dispose() {
      images.clear();
      void models?.then((m) => m.clear());
      models = null;
    },
  };
}
