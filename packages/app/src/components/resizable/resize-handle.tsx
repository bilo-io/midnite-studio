import type { Resizable } from './use-resizable';

/**
 * The draggable rule between two panes.
 *
 * A 1px rule with a 5px hit area, not a 5px rule: a visible splitter thick
 * enough to hit comfortably reads as a piece of UI in its own right and eats
 * space in every layout it appears in. The extra width is negative margin, so
 * the handle overlaps its neighbours instead of displacing them.
 */
export function ResizeHandle({
  resizable,
  axis,
  label,
  className = '',
}: {
  resizable: Resizable;
  axis: 'x' | 'y';
  /** Accessible name, e.g. "Resize repositories sidebar". */
  label: string;
  className?: string;
}) {
  const vertical = axis === 'x';

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      title={`${label} — drag, or double-click to reset`}
      {...resizable.handleProps}
      className={`group relative z-10 shrink-0 touch-none transition-colors focus-visible:outline-none ${
        vertical
          ? '-mx-[2px] w-[5px] cursor-col-resize'
          : '-my-[2px] h-[5px] cursor-row-resize'
      } ${className}`}
    >
      {/*
        The rule itself, centred in the hit area. Painted on a child rather
        than as the parent's background so the 5px grab target stays invisible
        while the 1px line is what the user sees.
      */}
      <span
        aria-hidden
        className={`pointer-events-none absolute bg-border transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary ${
          resizable.dragging ? '!bg-primary' : ''
        } ${vertical ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2'}`}
      />
    </div>
  );
}
