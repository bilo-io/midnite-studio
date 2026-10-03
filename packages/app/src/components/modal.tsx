import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useContentOverlay } from '../store/content-bounds-store';
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
  /**
   * `content` (default) centres in the main content area, clear of the terminal
   * dock; `window` centres in the whole window, for app-level modals.
   */
  scope?: 'content' | 'window';
  /**
   * Render inside this element instead of at window level: the backdrop covers
   * only it and the dialog centres in it. The element must be positioned. Takes
   * precedence over `scope`. Falsy falls back to `scope`.
   */
  container?: HTMLElement | null;
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
  scope = 'content',
  container,
}: ModalProps) {
  const content = useContentOverlay(align, open && scope === 'content' && !container);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trap + focus-on-open + restore-on-close, all in one hook (Phase 68 Theme
  // A, already on `main`). `Modal` used to carry a second, hand-rolled
  // restoration effect here — a `previousActiveRef` captured during render
  // plus a `setTimeout(() => target.focus(), 0)` in its cleanup — written
  // against the phase doc's (pre-Phase-68) claim that `useFocusTrap`
  // "deliberately does not restore." It now does, and the second mechanism
  // didn't just duplicate the first, it raced it: React StrictMode's dev-only
  // mount→cleanup→mount dance ran that `setTimeout` during the *simulated*
  // cleanup of the initial mount, so it fired for real a tick later and
  // silently stole focus back to whatever was focused before the modal
  // opened — landing on `browser-launcher`'s trigger button instead of the
  // radiogroup `initialFocusRef`/the focus-follows-selection effect had
  // already placed it on, which broke every keyboard interaction with the
  // dialog in a real (dev-server, StrictMode) run despite every unit test
  // passing (RTL does not double-invoke effects). Removed rather than
  // guarded — `useFocusTrap` already carries the "don't fight a deliberate
  // move" check a second restorer would have to reinvent.
  useFocusTrap(panelRef, open);

  // Escape closes, through the shared dismissal stack (Phase 62) — which is
  // also where this picks up its occluder registration, so a live browser
  // tab's native `WebContentsView` no longer paints over it. Replaces a bare
  // `window.addEventListener('keydown', …)` that neither respected the
  // topmost-surface rule nor counted as an occluder.
  useDismiss(open, onClose, { layer: 'dialog' });

  // `initialFocusRef` wins over `useFocusTrap`'s own default (the panel
  // container) because this effect is declared after it and runs later in
  // the same commit — see the test asserting exactly that ordering.
  useEffect(() => {
    if (open && initialFocusRef?.current) {
      initialFocusRef.current.focus();
    }
  }, [open, initialFocusRef]);

  if (!open) return null;

  const scoped = !container && scope === 'content' && content.overlayStyle !== undefined;
  const alignClass = scoped
    ? align === 'top'
      ? 'items-start justify-center'
      : 'items-center justify-center'
    : align === 'top'
      ? 'items-start justify-center p-6 pt-[15vh]'
      : 'items-center justify-center p-6';

  const sizeClass = SIZE_CLASSES[size];
  const duration = motionMs();

  const overlay = (
    <div
      className={`${container ? 'absolute' : 'fixed'} inset-0 z-dialog flex bg-background/70 ${alignClass}`}
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
        ...(scoped ? content.overlayStyle : null),
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid={testId}
        style={scoped && content.panelMaxHeight !== undefined ? { maxHeight: content.panelMaxHeight } : undefined}
        className={`w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl outline-none ${sizeClass} ${
          variant === 'gradient' ? 'gradient-frame' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
  return container ? createPortal(overlay, container) : overlay;
}
