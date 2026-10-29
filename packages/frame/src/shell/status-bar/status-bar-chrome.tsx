import { createContext, useContext, type ComponentType, type ReactElement, type ReactNode } from 'react';

import { SimplePopover } from '../../knowledge/simple-popover';
import type { KnowledgePopoverProps } from '../../knowledge/knowledge-host';

/**
 * The two pieces of chrome the status bar host draws with (Phase 123 Theme J):
 * a toggle's tooltip and the overflow `…` popover.
 *
 * Optional, unlike the frame's other ports: an app that installs nothing gets a
 * `title` tooltip and the frame's `SimplePopover`, which is a complete bar.
 * Studio installs its own (`compose/status-bar-chrome.tsx`), whose popover
 * portals into `document.body` — which is what brings a collapsed segment's
 * `.status-label` back inside the overflow panel (see `overflow-popover.tsx`).
 */
export type StatusBarTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactElement<Record<string, unknown>>;
};

export type StatusBarPopoverProps = KnowledgePopoverProps;

export type StatusBarChrome = {
  Tooltip: ComponentType<StatusBarTooltipProps>;
  Popover: ComponentType<StatusBarPopoverProps>;
};

function TitleTooltip({ label, children }: StatusBarTooltipProps) {
  return <span title={typeof label === 'string' ? label : undefined}>{children}</span>;
}

export const DEFAULT_STATUS_BAR_CHROME: StatusBarChrome = { Tooltip: TitleTooltip, Popover: SimplePopover };

const StatusBarChromeContext = createContext<StatusBarChrome>(DEFAULT_STATUS_BAR_CHROME);

export function StatusBarChromeProvider({ chrome, children }: { chrome: StatusBarChrome; children: ReactNode }) {
  return <StatusBarChromeContext.Provider value={chrome}>{children}</StatusBarChromeContext.Provider>;
}

export function useStatusBarChrome(): StatusBarChrome {
  return useContext(StatusBarChromeContext);
}
