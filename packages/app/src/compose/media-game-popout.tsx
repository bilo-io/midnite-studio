import { GameHostProvider, GamePopoutPane } from '@midnite/studio-feature-media-game/renderer';

import { STUDIO_GAME_HOST } from './media-game-host';

/**
 * The `game` popout window's body (Phase 107 Theme B): one game's runner, hosted alone. It is mounted by
 * `detached-root.tsx`, outside the Media view and so outside `StudioMediaTabHosts` — it needs the Game
 * host for itself (the occluder count that hides the native view behind a menu), and nothing else: the
 * pane reads no media kit. Its own lazy chunk, as it always was.
 */
export default function StudioGamePopout() {
  return (
    <GameHostProvider host={STUDIO_GAME_HOST}>
      <GamePopoutPane />
    </GameHostProvider>
  );
}
