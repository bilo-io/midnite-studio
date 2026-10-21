import { useEffect, useRef, useState } from 'react';

import type { KnowledgePopoverProps } from './knowledge-host';

/**
 * A click-toggled panel anchored under its trigger - the frame's own answer for an app that has no
 * `Popover` of its own to give the Knowledge host (Studio's portals and clamps; a small app's single
 * overflow menu needs neither). Closes on an outside press and on Escape; controlled or uncontrolled.
 */
export function SimplePopover({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  label,
  open: controlled,
  onOpenChange,
  testId,
  panelClassName = '',
  triggerClassName,
}: KnowledgePopoverProps) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const rootRef = useRef<HTMLDivElement>(null);
  const set = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setInner(false);
        onOpenChange?.(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setInner(false);
      onOpenChange?.(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const alignClass = align === 'end' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  const sideClass = side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => set(!open)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="presentation"
          className={`absolute z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md ${sideClass} ${alignClass} ${panelClassName}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
