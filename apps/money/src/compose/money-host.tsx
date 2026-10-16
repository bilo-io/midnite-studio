import { cloneElement, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type {
  FinanceEmptyStateProps,
  FinanceHost,
  FinanceModalProps,
  FinancePopoverProps,
  FinanceTooltipProps,
} from '@midnite/studio-feature-finance/renderer';

/**
 * Money's side of the finance feature's host port (Phase 113 Theme P) — plain implementations.
 * Studio's own are wired to its dismiss stack, content-area clamping and link policy; Money has one
 * window and no embedded browser, so each member is the smallest thing that does the job.
 */

function Modal({ open, onClose, title, children, size = 'md', testId, role = 'dialog' }: FinanceModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-[420px]', md: 'max-w-[640px]', lg: 'max-w-[900px]', full: 'max-w-none w-full h-full' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        role={role}
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`max-h-full w-full overflow-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xl ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title ? <h2 className="mb-3 text-sm font-semibold">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Popover({
  trigger,
  children,
  side = 'top',
  align = 'end',
  label,
  title,
  disabled = false,
  panelClassName = '',
  triggerClassName,
  open: controlled,
  onOpenChange,
  testId,
}: FinancePopoverProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const set = (next: boolean): void => {
    setInner(next);
    onOpenChange?.(next);
  };
  const edge = align === 'start' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0';
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={title}
        disabled={disabled}
        className={triggerClassName}
        onClick={() => set(!open)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          data-testid={testId}
          className={`absolute z-40 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg ${edge} ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} ${panelClassName}`}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

/** The native tooltip: a `title` on the one trigger, which is all a plain window needs. */
function Tooltip({ label, children }: FinanceTooltipProps) {
  return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
}

function EmptyState({ icon: Icon, title, body, bodySize = 'sm', action }: FinanceEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {Icon ? <Icon className="size-6 text-muted-foreground" /> : null}
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className={`${bodySize === 'xs' ? 'text-xs' : 'text-sm'} max-w-sm text-muted-foreground`}>{body}</p> : null}
      {action}
    </div>
  );
}

/** Money has no embedded browser: every link goes to the system browser (main's window-open handler). */
function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener');
}

export const MONEY_FINANCE_HOST = {
  Modal,
  Popover,
  Tooltip,
  EmptyState,
  ExternalLink: ({ href, children, className = '' }) =>
    href ? (
      <a
        href={href}
        title={href}
        className={`text-primary underline underline-offset-2 ${className}`}
        onClick={(event) => {
          event.preventDefault();
          openExternal(href);
        }}
      >
        {children}
      </a>
    ) : (
      <span className={className}>{children}</span>
    ),
  openLinkFromEvent: (url) => openExternal(url),
  openLink: (url) => openExternal(url),
  useTypewriter: (text) => text,
} satisfies FinanceHost;
