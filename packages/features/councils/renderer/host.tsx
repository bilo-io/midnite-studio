import { createContext, useContext, type ReactNode } from 'react';

/**
 * The councils feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme N).
 *
 * Councils is almost self-contained: it draws on the frame's panel stack,
 * resizable panes and chrome port. What it cannot own is state that sits on the
 * app — how wide the nav and config panes are (persisted by the app's layout
 * store, so a user's widths survive the move), whether the config pane is
 * collapsed, and the occluder count that hides the embedded browser while a
 * dialog is open (a Studio-only concern; an app without a browser installs a
 * no-op).
 */

/** A persisted pane width: the stored size, how to store one, and its bounds. */
export type CouncilsPaneWidth = {
  size: number;
  setSize: (value: number) => void;
  initial: number;
  min: number;
  max: number;
};

export type CouncilsLayout = {
  nav: CouncilsPaneWidth;
  config: CouncilsPaneWidth;
  configCollapsed: boolean;
  setConfigCollapsed: (collapsed: boolean) => void;
};

export type CouncilsHost = {
  /** The persisted pane widths and the config pane's collapsed flag. A hook. */
  useLayout: () => CouncilsLayout;
  /** Registers an open overlay so a live embedded browser view hides beneath it. A hook. */
  useOccluder: (active?: boolean) => void;
};

const CouncilsHostContext = createContext<CouncilsHost | null>(null);

export function CouncilsHostProvider({ host, children }: { host: CouncilsHost; children: ReactNode }) {
  return <CouncilsHostContext.Provider value={host}>{children}</CouncilsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the panes would have no widths. */
export function useCouncilsHost(): CouncilsHost {
  const host = useContext(CouncilsHostContext);
  if (!host) throw new Error('The councils feature must be rendered inside <CouncilsHostProvider>');
  return host;
}
