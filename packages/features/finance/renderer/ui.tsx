import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';

import {
  useFinanceHost,
  type FinanceEmptyStateProps,
  type FinanceModalProps,
  type FinancePopoverProps,
  type FinanceTooltipProps,
} from './host';

/**
 * The chrome Finance draws, resolved through the installed port on each
 * render (Phase 113 Theme P).
 *
 * The widgets that moved here imported `Modal`, `Popover`, `Tooltip`,
 * `EmptyState` and `IconButton` from the app's `components/`. These wrappers
 * keep those call sites as they were — same names, same props — while the
 * implementation is whichever the composing app installed. The host object is
 * stable, so the component each wrapper resolves to keeps its identity across
 * renders and nothing remounts.
 */

export function Modal(props: FinanceModalProps) {
  const { Modal: Impl } = useFinanceHost();
  return <Impl {...props} />;
}

export function Popover(props: FinancePopoverProps) {
  const { Popover: Impl } = useFinanceHost();
  return <Impl {...props} />;
}

export function Tooltip(props: FinanceTooltipProps) {
  const { Tooltip: Impl } = useFinanceHost();
  return <Impl {...props} />;
}

export function EmptyState(props: FinanceEmptyStateProps) {
  const { EmptyState: Impl } = useFinanceHost();
  return <Impl {...props} />;
}

export function ExternalLink(props: { href?: string | undefined; children?: React.ReactNode; className?: string }) {
  const { ExternalLink: Impl } = useFinanceHost();
  return <Impl {...props} />;
}

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

/**
 * One shimmering bar — `components/skeleton.tsx`'s `Skeleton`, which is a
 * single styled div and so is not worth a port member.
 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div style={style} className={`animate-pulse rounded bg-muted ${className}`} />;
}
