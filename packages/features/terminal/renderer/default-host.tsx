import { LuBot } from 'react-icons/lu';
import { create } from 'zustand';

import { SimplePopover, bridge, type IconComponent } from '@midnite/studio-frame';
import type { SuiteAppId } from '@midnite/studio-shared';

import type { TerminalAgentAvatarProps, TerminalHost, TerminalPanelPrefs, TerminalTooltipProps } from './host';
import { DEFAULT_KEEP_RECENT_SESSIONS, DEFAULT_SESSION_DISPOSE_AFTER_MS } from './session-mount-policy';
import { DEFAULT_TERMINAL_FONT_SIZE, DEFAULT_TERMINAL_LINE_HEIGHT, type TerminalFontSettings } from './terminal-font';

/**
 * The terminal host every suite app but Studio composes (Phase 123 Theme E).
 *
 * Lives beside the port rather than in the frame, where the phase doc first
 * placed it: the frame may not import a feature, so it could not name the
 * port's type, and an untyped twin there would drift.
 *
 * No repositories, the default layout held in memory for the window's life,
 * xterm's built-in palette, links to the system browser, and plain chrome —
 * a title attribute for a tooltip, the frame's `SimplePopover` for the +
 * picker. Studio's adapter (`packages/app/src/compose/terminal-host.tsx`)
 * replaces every one of these with its own.
 */
export const DEFAULT_TERMINAL_LIST_WIDTH = { width: 176, min: 120, max: 560 } as const;

const DEFAULT_FONT: TerminalFontSettings = {
  fontFamily: '',
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  lineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
};

type DefaultPanelState = TerminalPanelPrefs & { listWidth: number };

function DefaultTooltip({ label, children }: TerminalTooltipProps) {
  return <span title={typeof label === 'string' ? label : undefined}>{children}</span>;
}

function DefaultAgentAvatar({ agent }: TerminalAgentAvatarProps) {
  return <LuBot aria-hidden className="size-3.5 shrink-0" style={agent?.accent ? { color: agent.accent } : undefined} />;
}

const defaultAgentIcon: IconComponent = LuBot;

export type DefaultTerminalHostOptions = {
  /** Hides the panel — the app shell's own toggle. */
  close?: () => void;
};

export function createDefaultTerminalHost(appId: SuiteAppId, options: DefaultTerminalHostOptions = {}): TerminalHost {
  const usePanel = create<DefaultPanelState>(() => ({
    maximized: false,
    side: 'left',
    listOpen: true,
    dock: 'bottom',
    keepRecent: DEFAULT_KEEP_RECENT_SESSIONS,
    disposeAfterMs: DEFAULT_SESSION_DISPOSE_AFTER_MS,
    listWidth: DEFAULT_TERMINAL_LIST_WIDTH.width,
  }));
  const set = usePanel.setState;

  return {
    appId,
    showAllAppsByDefault: appId === 'studio',
    usePanelPrefs: () => {
      const s = usePanel();
      return {
        maximized: s.maximized,
        side: s.side,
        listOpen: s.listOpen,
        dock: s.dock,
        keepRecent: s.keepRecent,
        disposeAfterMs: s.disposeAfterMs,
      };
    },
    useListWidth: () => {
      const width = usePanel((s) => s.listWidth);
      return {
        width,
        setWidth: (listWidth: number) => set({ listWidth }),
        initial: DEFAULT_TERMINAL_LIST_WIDTH.width,
        min: DEFAULT_TERMINAL_LIST_WIDTH.min,
        max: DEFAULT_TERMINAL_LIST_WIDTH.max,
      };
    },
    useFont: () => DEFAULT_FONT,
    getFont: () => DEFAULT_FONT,
    actions: {
      toggleList: () => set((s) => ({ listOpen: !s.listOpen })),
      toggleDock: () => set((s) => ({ dock: s.dock === 'bottom' ? 'right' : 'bottom' })),
      toggleMaximized: () => set((s) => ({ maximized: !s.maximized })),
      // The app's shell owns whether the panel is open; without a hook into
      // it, the × restores the panel to its resting size.
      close: options.close ?? (() => set({ maximized: false })),
      setSidebarSide: (side) => set({ side }),
    },
    useRepos: () => undefined,
    terminalTheme: () => undefined,
    subscribeTheme: () => () => {},
    openLink: (url) => {
      void bridge()?.shell.openExternal({ url });
    },
    focusIsInOpenMenu: () => false,
    resolveAgentIcon: () => defaultAgentIcon,
    Tooltip: DefaultTooltip,
    Popover: SimplePopover,
    AgentAvatar: DefaultAgentAvatar,
    usePopoutHeaderActions: () => null,
    usePopoutHeaderLeading: () => null,
  };
}
