import { describe, expect, it, beforeEach } from 'vitest';
import {
  WALLPAPER_STORAGE_KEY,
  WALLPAPER_THEMES,
  FALLBACK_WALLPAPERS,
  getSavedWallpaperTheme,
  saveWallpaperTheme,
  getWallpaperForTheme,
} from './wallpaper';

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

  it('defaults to nature if no theme stored', () => {
    expect(getSavedWallpaperTheme()).toBe('nature');
  });

  it('saves and loads wallpaper theme from localStorage', () => {
    saveWallpaperTheme('cyberpunk');
    expect(localStorage.getItem(WALLPAPER_STORAGE_KEY)).toBe('cyberpunk');
    expect(getSavedWallpaperTheme()).toBe('cyberpunk');
  });

  it('recovers gracefully from invalid theme in storage', () => {
    localStorage.setItem(WALLPAPER_STORAGE_KEY, 'invalid-theme-foo');
    expect(getSavedWallpaperTheme()).toBe('nature');
  });

  it('returns valid photo for theme', () => {
    const photo = getWallpaperForTheme('space', 0);
    expect(photo.imageUrl).toBeTruthy();
    expect(photo.authorName).toBeTruthy();
    expect(photo.authorUrl).toBeTruthy();
    expect(FALLBACK_WALLPAPERS.space).toContainEqual(photo);
  });
});
