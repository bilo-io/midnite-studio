/**
 * Plain geometry the graph layout shares with any renderer. Structurally identical to the frame's
 * `Rect` / `Viewport` (`packages/frame/src/graph/workflow-*.ts`), declared here so this package
 * takes no dependency on the frame — a frame value satisfies these, and the reverse.
 */
export type Rect = { x: number; y: number; width: number; height: number };

export type Viewport = { x: number; y: number; scale: number };

/** Whether two rects overlap (touching edges do not count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
