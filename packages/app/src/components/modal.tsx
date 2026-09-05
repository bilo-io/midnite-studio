import { ReactNode, RefObject, useEffect, useRef } from 'react';

import { useDismiss } from './use-dismiss';
import { useFocusTrap } from './use-focus-trap';
import { motionMs } from './use-reveal';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  variant?: 'plain' | 'gradient';
  align?: 'center' | 'top';
  initialFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
};

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
  full: 'max-w-none w-full h-full',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  variant = 'plain',
  align = 'center',
  initialFocusRef,
  testId,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, open);

  // Escape closes, through the shared dismissal stack (Phase 62) — which is
  // also where this picks up its occluder registration, so a live browser
  // tab's native `WebContentsView` no longer paints over it. Replaces a bare
  // `window.addEventListener('keydown', …)` that neither respected the
  // topmost-surface rule nor counted as an occluder.
  useDismiss(open, onClose, { layer: 'dialog' });

  // Focus restoration: capture previously active element before focus trap moves it.
  const previousActiveRef = useRef<HTMLElement | null>(null);

  if (open && previousActiveRef.current === null && typeof document !== 'undefined') {
    if (!panelRef.current?.contains(document.activeElement)) {
      previousActiveRef.current = document.activeElement as HTMLElement | null;
    }
  }

  useEffect(() => {
    if (!open) {
      if (previousActiveRef.current && typeof previousActiveRef.current.focus === 'function') {
        previousActiveRef.current.focus();
      }
      previousActiveRef.current = null;
      return;
    }

    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    }

    return () => {
      const target = previousActiveRef.current;
      previousActiveRef.current = null;
      if (target && typeof target.focus === 'function') {
        setTimeout(() => {
          target.focus();
        }, 0);
      }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  const alignClass =
    align === 'top'
      ? 'items-start justify-center p-6 pt-[15vh]'
      : 'items-center justify-center p-6';

  const sizeClass = SIZE_CLASSES[size];
  const duration = motionMs();

  return (
    <div
      className={`fixed inset-0 z-dialog flex bg-background/70 ${alignClass}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        transitionDuration: `${duration}ms`,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid={testId}
        className={`w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl outline-none ${sizeClass} ${
          variant === 'gradient' ? 'gradient-frame' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}
