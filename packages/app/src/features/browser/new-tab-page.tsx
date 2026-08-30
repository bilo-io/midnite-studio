import { useState, type FormEvent } from 'react';
import { LuExternalLink, LuSearch } from 'react-icons/lu';
import { BrandMark, Wordmark } from '../../components/brand';
import { useBrowserStore } from '../../store/browser-store';
import { bridge } from '../../services/bridge';

export type BrowserShortcutTile = {
  id: string;
  label: string;
  url: string;
};

const DEFAULT_TILES: BrowserShortcutTile[] = [
  { id: 'google', label: 'Google', url: 'https://google.com' },
  { id: 'youtube', label: 'YouTube', url: 'https://youtube.com' },
  { id: 'figma', label: 'Figma', url: 'https://figma.com' },
];

export function NewTabPage() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const tiles: BrowserShortcutTile[] = DEFAULT_TILES;
  const recents: string[] = [];

  const [query, setQuery] = useState('');

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
      className="flex h-full flex-col items-center justify-center p-6 bg-background text-foreground overflow-y-auto"
    >
      <div className="flex flex-col items-center gap-4 mb-8">
        <BrandMark className="h-16 w-16" />
        <Wordmark className="h-6 text-foreground/90 font-brand text-2xl" />
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg mb-8">
        <div className="relative flex items-center">
          <LuSearch className="absolute left-3.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the web or enter URL"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
          />
        </div>
      </form>

      {/* Shortcut Tiles */}
      <div className="w-full max-w-xl mb-8">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Shortcuts
        </div>
        <div className="grid grid-cols-4 gap-3">
          {tiles.map((tile) => (
            <div
              key={tile.id}
              onClick={() => handleTileClick(tile.url)}
              className="group relative flex flex-col items-center justify-center rounded-lg border border-border/60 bg-card p-3 cursor-pointer transition-all hover:bg-accent hover:border-border"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm mb-2">
                {tile.label.charAt(0)}
              </div>
              <span className="text-xs font-medium truncate max-w-full">{tile.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recents */}
      {recents.length > 0 && (
        <div className="w-full max-w-xl">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent Origins
          </div>
          <div className="flex flex-wrap gap-2">
            {recents.slice(0, 8).map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => handleTileClick(url)}
                className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LuExternalLink className="h-3 w-3" />
                <span>{new URL(url).hostname}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
