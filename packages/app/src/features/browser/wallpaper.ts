export type WallpaperTheme =
  | 'nature'
  | 'minimal'
  | 'architecture'
  | 'abstract'
  | 'cyberpunk'
  | 'space';

export interface WallpaperInfo {
  imageUrl: string;
  authorName: string;
  authorUrl: string;
}

export const WALLPAPER_THEMES: { id: WallpaperTheme; label: string }[] = [
  { id: 'nature', label: 'Nature' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'abstract', label: 'Abstract' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'space', label: 'Space' },
];

/**
 * The pre-Theme-F storage key. No longer read or written by this module —
 * the theme lives in `browser-store` now — but `browser-store.ts`'s v1→v2
 * `migrate` arm still needs the literal to carry a legacy value forward, and
 * this is the one place that used to own it.
 */
export const WALLPAPER_STORAGE_KEY = 'midnite-studio.browser.wallpaper-theme';

export const FALLBACK_WALLPAPERS: Record<WallpaperTheme, WallpaperInfo[]> = {
  nature: [
    {
      imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Bailey Zindel',
      authorUrl: 'https://unsplash.com/@baileyzindel',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Kalem Daniels',
      authorUrl: 'https://unsplash.com/@kalemdaniels',
    },
  ],
  minimal: [
    {
      imageUrl: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Scott Webb',
      authorUrl: 'https://unsplash.com/@scottwebb',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Sean Oulashin',
      authorUrl: 'https://unsplash.com/@oulashin',
    },
  ],
  architecture: [
    {
      imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Simone Hutsch',
      authorUrl: 'https://unsplash.com/@heysupersimi',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Leslie Leung',
      authorUrl: 'https://unsplash.com/@leslie_leung',
    },
  ],
  abstract: [
    {
      imageUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Geordanna Cordero',
      authorUrl: 'https://unsplash.com/@geordannacordero',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Pawel Czerwinski',
      authorUrl: 'https://unsplash.com/@pawel_czerwinski',
    },
  ],
  cyberpunk: [
    {
      imageUrl: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Avel Chuklanov',
      authorUrl: 'https://unsplash.com/@chuklanov',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Aleksandar Pasaric',
      authorUrl: 'https://unsplash.com/@apasaric',
    },
  ],
  space: [
    {
      imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2560&q=85',
      authorName: 'NASA',
      authorUrl: 'https://unsplash.com/@nasa',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=2560&q=85',
      authorName: 'Vincentiu Solomon',
      authorUrl: 'https://unsplash.com/@vincentiu',
    },
  ],
};

const DEFAULT_WALLPAPER: WallpaperInfo = {
  imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=85',
  authorName: 'Bailey Zindel',
  authorUrl: 'https://unsplash.com/@baileyzindel',
};

export function getWallpaperForTheme(theme: WallpaperTheme, index = 0): WallpaperInfo {
  const fallbacks = FALLBACK_WALLPAPERS[theme] || FALLBACK_WALLPAPERS.nature;
  const item = fallbacks[index % fallbacks.length];
  return item ?? DEFAULT_WALLPAPER;
}
