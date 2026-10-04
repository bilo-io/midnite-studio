import type { GameSummary } from '@midnite/studio-shared';
import { LuGitBranch } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';

/**
 * Opens the game's repo in Timeline: registers it with the repo list if the
 * app somehow lost it, selects it, and switches view. A game is a normal repo,
 * so commits (and, later, agent passes) show up there like any other.
 */
export async function openGameInTimeline(game: GameSummary): Promise<void> {
  const api = bridge();
  if (!api) return;
  const repos = await api.repos.list();
  let repoId = repos.find((repo) => repo.path === game.path)?.id ?? null;
  if (!repoId) {
    const opened = await api.repos.open({ path: game.path });
    if (opened.ok) repoId = opened.repo.id;
  }
  if (!repoId) return;
  const ui = useUiStore.getState();
  ui.selectRepo(repoId);
  ui.setActiveView('graph');
}

/** The right column when a game is selected: what it is, and the way into its history. */
export function GameDetailPanel({ game }: { game: GameSummary }) {
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="game-detail">
      <div>
        <h2 className="truncate text-sm font-semibold" title={game.name}>
          {game.name}
        </h2>
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={game.path}>
          {game.path}
        </p>
      </div>
      {game.valid ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Engine</dt>
          <dd>{game.engine === 'three' ? 'three.js + Rapier' : 'Phaser'}</dd>
          <dt className="text-muted-foreground">Dimension</dt>
          <dd>{game.dimension?.toUpperCase()}</dd>
          <dt className="text-muted-foreground">Starter</dt>
          <dd>{game.starter}</dd>
          <dt className="text-muted-foreground">Working tree</dt>
          <dd>{game.dirty ? 'Uncommitted changes' : 'Clean'}</dd>
        </dl>
      ) : (
        <p role="alert" className="text-xs text-amber-500">
          midnite-game.json is invalid: {game.issue}
        </p>
      )}
      <button
        type="button"
        onClick={() => void openGameInTimeline(game)}
        className="flex items-center gap-2 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
      >
        <LuGitBranch aria-hidden className="h-3.5 w-3.5" />
        Open in Timeline
      </button>
    </div>
  );
}
