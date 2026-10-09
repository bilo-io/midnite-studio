import type { GameAssetSource, GameAssetSourceTab } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuFolderOpen } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { useAssetSources, useImportAsset } from './use-games';

const TABS: Array<{ id: GameAssetSourceTab; label: string }> = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'sprite', label: 'Sprites' },
  { id: 'model', label: 'Models' },
  { id: 'image', label: 'Images' },
  { id: 'audio', label: 'Audio' },
];

const EMPTY: Record<GameAssetSourceTab, string> = {
  terrain: 'No built terrains in your repos. Build one in Media ▸ Terrain.',
  sprite: 'No sprite assets in your repos. Make one in Media ▸ Sprites.',
  model: 'No .glb models in your repos. Export one from Media ▸ Models.',
  image: 'No images in your repos.',
  audio: 'No audio in your repos.',
};

const formatBytes = (bytes: number): string =>
  bytes === 0 ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * Pick media to copy into a game (Phase 107 Theme N): the five source tabs
 * list what the registered repos hold; Terrain and Sprites also take a pack
 * folder from disk. An import is a copy plus one commit, so a row only needs
 * one click.
 */
export function GameAssetPicker({ gameId, onDone }: { gameId: string; onDone: () => void }) {
  const [tab, setTab] = useState<GameAssetSourceTab>('sprite');
  const sources = useAssetSources(tab);
  const importAsset = useImportAsset();

  const run = (source: GameAssetSource): void => {
    importAsset.mutate({ gameId, source }, { onSuccess: (result) => result.ok && onDone() });
  };

  const pickPack = async (): Promise<void> => {
    const folder = await bridge()?.repos.pickDirectory();
    if (folder) run({ packPath: folder });
  };

  const repos = sources.data?.repos ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-2" data-testid="game-asset-picker">
      <div role="tablist" aria-label="Import from" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded px-2 py-0.5 text-[11px] ${tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-48 min-h-10 overflow-auto" role="tabpanel">
        {sources.isPending ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : repos.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">{EMPTY[tab]}</p>
        ) : (
          repos.map((repo) => (
            <section key={repo.repoPath} aria-label={repo.name} className="mb-2">
              <h4 className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" title={repo.repoPath}>
                {repo.name}
              </h4>
              <ul>
                {repo.items.map((item) => (
                  <li key={item.path}>
                    <button
                      type="button"
                      disabled={importAsset.isPending}
                      aria-label={`Import ${item.label}`}
                      onClick={() => run({ tab, repoPath: repo.repoPath, path: item.path })}
                      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {item.kind === tab ? formatBytes(item.bytes) : item.kind}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {tab === 'terrain' || tab === 'sprite' ? (
        <button
          type="button"
          onClick={() => void pickPack()}
          disabled={importAsset.isPending}
          className="flex items-center gap-2 self-start rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60"
        >
          <LuFolderOpen aria-hidden className="h-3 w-3" />
          Choose a pack folder…
        </button>
      ) : null}
    </div>
  );
}
