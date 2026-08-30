import { useState, type FormEvent } from 'react';
import { LuExternalLink, LuSearch } from 'react-icons/lu';
import { SiGoogle, SiYoutube, SiFigma, SiGooglegemini, SiNotebooklm } from 'react-icons/si';
import { ClaudeIcon } from '../../components/icons';
import { BrandMark, Wordmark } from '../../components/brand';
import { useBrowserStore } from '../../store/browser-store';
import { bridge } from '../../services/bridge';
import type { IconComponent } from '../../components/icon-button';

export type BrowserShortcutTile = {
  id: string;
  label: string;
  url: string;
  icon: IconComponent;
};

const SHORTCUT_ROWS: BrowserShortcutTile[][] = [
  [
    { id: 'google', label: 'Google', url: 'https://google.com', icon: SiGoogle },
    { id: 'youtube', label: 'YouTube', url: 'https://youtube.com', icon: SiYoutube },
    { id: 'figma', label: 'Figma', url: 'https://figma.com', icon: SiFigma },
  ],
  [
    { id: 'claude', label: 'Claude', url: 'https://claude.ai', icon: ClaudeIcon },
    { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com', icon: SiGooglegemini },
    { id: 'notebook', label: 'Notebook', url: 'https://notebooklm.google.com', icon: SiNotebooklm },
  ],
];

export function NewTabPage() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
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
        <div className="group relative flex items-center rounded-full p-[1px] bg-border hover:bg-gradient-to-r hover:from-primary/50 hover:via-purple-500/50 hover:to-accent/50 focus-within:bg-gradient-to-r focus-within:from-primary focus-within:via-purple-500 focus-within:to-accent transition-all shadow-xs">
          <div className="relative flex w-full items-center rounded-full bg-card">
            <LuSearch className="absolute left-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the web or enter URL"
              className="w-full rounded-full bg-transparent py-2.5 pl-10 pr-4 text-sm outline-none"
            />
          </div>
        </div>
      </form>

      {/* Shortcut Tiles */}
      <div className="w-full max-w-xl mb-8 flex flex-col items-center">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">
          Shortcuts
        </div>
        <div className="flex flex-col items-center gap-3 w-full">
          {SHORTCUT_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-4 w-full">
              {row.map((tile) => {
                const IconComponent = tile.icon;
                return (
                  <div
                    key={tile.id}
                    onClick={() => handleTileClick(tile.url)}
                    className="group relative flex w-28 flex-col items-center justify-center rounded-lg bg-transparent p-3 cursor-pointer transition-all hover:bg-accent/40"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/30 text-foreground font-bold text-lg mb-2 transition-transform group-hover:scale-105">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-medium truncate max-w-full text-center">{tile.label}</span>
                  </div>
                );
              })}
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
