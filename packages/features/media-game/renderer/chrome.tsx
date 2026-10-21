import { useToastStore, useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';

import { useGameHost, type GamePopoverProps } from './host';

/**
 * The chrome Games draws with (Phase 113 Theme S): the frame's `IconButton` through its chrome port, and
 * the pieces the host may replace — popover, notice, occlusion — each with a plain default.
 */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

/** A transient notice: the host's, else the frame's toast store. */
export function useNotify(): (message: string, options?: { danger?: boolean }) => void {
  const host = useGameHost();
  const fallback = useCallback(
    (message: string, options?: { danger?: boolean }) =>
      useToastStore.getState().addToast({ message, status: options?.danger ? 'error' : 'success' }),
    [],
  );
  return (host.useNotify ?? (() => fallback))();
}

/**
 * How many of the feature's own popovers are open. The game's native view floats above every DOM
 * element, so an open menu would paint underneath it: the runner hides the view while this is non-zero
 * (unless the host answers {@link useGameOccluded} itself — Studio counts its whole dismiss stack).
 */
const useOwnOcclusion = create<{ open: number; add: (delta: 1 | -1) => void }>((set) => ({
  open: 0,
  add: (delta) => set((s) => ({ open: Math.max(0, s.open + delta) })),
}));

/** Whether something covers the game stage and the native view must hide. */
export function useGameOccluded(): boolean {
  const host = useGameHost();
  const own = useOwnOcclusion((s) => s.open > 0);
  const hosted = host.useOccluded?.() ?? false;
  return own || hosted;
}

/** The plain popover: a click-toggled panel beside its trigger, closed by Escape or a click outside. */
function PlainPopover({
  trigger,
  children,
  side = 'top',
  align = 'end',
  label,
  title,
  disabled = false,
  panelClassName = '',
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  testId,
}: GamePopoverProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const add = useOwnOcclusion((s) => s.add);
  useEffect(() => {
    if (!open) return undefined;
    add(1);
    return () => add(-1);
  }, [open, add]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, setOpen]);

  const edge = align === 'start' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0';
  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={title}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-testid={testId}
        onClick={() => setOpen(!open)}
        className={triggerClassName ?? 'inline-flex items-center gap-1 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40'}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={`absolute z-50 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md ${edge} ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} ${panelClassName}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** The app's popover when the host has one, else the plain one. */
export function Popover(props: GamePopoverProps) {
  const Impl = useGameHost().Popover ?? PlainPopover;
  return <Impl {...props} />;
}
