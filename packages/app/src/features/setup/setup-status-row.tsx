import type { CSSProperties, ReactNode } from 'react';
import { LuCircleCheck, LuCircleDashed, LuSquareTerminal } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { Spinner } from '../../components/skeleton';

/**
 * The setup overlay's one status row (Phase 98 Theme D) — every page that
 * checks for a tool draws it the same way: *checking* (a spinner) →
 * *installing* (a spinner and a link to the terminal it is running in) →
 * *ready* (a circle check pulsing green), or *missing* with the page's own
 * install action.
 */
export type SetupRowStatus = 'checking' | 'missing' | 'installing' | 'ready';

/** The row state from a probe: still loading, an install in flight, or the answer. */
export function setupRowStatus({
  loading,
  installing,
  installed,
}: {
  loading: boolean;
  installing: boolean;
  installed: boolean | undefined;
}): SetupRowStatus {
  if (installing) return 'installing';
  if (loading || installed === undefined) return 'checking';
  return installed ? 'ready' : 'missing';
}

export type SetupStatusRowProps = {
  label: string;
  status: SetupRowStatus;
  /** Rendered before the status mark — the toolchain page's checkbox. */
  leading?: ReactNode;
  /** The tool's glyph, drawn in `brandColor` left of its name. */
  icon?: IconComponent;
  brandColor?: string;
  /** A version once detected, or a line of explanation. */
  detail?: ReactNode;
  /** Right-aligned value (a `SetupMeta`: version or path), before the status actions. */
  meta?: ReactNode;
  /** What *missing* offers — the page's install button. */
  action?: ReactNode;
  /** *Installing* only: brings the terminal running it forward. Omitted for an install main does itself. */
  onRevealTerminal?: () => void;
};

export function SetupStatusRow({
  label,
  status,
  leading,
  icon: Icon,
  brandColor,
  detail,
  meta,
  action,
  onRevealTerminal,
}: SetupStatusRowProps) {
  const iconStyle: CSSProperties | undefined = brandColor ? { color: brandColor } : undefined;
  return (
    <div
      data-testid="setup-status-row"
      data-status={status}
      className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
    >
      {leading}
      <StatusMark status={status} />
      {Icon ? <Icon aria-hidden className="h-4 w-4 shrink-0" style={iconStyle} /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{label}</span>
        {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
      </div>
      {meta}
      {status === 'installing' ? (
        onRevealTerminal ? (
          <button
            type="button"
            onClick={onRevealTerminal}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            <LuSquareTerminal aria-hidden className="h-3.5 w-3.5" />
            Running in terminal
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Installing…</span>
        )
      ) : null}
      {status === 'missing' ? action : null}
    </div>
  );
}

function StatusMark({ status }: { status: SetupRowStatus }) {
  if (status === 'ready') {
    // `.setup-ready-check` (styles.css): the green glow pulse, gated on window
    // focus and removed under reduced motion.
    return (
      <span
        role="img"
        aria-label="Ready"
        className="setup-ready-check flex shrink-0 rounded-full text-green-500"
      >
        <LuCircleCheck aria-hidden className="h-5 w-5" />
      </span>
    );
  }
  if (status === 'missing') {
    return (
      <span role="img" aria-label="Not installed" className="flex shrink-0 text-muted-foreground">
        <LuCircleDashed aria-hidden className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <Spinner label={status === 'installing' ? 'Installing' : 'Checking'} />
    </span>
  );
}
