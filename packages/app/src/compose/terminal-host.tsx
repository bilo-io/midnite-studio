import type { ComponentType, ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { FrameChromeProvider } from '@midnite/studio-frame';
import { TerminalHostProvider, type TerminalHost } from '@midnite/studio-feature-terminal/renderer';

import { AgentAvatar } from '../components/agent-avatar';
import { usePopoutHeaderActions, usePopoutHeaderLeading } from '../components/detached-window-frame';
import { resolveAgentIcon } from '../components/icons';
import { Popover } from '../components/popover';
import { Tooltip } from '../components/tooltip';
import { focusIsInOpenMenuTree } from '../components/use-dismissable';
import { usePaletteStore } from '../features/themes/palette-store';
import { resolveTerminalPalette } from '../features/themes/resolve-palette';
import { revealSession } from '../features/terminal/reveal-session';
import { openLinkFromEvent } from '../services/open-in-midnite';
import { useRepos } from '../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';
import { STUDIO_CHROME } from './studio-chrome';

/**
 * Studio's side of the terminal feature's host port (Phase 123 Theme E): the
 * panel's layout and unload settings from `ui-store`, its repositories, the
 * palette, Studio's link router and its own chrome. Nothing about how a
 * session is stored moved — the store and the broker are the feature's.
 */
export const STUDIO_TERMINAL_HOST = {
  appId: 'studio',
  // Studio is the superset: it lists every app's sessions (Decision 1).
  showAllAppsByDefault: true,
  usePanelPrefs: () =>
    useUiStore(
      useShallow((s) => ({
        maximized: s.terminalMaximized,
        side: s.terminalSidebarSide,
        listOpen: s.terminalListOpen,
        dock: s.terminalDock,
        keepRecent: s.terminalKeepRecentSessions,
        disposeAfterMs: s.terminalDisposeAfterMs,
      })),
    ),
  useListWidth: () => {
    const width = useUiStore((s) => s.layout.terminalListWidth);
    const setLayout = useUiStore((s) => s.setLayout);
    return {
      width,
      setWidth: (value: number) => setLayout('terminalListWidth', value),
      initial: DEFAULT_LAYOUT.terminalListWidth,
      ...LAYOUT_BOUNDS.terminalListWidth,
    };
  },
  useFont: () =>
    useUiStore(
      useShallow((s) => ({
        fontFamily: s.terminalFontFamily,
        fontSize: s.terminalFontSize,
        lineHeight: s.terminalLineHeight,
      })),
    ),
  getFont: () => {
    const s = useUiStore.getState();
    return { fontFamily: s.terminalFontFamily, fontSize: s.terminalFontSize, lineHeight: s.terminalLineHeight };
  },
  actions: {
    toggleList: () => useUiStore.getState().toggleTerminalList(),
    toggleDock: () => useUiStore.getState().toggleTerminalDock(),
    toggleMaximized: () => useUiStore.getState().toggleTerminalMaximized(),
    close: () => useUiStore.getState().setTerminalOpen(false),
    setSidebarSide: (side) => useUiStore.getState().setTerminalSidebarSide(side),
    // Same "route to Settings ▸ Agents" the title bar's own picker uses.
    configureAgent: (agentId) => useUiStore.getState().focusAgentInSettings(agentId),
    revealSession: (sessionId) => {
      revealSession(sessionId);
    },
    showSessionCommits: (sessionId, shas) => {
      const ui = useUiStore.getState();
      ui.setGraphSessionFilter(sessionId);
      ui.setGraphShaFilter([...shas]);
      ui.setActiveView('graph');
    },
  },
  useRepos: () => useRepos().data,
  terminalTheme: (mode) => resolveTerminalPalette(mode).terminal,
  subscribeTheme: (listener) => usePaletteStore.subscribe(listener),
  openLink: (url, event) => openLinkFromEvent(url, event, { preferInAppRoute: true }),
  focusIsInOpenMenu: focusIsInOpenMenuTree,
  resolveAgentIcon,
  Tooltip,
  Popover,
  AgentAvatar,
  usePopoutHeaderActions,
  usePopoutHeaderLeading,
} satisfies TerminalHost;

/**
 * Binds a terminal component to Studio's host — and to Studio's chrome, which
 * the panel's `IconButton` and dialogs come through. The old `features/terminal/*`
 * paths re-export their components through this, so every existing render
 * site — the dock, the popout, a Kanban card, a loop tab — keeps working with
 * no provider of its own.
 */
export function withStudioTerminalHost<P extends object>(
  Component: ComponentType<P>,
): ((props: P) => ReactElement) & { displayName?: string } {
  function StudioTerminalHosted(props: P) {
    return (
      <FrameChromeProvider chrome={STUDIO_CHROME}>
        <TerminalHostProvider host={STUDIO_TERMINAL_HOST}>
          <Component {...props} />
        </TerminalHostProvider>
      </FrameChromeProvider>
    );
  }
  StudioTerminalHosted.displayName = `StudioTerminalHosted(${Component.displayName ?? Component.name})`;
  return StudioTerminalHosted;
}
