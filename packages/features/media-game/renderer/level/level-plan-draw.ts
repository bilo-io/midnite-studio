import type { GameLevelTerrain } from '@midnite/studio-shared';

import type { EditLevel, EditSelection, ObjectRef, PlanPoint, PlanRect } from './level-edit-model';
import { footprintCorners, gridLines, pathPoints, planBounds, terrainRect, yawTipPoint } from './level-plan';
import { selectionBounds } from './level-selection';
import type { View } from './level-view';

/** What the plan view draws besides the level: the terrain's extent and the path being drawn. */
export type PlanOverlay = {
  terrain: GameLevelTerrain | null;
  terrainImage: HTMLImageElement | null;
  /** The path being drawn (points in map pixels), with the pointer's current position as its rubber-band end. */
  draft: readonly PlanPoint[];
  cursor: PlanPoint | null;
  /** The volume rectangle being dragged. */
  volume: { from: PlanPoint; to: PlanPoint } | null;
};

/** Every selected object's outline (Phase 137 Theme C): the 3D view's amber, so one colour means "selected" in both views. */
export const SELECTED_COLOUR = '#f5a524';

/** `rect`'s four corners, mapped into the space being drawn (the identity for a plan; isometric maps bend the rectangle). */
function rectPath(ctx: CanvasRenderingContext2D, rect: PlanRect, toMap: (p: PlanPoint) => PlanPoint): void {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map(toMap);
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
}

/**
 * What a multi-selection adds on top of the objects: a dashed 1 px bounds box around two or more selected objects, and
 * the marquee being dragged (a dashed `outline` rectangle with a 10% fill). Rectangles are in object coordinates;
 * `toMap` carries them into the drawn space.
 */
export function drawSelectionExtras(
  ctx: CanvasRenderingContext2D,
  input: { level: EditLevel; view: View; selected: readonly ObjectRef[]; marquee: PlanRect | null; outline: string; toMap?: (p: PlanPoint) => PlanPoint },
): void {
  const { level, view, selected, marquee, outline } = input;
  const toMap = input.toMap ?? ((p: PlanPoint) => p);
  const px = 1 / view.zoom;
  const bounds = selected.length >= 2 ? selectionBounds(level, selected) : null;
  if (bounds) {
    ctx.strokeStyle = SELECTED_COLOUR;
    ctx.lineWidth = px;
    ctx.setLineDash([5 * px, 3 * px]);
    rectPath(ctx, bounds, toMap);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (marquee) {
    ctx.strokeStyle = outline;
    ctx.fillStyle = outline;
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 3 * px]);
    rectPath(ctx, marquee, toMap);
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export const PLAN_COLOURS: Record<string, string> = { spawn: '#22c55e', exit: '#3b82f6', prop: '#f59e0b', enemy: '#ef4444', pickup: '#eab308', light: '#fde047', checkpoint: '#14b8a6', trigger: '#a855f7', npc: '#06b6d4', path: '#ec4899' };
const NEUTRAL = '#e5e7eb';
const typeOf = (o: { type?: string; class?: string }): string => o.type || o.class || '';

/**
 * Draw a 3D level in plan view (Phase 132 Theme E): the metre grid (1 m lines, every tenth bold), the map's frame,
 * the terrain as an outline over its drape image when the pack has one, then every object: footprints as rotated
 * rectangles, points as markers, paths as polylines, each with a yaw tick. The caller has set the view transform.
 */
export function drawPlan(
  ctx: CanvasRenderingContext2D,
  input: { level: EditLevel; view: View; selection: EditSelection; selected?: readonly ObjectRef[]; marquee?: PlanRect | null; overlay: PlanOverlay; outline: string; text: string },
): void {
  const { level, view, selection, overlay, outline, text } = input;
  const selected = input.selected ?? (selection ? [selection] : []);
  const chosenKeys = new Set(selected.map((r) => `${r.layerId}:${r.objectId}`));
  const px = 1 / view.zoom;
  const mapW = level.width * level.tilewidth, mapH = level.height * level.tileheight;
  const bounds = planBounds(level, overlay.terrain);

  if (overlay.terrain) {
    const r = terrainRect(level, overlay.terrain);
    if (overlay.terrainImage?.complete && overlay.terrainImage.naturalWidth > 0) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(overlay.terrainImage, r.x, r.y, r.width, r.height);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5 * px;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.setLineDash([]);
    ctx.fillStyle = text;
    ctx.font = `${12 * px}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`terrain: ${overlay.terrain.name}`, r.x + 4 * px, r.y + 14 * px);
  }

  const grid = gridLines(level, view.zoom, 6, bounds);
  for (const bold of [false, true]) {
    ctx.strokeStyle = bold ? 'rgba(128,128,128,0.55)' : 'rgba(128,128,128,0.2)';
    ctx.lineWidth = (bold ? 1.25 : 1) * px;
    ctx.beginPath();
    for (const g of grid.x) {
      if (g.bold !== bold) continue;
      ctx.moveTo(g.at, bounds.minY);
      ctx.lineTo(g.at, bounds.maxY);
    }
    for (const g of grid.z) {
      if (g.bold !== bold) continue;
      ctx.moveTo(bounds.minX, g.at);
      ctx.lineTo(bounds.maxX, g.at);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(128,128,128,0.7)';
  ctx.lineWidth = 1.5 * px;
  ctx.strokeRect(0, 0, mapW, mapH);

  ctx.font = `${11 * px}px sans-serif`;
  ctx.textAlign = 'center';
  const markerR = 5 * px;
  for (const layer of level.layers) {
    if (layer.type !== 'objectgroup' || layer.visible === false) continue;
    for (const o of layer.objects ?? []) {
      const colour = PLAN_COLOURS[typeOf(o)] ?? NEUTRAL;
      const corners = footprintCorners(o);
      const path = pathPoints(o);
      const chosen = chosenKeys.has(`${layer.id}:${o.id}`);
      const primary = selection !== null && selection.layerId === layer.id && selection.objectId === o.id;
      ctx.strokeStyle = colour;
      ctx.fillStyle = `${colour}44`;
      ctx.lineWidth = (primary ? 2.5 : 1.5) * px;
      if (corners) {
        ctx.beginPath();
        corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (path.length > 1) {
        ctx.beginPath();
        path.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
        ctx.stroke();
        for (const c of path) ctx.fillRect(c.x - 2 * px, c.y - 2 * px, 4 * px, 4 * px);
      } else {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(o.x, o.y, markerR, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!path.length || corners) {
        const tick = yawTipPoint(o, corners ? Math.max(markerR * 2, Math.min(o.width ?? 0, o.height ?? 0) / 2) : markerR * 2.4);
        ctx.strokeStyle = chosen ? outline : colour;
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(tick.from.x, tick.from.y);
        ctx.lineTo(tick.to.x, tick.to.y);
        ctx.stroke();
      }
      if (chosen) {
        // One amber outline per selected object, the primary a pixel heavier: the footprint, the path, or a ring round a marker.
        ctx.strokeStyle = SELECTED_COLOUR;
        ctx.lineWidth = (primary ? 3 : 2) * px;
        ctx.beginPath();
        if (corners) {
          corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
          ctx.closePath();
        } else if (path.length > 1) path.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
        else ctx.arc(o.x, o.y, markerR + 4 * px, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = text;
      ctx.fillText(o.name, o.x, o.y + markerR + 12 * px);
    }
  }

  drawSelectionExtras(ctx, { level, view, selected, marquee: input.marquee ?? null, outline });
  ctx.setLineDash([]);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5 * px;
  if (overlay.volume) {
    const { from, to } = overlay.volume;
    ctx.strokeRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  }
  if (overlay.draft.length > 0) {
    ctx.setLineDash([5 * px, 4 * px]);
    ctx.beginPath();
    overlay.draft.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (overlay.cursor) ctx.lineTo(overlay.cursor.x, overlay.cursor.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of overlay.draft) ctx.fillRect(p.x - 2.5 * px, p.y - 2.5 * px, 5 * px, 5 * px);
  }
}
