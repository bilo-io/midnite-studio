import { describe, expect, it, beforeEach } from 'vitest';
import { WALLPAPER_THEMES, FALLBACK_WALLPAPERS, getWallpaperForTheme } from './wallpaper';

// The `getSavedWallpaperTheme`/`saveWallpaperTheme` localStorage helpers this
// file used to cover moved into `browser-store`'s persisted `wallpaperTheme`
// field (Theme F) — including the v1→v2 migration that reads this module's
// legacy `WALLPAPER_STORAGE_KEY` once. See `browser-store.test.ts`.
describe('wallpaper helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides all 6 wallpaper themes with labels', () => {
    expect(WALLPAPER_THEMES.map((t) => t.id)).toEqual([
      'nature',
      'minimal',
      'architecture',
      'abstract',
      'cyberpunk',
      'space',
    ]);
  });

  it('returns valid photo for theme', () => {
    const photo = getWallpaperForTheme('space', 0);
    expect(photo.imageUrl).toBeTruthy();
    expect(photo.authorName).toBeTruthy();
    expect(photo.authorUrl).toBeTruthy();
    expect(FALLBACK_WALLPAPERS.space).toContainEqual(photo);
  });
});
