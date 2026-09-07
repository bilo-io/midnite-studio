import { useState, useEffect, type FormEvent } from 'react';
import { LuExternalLink, LuSearch, LuImage, LuRefreshCw, LuServer, LuGlobe } from 'react-icons/lu';
import { SiGoogle, SiYoutube, SiFigma, SiGooglegemini, SiNotebooklm } from 'react-icons/si';
import type { BrowserShortcutIconKey } from '@midnite/studio-shared';
import { ClaudeIcon } from '../../components/icons';
import { BrandMark, Wordmark } from '../../components/brand';
import { useBrowserStore, type BrowserShortcutTile } from '../../store/browser-store';
import { bridge } from '../../services/bridge';
import type { IconComponent } from '../../components/icon-button';
import { devServerLabel, devServerUrl } from './dev-server';
import { useDevServer } from './use-dev-server';
import { type WallpaperTheme, WALLPAPER_THEMES, getWallpaperForTheme } from './wallpaper';

/**
 * The six seeded tiles' glyphs. `BrowserShortcutTile` (moved to
 * `packages/shared`, Theme F) keeps only an `iconKey` — the shared package
 * carries zod, not `react-icons` — so this is where a key resolves back to a
 * real component. A tile with no key (every user-added one via `addTile`)
 * falls back to the generic globe, exactly as a page with no favicon does in
 * `tab-strip.tsx`.
 */
const SHORTCUT_ICONS: Record<BrowserShortcutIconKey, IconComponent> = {
  google: SiGoogle,
  youtube: SiYoutube,
  figma: SiFigma,
  claude: ClaudeIcon,
  gemini: SiGooglegemini,
  notebook: SiNotebooklm,
};

function iconForTile(tile: BrowserShortcutTile): IconComponent {
  return (tile.iconKey && SHORTCUT_ICONS[tile.iconKey]) || LuGlobe;
}

/** Three tiles per row, matching the grid this page has always rendered. */
function chunkTiles(tiles: BrowserShortcutTile[]): BrowserShortcutTile[][] {
  const rows: BrowserShortcutTile[][] = [];
  for (let i = 0; i < tiles.length; i += 3) {
    rows.push(tiles.slice(i, i + 3));
  }
  return rows;
}

export function NewTabPage() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const recents = useBrowserStore((s) => s.recents);
  const tiles = useBrowserStore((s) => s.tiles);
  const theme = useBrowserStore((s) => s.wallpaperTheme);
  const setWallpaperTheme = useBrowserStore((s) => s.setWallpaperTheme);
  /*
    Absent, not disabled, when nothing is listening or no repo is active
    (Phase 71 Theme C). A greyed-out "Dev server" tile teaches nothing an
    absent one does not, and it would occupy the row every time the answer
    was no — which is most of the time.
  */
  const devServer = useDevServer();

  const [query, setQuery] = useState('');
  const [wallpaperIndex, setWallpaperIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const wallpaper = getWallpaperForTheme(theme, wallpaperIndex);

  useEffect(() => {
    setLoaded(false);
  }, [wallpaper.imageUrl]);

  const handleThemeChange = (newTheme: WallpaperTheme) => {
    setWallpaperTheme(newTheme);
    setWallpaperIndex(0);
  };

  const handleCycleWallpaper = () => {
    setWallpaperIndex((prev) => prev + 1);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !activeTabId) return;

    let targetUrl = query.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = `https://${targetUrl}`;
      } else {
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
      }
    }

    useBrowserStore.getState().updateTabState(activeTabId, { kind: 'page', url: targetUrl });
    void bridge()?.browser.create({ tabId: activeTabId, url: targetUrl });
  };

  const handleTileClick = (url: string) => {
    if (!activeTabId) return;
    useBrowserStore.getState().updateTabState(activeTabId, { kind: 'page', url });
    void bridge()?.browser.create({ tabId: activeTabId, url });
  };

  return (
    <div
      data-testid="browser-newtab"
      className="relative flex h-full w-full flex-col items-center justify-center p-6 text-foreground overflow-y-auto select-none"
    >
      {/* Background Wallpaper Image & Overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <img
          src={wallpaper.imageUrl}
          alt={`Wallpaper by ${wallpaper.authorName}`}
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-700 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* Subtle dark tint gradient to make content stand out crisply */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px]" />
      </div>

      {/* Top / Bottom Wallpaper controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full border border-border/40 bg-background/60 px-3 py-1.5 backdrop-blur-md shadow-xs">
        <LuImage className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          data-testid="wallpaper-theme-select"
          aria-label="Wallpaper Theme"
          value={theme}
          onChange={(e) => handleThemeChange(e.target.value as WallpaperTheme)}
          className="bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer pr-1"
        >
          {WALLPAPER_THEMES.map((t) => (
            <option key={t.id} value={t.id} className="bg-popover text-popover-foreground">
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCycleWallpaper}
          title="Next wallpaper in theme"
          aria-label="Next wallpaper"
          className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
        >
          <LuRefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Unsplash Attribution badge */}
      <div className="absolute bottom-3 right-4 z-20 text-[10px] text-muted-foreground/80 bg-background/40 px-2 py-0.5 rounded backdrop-blur-sm">
        Photo by{' '}
        <a
          href={wallpaper.authorUrl}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          {wallpaper.authorName}
        </a>{' '}
        on Unsplash
      </div>

      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col items-center max-w-xl w-full">
        <div className="flex flex-col items-center gap-4 mb-8 drop-shadow-md">
          <BrandMark className="h-16 w-16" />
          <Wordmark className="h-6 text-foreground/90 font-brand text-2xl" />
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-lg mb-8">
          <div className="group relative flex items-center rounded-full p-[1px] bg-border/80 hover:bg-gradient-to-r hover:from-primary/50 hover:via-purple-500/50 hover:to-accent/50 focus-within:bg-gradient-to-r focus-within:from-primary focus-within:via-purple-500 focus-within:to-accent transition-all shadow-lg backdrop-blur-md">
            <div className="relative flex w-full items-center rounded-full bg-card/85 backdrop-blur-md border border-border/30">
              <LuSearch className="absolute left-3.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the web or enter URL"
                className="w-full rounded-full bg-transparent py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          </div>
        </form>

        {devServer ? (
          <button
            type="button"
            data-testid="dev-server-tile"
            onClick={() => handleTileClick(devServerUrl(devServer))}
            title={
              devServer.source === 'script'
                ? `From this repository's "${devServer.script}" script`
                : 'Something is listening on this port'
            }
            className="mb-4 flex items-center gap-2.5 rounded-full border border-border/50 bg-card/60 px-4 py-1.5 text-xs font-medium text-foreground/90 backdrop-blur-md transition-colors hover:bg-accent"
          >
            <LuServer className="h-3.5 w-3.5 text-primary" />
            <span>{devServerLabel(devServer)}</span>
          </button>
        ) : null}

        {/* Shortcut Tiles Panel with Frosted Glass styling */}
        <div
          data-testid="shortcuts-panel"
          className="w-full mb-8 flex flex-col items-center rounded-2xl border border-white/10 dark:border-white/5 bg-card/40 dark:bg-card/30 p-5 backdrop-blur-xl shadow-xl"
        >
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
            Shortcuts
          </div>
          <div className="flex flex-col items-center gap-3 w-full">
            {chunkTiles(tiles).map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-4 w-full">
                {row.map((tile) => {
                  const IconComponent = iconForTile(tile);
                  return (
                    <button
                      type="button"
                      key={tile.id}
                      data-testid={`shortcut-tile-${tile.id}`}
                      onClick={() => handleTileClick(tile.url)}
                      className="group relative flex w-24 flex-col items-center justify-center rounded-xl bg-background/20 hover:bg-background/50 p-3 cursor-pointer transition-all hover:scale-105 border border-white/5 shadow-xs"
                    >
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl font-bold text-lg mb-2 transition-transform group-hover:scale-110 shadow-inner"
                        style={{
                          backgroundColor: tile.bgColor,
                          color: tile.brandColor,
                        }}
                      >
                        <IconComponent className="h-5 w-5" style={{ color: tile.brandColor }} />
                      </div>
                      <span className="text-xs font-medium truncate max-w-full text-center text-foreground/90 group-hover:text-foreground">
                        {tile.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Recents */}
        {recents.length > 0 && (
          <div className="w-full">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Origins
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.slice(0, 8).map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => handleTileClick(url)}
                  className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/60 backdrop-blur-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <LuExternalLink className="h-3 w-3" />
                  <span>{new URL(url).hostname}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
