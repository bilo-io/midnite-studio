import { GAME_LEVEL_EXT, GAME_LEVEL_MAX_BYTES, GAME_LEVELS_DIR } from '@midnite/studio-shared';

/**
 * Play from here's in-memory level overlay (Phase 140 Theme B). One file per game — `levels/<scene>.tmj` — that the
 * game's protocol handler answers in place of the disk. Nothing is written and nothing is committed, so the repo's
 * working tree is never touched and a crash leaves nothing behind.
 */
export type PreviewOverlay = {
  /** Hold `json` as `levels/<scene>.tmj` for `gameId`; `false` (and nothing held) when it is over `maxBytes`. */
  set(gameId: string, scene: string, json: string): boolean;
  /** The overlay's bytes when `pathname` is exactly its file, else `null`. */
  get(gameId: string, pathname: string): Buffer | null;
  /** The scene this game previews, or `null`. */
  scene(gameId: string): string | null;
  clear(gameId: string): void;
};

export function createPreviewOverlay(maxBytes = GAME_LEVEL_MAX_BYTES): PreviewOverlay {
  const held = new Map<string, { scene: string; path: string; bytes: Buffer }>();
  return {
    set(gameId, scene, json) {
      const bytes = Buffer.from(json, 'utf8');
      if (bytes.byteLength > maxBytes) return false;
      held.set(gameId, { scene, path: `/${GAME_LEVELS_DIR}/${scene}${GAME_LEVEL_EXT}`, bytes });
      return true;
    },
    get(gameId, pathname) {
      const entry = held.get(gameId);
      if (!entry) return null;
      let decoded: string;
      try {
        decoded = decodeURIComponent(pathname);
      } catch {
        return null;
      }
      return decoded === entry.path ? entry.bytes : null;
    },
    scene: (gameId) => held.get(gameId)?.scene ?? null,
    clear(gameId) {
      held.delete(gameId);
    },
  };
}
