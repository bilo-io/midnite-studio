import { useEffect, useRef, type RefObject } from 'react';

import { cellAt, clampZoom, lineCells, type View } from '../sims/grid';

export type AutomataCanvasProps = {
  w: number;
  h: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  view: View;
  onView(view: View): void;
  /** Life-like only: pointer strokes toggle cells. `final` is true on pointer-up. */
  editable: boolean;
  onStroke(cells: [number, number][], erase: boolean, final: boolean): void;
};

/**
 * The grid as a pixelated canvas, one pixel per cell. The wheel zooms 1-16x about the pointer, a Shift-drag
 * pans, and a plain drag draws (left button: alive; right button or Alt: dead).
 */
export function AutomataCanvas(p: AutomataCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef(p.view);
  view.current = p.view;
  const onView = useRef(p.onView);
  onView.current = p.onView;
  const drag = useRef<{ kind: 'pan' | 'draw'; erase: boolean; last: [number, number] | null; x: number; y: number } | null>(null);

  // A native, non-passive wheel listener: React's `onWheel` cannot preventDefault, and the page must not scroll.
  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      const zoom = clampZoom(v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const k = zoom / v.zoom;
      onView.current({ zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const cell = (e: React.PointerEvent): [number, number] | null => {
    const c = p.canvasRef.current;
    return c === null ? null : cellAt(e.clientX, e.clientY, c.getBoundingClientRect(), p.w, p.h);
  };

  return (
    <div
      ref={host}
      role="img"
      aria-label="Cellular automaton"
      className="relative h-full min-h-64 flex-1 overflow-hidden bg-black/40"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (e.shiftKey) {
          drag.current = { kind: 'pan', erase: false, last: null, x: e.clientX, y: e.clientY };
          return;
        }
        if (!p.editable) return;
        const erase = e.button === 2 || e.altKey;
        const c = cell(e);
        drag.current = { kind: 'draw', erase, last: c, x: e.clientX, y: e.clientY };
        if (c !== null) p.onStroke([c], erase, false);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d === null) return;
        if (d.kind === 'pan') {
          onView.current({ ...view.current, x: view.current.x + e.clientX - d.x, y: view.current.y + e.clientY - d.y });
          d.x = e.clientX;
          d.y = e.clientY;
          return;
        }
        const c = cell(e);
        if (c === null) return;
        p.onStroke(d.last === null ? [c] : lineCells(d.last, c), d.erase, false);
        d.last = c;
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.kind === 'draw') p.onStroke([], d.erase, true);
      }}
    >
      <canvas
        ref={p.canvasRef}
        width={p.w}
        height={p.h}
        data-testid="automata-canvas"
        className="absolute left-1/2 top-1/2"
        style={{
          width: p.w * p.view.zoom,
          height: p.h * p.view.zoom,
          imageRendering: 'pixelated',
          transform: `translate(calc(-50% + ${p.view.x}px), calc(-50% + ${p.view.y}px))`,
        }}
      />
      <span className="pointer-events-none absolute bottom-1 right-2 text-xs tabular-nums text-muted-foreground">{p.view.zoom.toFixed(1)}×</span>
    </div>
  );
}
