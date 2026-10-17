import type { GameSummary } from '@midnite/studio-shared';
import { LuGitBranch } from 'react-icons/lu';

import { MediaPanelBody, MediaPanelLayout } from '@midnite/studio-frame';

import { GameAssetsPanel } from './game-assets-panel';
import { useGameHost } from './host';

/** The right column when a game is selected: what it is, the way into its history, and the agent panel (Theme M). */
export function GameDetailPanel({ game }: { game: GameSummary }) {
  const { openInTimeline, agent } = useGameHost();
  const summary = (
      <div className="flex shrink-0 flex-col gap-3 p-3">
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
        {openInTimeline ? (
        <button
          type="button"
          onClick={() => void openInTimeline(game)}
          className="flex items-center gap-2 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
        >
          <LuGitBranch aria-hidden className="h-3.5 w-3.5" />
          Open in Timeline
        </button>
        ) : null}
        {game.valid ? <GameAssetsPanel game={game} /> : null}
      </div>
  );
  if (!game.valid || !agent) {
    return (
      <MediaPanelLayout data-testid="game-detail">
        <MediaPanelBody>{summary}</MediaPanelBody>
      </MediaPanelLayout>
    );
  }
  return (
    <div className="h-full min-h-0" data-testid="game-detail">
      <agent.IteratePanel game={game}>{summary}</agent.IteratePanel>
    </div>
  );
}
