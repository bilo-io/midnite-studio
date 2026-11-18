/** The canvas's view transform and the little geometry the editor's pointer handling needs. Pure. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;

/** `screen = map × zoom + (x, y)`. */
export type View = { zoom: number; x: number; y: number };

/** No floor goes below this: a canvas that has not been laid out yet (zero size) must not produce a zero zoom. */
export const ZOOM_ABSOLUTE_MIN = 0.0005;

export const clampZoom = (zoom: number, min = ZOOM_MIN): number => Math.min(ZOOM_MAX, Math.max(min, ZOOM_ABSOLUTE_MIN, zoom));

/**
 * How far out a view may zoom: {@link ZOOM_MIN}, or less when the content is too big to fit at that zoom, so the
 * whole of it (and as much again around it) can always be reached. A 3D level is 32 map pixels to the metre, so at
 * `ZOOM_MIN` a canvas shows about 100 m; a kilometre-wide level or its terrain needs a far lower floor.
 */
export function zoomFloor(box: { width: number; height: number }, width: number, height: number): number {
  const fit = Math.min(box.width / Math.max(1, width), box.height / Math.max(1, height));
  return Math.min(ZOOM_MIN, fit / 2);
}

export const screenToMap = (view: View, sx: number, sy: number): { x: number; y: number } => ({ x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom });

/** Zoom by `factor`, keeping the map point under the screen point `(sx, sy)` where it is. */
export function zoomAround(view: View, factor: number, sx: number, sy: number, min = ZOOM_MIN): View {
  const zoom = clampZoom(view.zoom * factor, min);
  if (zoom === view.zoom) return view;
  const at = screenToMap(view, sx, sy);
  return { zoom, x: sx - at.x * zoom, y: sy - at.y * zoom };
}

/** A view that centres a `width` × `height` map in a `box`, zoomed to fit (never past 2× on open). */
export function fitView(box: { width: number; height: number }, width: number, height: number, min = ZOOM_MIN): View {
  const zoom = clampZoom(Math.min(2, box.width / Math.max(1, width), box.height / Math.max(1, height)) * 0.95, min);
  return { zoom, x: (box.width - width * zoom) / 2, y: (box.height - height * zoom) / 2 };
}

/** The cells on the line between two cells (Bresenham), so a fast drag leaves no gaps. */
export function lineCells(from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let x = from.x, y = from.y;
  const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 10000; guard += 1) {
    out.push({ x, y });
    if (x === to.x && y === to.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}
