import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { CaptureRegionFrame, CaptureRegionRect } from '@midnite/studio-shared';

/**
 * The region picker (Phase 113 Theme K): the frozen frame main grabbed, shown scaled inside the app
 * window, and a rectangle the user drags over it. Only the rectangle — as fractions of the frame — goes
 * back to main, which cuts it from the full-size frame it kept. Escape or Cancel drops the frame and
 * nothing is saved.
 *
 * A transparent overlay across the live desktop is a later slice (`NO_DESKTOP_OVERLAY` in main).
 */

/** Below this (as a fraction of either side) a drag is a click, not a region. */
export const MIN_REGION_FRACTION = 0.005;

type Box = { left: number; top: number; width: number; height: number };

/** The fractional rectangle two pointer positions span inside `box`, clamped to it; null when too small. */
export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: Box,
): CaptureRegionRect | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const ax = clamp((a.x - box.left) / box.width);
  const ay = clamp((a.y - box.top) / box.height);
  const bx = clamp((b.x - box.left) / box.width);
  const by = clamp((b.y - box.top) / box.height);
  const rect = {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
  if (rect.width < MIN_REGION_FRACTION || rect.height < MIN_REGION_FRACTION) return null;
  return rect;
}

export function RegionPicker({
  frame,
  onCapture,
  onCancel,
}: {
  frame: CaptureRegionFrame;
  onCapture: (rect: CaptureRegionRect) => void;
  onCancel: () => void;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<CaptureRegionRect | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter' && rect) onCapture(rect);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onCapture, rect]);

  const box = (): Box => {
    const r = imageRef.current?.getBoundingClientRect();
    return r
      ? { left: r.left, top: r.top, width: r.width, height: r.height }
      : { left: 0, top: 0, width: 0, height: 0 };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setStart({ x: event.clientX, y: event.clientY });
    setRect(null);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (start) setRect(rectFromPoints(start, { x: event.clientX, y: event.clientY }, box()));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (start) setRect(rectFromPoints(start, { x: event.clientX, y: event.clientY }, box()));
    setStart(null);
  };

  const pixels = rect
    ? `${Math.round(rect.width * frame.width)} × ${Math.round(rect.height * frame.height)}`
    : `Drag over ${frame.sourceName} to choose a region`;

  return (
    <section
      aria-label="Choose a region"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      data-testid="capture-region-picker"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted-foreground" aria-live="polite">
          {pixels}
        </span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={() => onCapture({ x: 0, y: 0, width: 1, height: 1 })}>
          Whole screen
        </button>
        <button type="button" disabled={!rect} onClick={() => rect && onCapture(rect)}>
          Capture region
        </button>
      </div>
      <div
        className="relative cursor-crosshair touch-none select-none overflow-hidden rounded border border-border"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="capture-region-surface"
      >
        <img
          ref={imageRef}
          src={frame.preview}
          alt={`Frozen frame of ${frame.sourceName}`}
          draggable={false}
          className="block w-full"
        />
        {rect ? (
          <div
            aria-hidden
            className="pointer-events-none absolute border-2 border-primary bg-primary/10"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)',
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
