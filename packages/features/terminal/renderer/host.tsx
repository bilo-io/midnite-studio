import { createContext, useContext, useLayoutEffect, type ComponentType, type ReactElement, type ReactNode } from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import type { ActivityStatus, AgentDefinition, AgentProfile, RepoDescriptor, SuiteAppId, TerminalSession } from '@midnite/studio-shared';
import type { ITheme } from '@xterm/xterm';

import type { PrepareProfileLaunch } from './profile-launch';
import type { TerminalFontSettings } from './terminal-font';
import { useTerminalStore } from './terminal-store';

/**
 * The terminal feature's host port (Phase 123 Theme E) — everything the panel
 * needs from the app that composes it, beyond the frame.
 *
 * The panel's own state (sessions, the broker, replay) is the feature's store.
 * What is *not* the feature's is how the panel sits in its window — docked,
 * maximised, the list's side and width, the unload policy — and the handful of
 * app-wide things it reaches out to: the repositories that name a session's
 * path, the palette its xterm wears, where a clicked link goes. Studio keeps
 * all of those in `ui-store`; its adapter is
 * `packages/app/src/compose/terminal-host.tsx`. Any other app takes
 * {@link createDefaultTerminalHost} (`default-host.tsx`): no repositories,
 * the default layout held in memory, links to the system browser.
 *
 * Members named `use…` are hooks — call them at the top of a component.
 */
export type TerminalPanelPrefs = {
  maximized: boolean;
  /** Which side of the panel the session list docks on. */
  side: 'left' | 'right';
  listOpen: boolean;
  /** Where the panel itself docks in its window. */
  dock: 'bottom' | 'right';
  /** The Phase 84 Theme E unload policy (`session-mount-policy.ts`). */
  keepRecent: number;
  disposeAfterMs: number;
};

export type TerminalListWidth = {
  width: number;
  setWidth: (value: number) => void;
  /** What a double-click on the resize handle returns to. */
  initial: number;
  min: number;
  max: number;
};

export type TerminalPanelActions = {
  toggleList: () => void;
  toggleDock: () => void;
  toggleMaximized: () => void;
  /** Hides the panel (the header's ×). */
  close: () => void;
  setSidebarSide: (side: 'left' | 'right') => void;
  /** "Configure" on an unconfigured agent in the + picker. Absent: the row has no configure action. */
  configureAgent?: (agentId: string) => void;
  /**
   * Bring a session into view: open the panel, make it active, show the list.
   * Absent: the feature does the in-panel half (active + list) itself.
   */
  revealSession?: (sessionId: string) => void;
  /** The session row's commit count, clicked: show those commits. Absent: the count is not a button. */
  /** Opens Settings ▸ Permissions (the previous-build notice's link). Absent: the notice has no link. */
  openPermissions?: () => void;
  showSessionCommits?: (sessionId: string, shas: readonly string[]) => void;
};

export type TerminalTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  /** A single focusable element (Studio's tooltip clones it rather than wrapping). */
  children: ReactElement<Record<string, unknown>>;
};

export type TerminalPopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

export type TerminalAgentAvatarProps = {
  agent: (Pick<AgentDefinition, 'id' | 'icon'> & { accent?: string | undefined }) | undefined;
  live: boolean;
  activityStatus: ActivityStatus;
  ollamaBacked?: boolean;
};

export type TerminalLoopMarkProps = {
  /** The session the loop dispatched; carries `loopId` (or, for a row from before it existed, `surface: 'fab'`). */
  session: TerminalSession;
};

export type TerminalHost = {
  /** The app this window belongs to; every session it opens is stamped with it. */
  appId: SuiteAppId;
  /** Whether the session list starts out showing every app's sessions (Studio) or this app's own. */
  showAllAppsByDefault: boolean;
  usePanelPrefs: () => TerminalPanelPrefs;
  useListWidth: () => TerminalListWidth;
  /** Font settings, live — re-applied to every open xterm when they move. */
  useFont: () => TerminalFontSettings;
  /** The same, read once when an xterm is constructed. Not a hook. */
  getFont: () => TerminalFontSettings;
  actions: TerminalPanelActions;
  /** The registered repositories, for naming a session's path. A hook. */
  useRepos: () => readonly RepoDescriptor[] | undefined;
  /** Detected favicon/logo data URL for a registered repository, or `null`. A hook. */
  useRepoLogo?: (repoId: string | undefined) => string | null;
  /** Switch the app's selected repository to match a clicked session. Absent: clicking a row does not switch repos. */
  onSelectRepo?: (target: { repoId?: string; cwd?: string }) => void;
  /**
   * The xterm theme for the resolved light/dark mode, or `undefined` for the
   * feature's built-in fallback. Read on every theme change.
   */
  terminalTheme: (mode: 'light' | 'dark') => ITheme | undefined;
  /** Calls `listener` whenever {@link terminalTheme}'s answer may have changed. Returns an unsubscribe. */
  subscribeTheme: (listener: () => void) => () => void;
  /** A Cmd/Ctrl-clicked link in the output. */
  openLink: (url: string, event: MouseEvent) => void;
  /** True while focus sits in an open menu or popover, which the xterm must not steal it from. */
  focusIsInOpenMenu: () => boolean;
  /** The mark for an agent row (Studio's hand-held marks; a set glyph elsewhere). */
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent;
  Tooltip: ComponentType<TerminalTooltipProps>;
  Popover: ComponentType<TerminalPopoverProps>;
  AgentAvatar: ComponentType<TerminalAgentAvatarProps>;
  /**
   * The loop mark (its icon, in its colour) for a session a loop dispatched —
   * drawn between the agent mark and the name in the "Loops" group. The
   * terminal feature cannot import the loops feature, so the app supplies it.
   * Absent, or `null` for an unknown loop: the row shows no mark.
   */
  LoopMark?: ComponentType<TerminalLoopMarkProps>;
  /**
   * In a popped-out terminal window, the title-bar slots the header portals
   * into; `null` in a docked panel. Hooks.
   */
  usePopoutHeaderActions: () => HTMLDivElement | null;
  usePopoutHeaderLeading: () => HTMLDivElement | null;
  /**
   * The saved custom agents (Phase 154 Theme F), for the `+` menu's "Your agents" section and each
   * session's chrome. A hook. Studio only: absent, there is no section and every session wears its base
   * CLI's look.
   */
  useAgentProfiles?: () => AgentProfile[];
  /**
   * Asks main for a custom agent's typed line and the launch id that binds its private MCP socket.
   * `null` on a failed envelope, which the host has already reported. Studio only.
   */
  prepareProfileLaunch?: PrepareProfileLaunch;
};

const TerminalHostContext = createContext<TerminalHost | null>(null);

export function TerminalHostProvider({ host, children }: { host: TerminalHost; children: ReactNode }) {
  /*
    The store is a module singleton the whole window shares, so the window's
    app id lives there for `openSession` to stamp. A layout effect, so it is in
    place before any child's plain effect (the panel's first-terminal open) runs.
  */
  useLayoutEffect(() => useTerminalStore.getState().setAppId(host.appId), [host.appId]);
  return <TerminalHostContext.Provider value={host}>{children}</TerminalHostContext.Provider>;
}

/**
 * The installed host. Throws without a provider: a terminal rendered outside
 * a composed app is a wiring bug, and a silent default would ship it.
 */
export function useTerminalHost(): TerminalHost {
  const host = useContext(TerminalHostContext);
  if (!host) throw new Error('useTerminalHost must be used inside <TerminalHostProvider>');
  return host;
}
