import { LuGamepad2 } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { GameTab } from './game-tab';

/**
 * Media ▸ Games' renderer half (Phase 113 Theme S). It never imports media-core: the layout, export
 * toolbar and open-request plumbing come through the frame's `useMediaKit()`, which the app's
 * `MediaShell` installs, and what differs per app — the agent roster behind create-and-iterate, the
 * Timeline, the popover/occluder stack — comes through {@link GameHost}.
 */
export { mediaGameManifest, type MediaGameManifest } from '../manifest';
export {
  GameHostProvider,
  useGameHost,
  type GameAgentUi,
  type GameHost,
  type GamePopoverProps,
} from './host';
export { GameTab } from './game-tab';
export { GamePopoutPane } from './game-popout-pane';
export { GameRunnerHost, letterbox, boundsFromRect, type GameResolution } from './game-runner-host';
export { GameCreatePanel, perspectivesFor } from './game-create-panel';
export { GameDetailPanel } from './game-detail-panel';
export { GameExportBar } from './game-export-bar';
export { assetsChangedLabel, GameAssetsBadge, GameAssetsPanel } from './game-assets-panel';
export { GameConsoleDrawer } from './game-console-drawer';
export { GameRunnerToolbar } from './game-runner-toolbar';
export { GameJuiceMenu, useApplyStoredJuice } from './game-juice-menu';
export { deriveWizard, initialWizardState, wizardReducer, type WizardState } from './game-wizard-model';
export { PlaytestsMenu } from './playtests-menu';
export { GameWizardBody, GameWizardNav } from './game-wizard';
export { isLive, useGameRunStore, type GameRunInfo } from './game-run-store';
export { useGameJuiceStore } from './game-juice-store';
export {
  undoableCommit,
  useGameAgentEvents,
  useGameAgentStore,
  type GameAgentRun,
  type GameEngineChoice,
  type GameThreadEntry,
} from './game-agent-store';
export {
  GAME_KEYS,
  useAssetSources,
  useCreateGame,
  useGameAssets,
  useGameEvents,
  useGamePlaytests,
  useGames,
  useGamesSettings,
  useImportAsset,
  usePopOutGame,
  useReimportAssets,
  useRunGame,
  useRunPlaytests,
  useSetGamesSettings,
  useStopGame,
} from './use-games';

/** The Games tab, for an app's `MediaShell` registry. */
export const mediaGameTab = {
  id: 'game',
  label: 'Games',
  icon: LuGamepad2,
  Component: GameTab,
} as const satisfies MediaTabDescriptor;
