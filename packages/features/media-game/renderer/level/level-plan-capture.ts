/**
 * The plan view as a picture for `game_level_view` (Phase 138 Theme H): `drawPlan` over an `OffscreenCanvas`, framed
 * on the whole map or on a rectangle (the selection's bounds), with the same 10% margin `frame` uses.
 */
import { canvasToBase64Png } from './3d/level-capture';
import type { EditLevel, EditSelection, ObjectRef, PlanRect } from './level-edit-model';
import { drawPlan, type PlanOverlay } from './level-plan-draw';
import { planBounds } from './level-plan';
import { FRAME_MARGIN } from './level-frame';
import type { View } from './level-view';
import type { GameLevelTerrain } from '@midnite/studio-shared';

export const PLAN_CAPTURE_BACKGROUND = '#1d1f24';
const OUTLINE = '#9ca3af';
const TEXT = '#e5e7eb';

/** The source rectangle (map pixels) a picture shows: `rect` plus a margin on every side, else the whole map's bounds plus the same. */
export function planSourceRect(level: EditLevel, terrain: Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'> | null, rect: PlanRect | null): PlanRect {
  const base = rect ?? ((b) => ({ x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY }))(planBounds(level, terrain));
  const mx = base.width * FRAME_MARGIN, my = base.height * FRAME_MARGIN;
  return { x: base.x - mx, y: base.y - my, width: base.width + 2 * mx, height: base.height + 2 * my };
}

export type PlanCaptureInput = {
  level: EditLevel;
  overlay: PlanOverlay;
  selection: EditSelection;
  selected: readonly ObjectRef[];
  /** Fit this rectangle (the selection bounds) rather than the whole map. */
  rect: PlanRect | null;
  width: number;
  height: number;
};

/** Draw the plan to a PNG (base64). `createCanvas` is injectable so a test can supply a recording context. */
export async function capturePlan(
  input: PlanCaptureInput,
  deps: { createCanvas?: (w: number, h: number) => OffscreenCanvas; encode?: (canvas: OffscreenCanvas) => Promise<string> } = {},
): Promise<string> {
  const canvas = (deps.createCanvas ?? ((w, h) => new OffscreenCanvas(w, h)))(input.width, input.height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('A 2D canvas is not available to draw the plan.');
  const source = planSourceRect(input.level, input.overlay.terrain, input.rect);
  // The fit is not clamped to the editor's zoom range: a picture shows the whole of a very large map.
  const zoom = Math.min(input.width / Math.max(1, source.width), input.height / Math.max(1, source.height));
  const view: View = { zoom, x: input.width / 2 - (source.x + source.width / 2) * zoom, y: input.height / 2 - (source.y + source.height / 2) * zoom };
  ctx.fillStyle = PLAN_CAPTURE_BACKGROUND;
  ctx.fillRect(0, 0, input.width, input.height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.zoom, view.zoom);
  drawPlan(ctx, { level: input.level, view, selection: input.selection, selected: input.selected, overlay: input.overlay, outline: OUTLINE, text: TEXT });
  ctx.restore();
  return (deps.encode ?? canvasToBase64Png)(canvas);
}
