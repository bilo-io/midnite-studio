import { createContext, useContext, type ComponentType, type MouseEvent, type ReactElement, type ReactNode, type RefObject } from 'react';

import type { IconComponent } from '@midnite/studio-frame';

/**
 * The finance feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme P).
 *
 * Finance draws on a handful of pieces of chrome that each sit on app state:
 * `Modal` and `Popover` count occluders and clamp to the content area,
 * `Tooltip` is portalled and dismissed with the rest, links obey the app's own
 * link policy (embedded browser or system), and the status-bar segment types
 * its price in with the app's title typewriter. Studio implements each in
 * `packages/app/src/compose/finance-host.tsx`; Money implements plain ones in
 * `apps/money/src/compose/money-host.tsx`. The feature declares the seams and
 * calls them through `ui.tsx`, so its widgets read as they always did.
 */

export type FinanceModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  variant?: 'plain' | 'gradient';
  align?: 'center' | 'top';
  initialFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
  scope?: 'content' | 'window';
  container?: HTMLElement | null;
  role?: 'dialog' | 'alertdialog';
};

export type FinancePopoverProps = {
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

export type FinanceTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
};

export type FinanceEmptyStateProps = {
  icon?: IconComponent;
  title: string;
  body?: string;
  bodySize?: 'xs' | 'sm';
  action?: ReactNode;
};

/** The modifiers a link click carries — what the app's link policy reads. */
export type FinanceLinkEvent = Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'button'>;

export type FinanceHost = {
  Modal: ComponentType<FinanceModalProps>;
  Popover: ComponentType<FinancePopoverProps>;
  Tooltip: ComponentType<FinanceTooltipProps>;
  EmptyState: ComponentType<FinanceEmptyStateProps>;
  /** An anchor following the app's link policy. */
  ExternalLink: ComponentType<{ href?: string | undefined; children?: ReactNode; className?: string }>;
  /** Opens a headline: a plain click follows the app's policy, the modifiers override it. */
  openLinkFromEvent: (url: string, event: FinanceLinkEvent) => void;
  /** Opens a link in a chosen place — `in-app` is the embedded browser where the app has one. */
  openLink: (url: string, target: 'in-app' | 'system') => void;
  /** The status-bar segment's typed-in text. A hook; the identity where the app has no typewriter. */
  useTypewriter: (text: string) => string;
};

const FinanceHostContext = createContext<FinanceHost | null>(null);

export function FinanceHostProvider({ host, children }: { host: FinanceHost; children: ReactNode }) {
  return <FinanceHostContext.Provider value={host}>{children}</FinanceHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, a trade modal would never open. */
export function useFinanceHost(): FinanceHost {
  const host = useContext(FinanceHostContext);
  if (!host) throw new Error('The finance feature must be rendered inside <FinanceHostProvider>');
  return host;
}
