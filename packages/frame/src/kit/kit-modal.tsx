import { useEffect, useRef } from 'react';

import type { FrameModalProps } from '../chrome/types';
import { useFocusTrap } from '../lib/use-focus-trap';
import { useEscapeDismiss } from './kit-ui';

const SIZE_CLASSES: Record<NonNullable<FrameModalProps['size']>, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
};

/**
 * The suite kit's modal (report feature, PR B): a window-level scrim and a panel, the focus trapped
 * inside it, Escape and a press on the scrim closing it. Studio's `Modal` also joins a dismissal
 * stack and an occluder count; an extracted app has neither, so this draws over the same tokens
 * with none of that — the same trade `KitPopover` makes.
 */
export function KitModal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  testId,
  initialFocusRef,
  role = 'dialog',
}: FrameModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);
  useEscapeDismiss(open, onClose);
  useEffect(() => {
    if (open && initialFocusRef?.current) initialFocusRef.current.focus();
  }, [open, initialFocusRef]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role={role}
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid={testId}
        className={`w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl outline-none ${SIZE_CLASSES[size]}`}
      >
        {children}
      </div>
    </div>
  );
}
