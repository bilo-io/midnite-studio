import type { GameSummary } from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/**
 * The Game feature's host port (Phase 113 Theme S) — what Games needs from the app that composes it,
 * beyond the frame and the media kit.
 *
 * Games is a repo-less tab (a game is its own git repo under the games location), and most of it is
 * plain: the runner stage, its toolbar, the wizard, assets, export. What is not plain is Studio's:
 * the agent roster and AI composer behind "create and iterate" (Theme M), the Timeline a game's history
 * shows in, and the popover/occluder stack that hides the native game view when a menu opens over it.
 * Each is a seam, optional, with a plain default (or no control at all). Studio's adapter is
 * `packages/app/src/compose/media-game-host.tsx`. A tab rendered without a provider works with defaults.
 */

/** Props of the toolbar popovers (juice, play-tests). A subset of Studio's own `Popover`. */
export type GamePopoverProps = {
  /** Rendered inside the button the popover owns. */
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Accessible name for the trigger button. */
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

/**
 * Create and iterate (Theme M): agent CLIs and Ollama write the game in passes. It needs the app's agent
 * roster, model providers and AI composer, so it is the app's to supply; absent, the create form has no
 * first prompt and a selected game shows its details and assets without the agent panel.
 */
export type GameAgentUi = {
  /** Subscribes to run progress (a hook, called once while the tab is open). */
  useEvents: () => void;
  /** Engine picker, Ollama warning and passes slider, under the create form's first prompt. */
  EngineFields: ComponentType<{ disabled?: boolean }>;
  /** A hook: starts an agent run on a game with the engine and passes currently picked; answers whether it started. */
  useStartRun: () => (gameId: string, prompt: string) => Promise<boolean>;
  /** The right column for a selected game: prompt, engine, Run/Cancel and the edit thread; `children` render above the thread. */
  IteratePanel: ComponentType<{ game: GameSummary; children?: ReactNode }>;
};

export type GameHost = {
  /** Opens the game's repo in the app's git history. Absent → no "Open in Timeline". */
  openInTimeline?: (game: GameSummary) => void | Promise<void>;
  /** The native folder picker, for "export as a static folder". Absent → that format is not offered. */
  pickDirectory?: () => Promise<string | null>;
  /** A hook returning the app's transient notice (`danger` for a warning). Absent → the frame's toast store. */
  useNotify?: () => (message: string, options?: { danger?: boolean }) => void;
  /** A hook: whether something is covering the stage, so the native game view must hide. Absent → the feature's own count of its open popovers. */
  useOccluded?: () => boolean;
  /** The app's popover — Studio's counts as an occluder in its dismiss stack. Absent → a plain one. */
  Popover?: ComponentType<GamePopoverProps>;
  agent?: GameAgentUi;
};

const GameHostContext = createContext<GameHost>({});

export function GameHostProvider({ host, children }: { host: GameHost; children: ReactNode }) {
  return <GameHostContext.Provider value={host}>{children}</GameHostContext.Provider>;
}

/** The installed host, or an empty one outside a provider. */
export function useGameHost(): GameHost {
  return useContext(GameHostContext);
}
