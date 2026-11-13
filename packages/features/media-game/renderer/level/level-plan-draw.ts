import type { GameLevelTerrain } from '@midnite/studio-shared';

import type { EditLevel, EditSelection, PlanPoint } from './level-edit-model';
import { footprintCorners, gridLines, pathPoints, terrainRect, yawTipPoint } from './level-plan';
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
  input: { level: EditLevel; view: View; selection: EditSelection; overlay: PlanOverlay; outline: string; text: string },
): void {
  const { level, view, selection, overlay, outline, text } = input;
  const px = 1 / view.zoom;
  const mapW = level.width * level.tilewidth, mapH = level.height * level.tileheight;

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

  const grid = gridLines(level, view.zoom);
  for (const bold of [false, true]) {
    ctx.strokeStyle = bold ? 'rgba(128,128,128,0.55)' : 'rgba(128,128,128,0.2)';
    ctx.lineWidth = (bold ? 1.25 : 1) * px;
    ctx.beginPath();
    for (const g of grid.x) {
      if (g.bold !== bold) continue;
      ctx.moveTo(g.at, 0);
      ctx.lineTo(g.at, mapH);
    }
    for (const g of grid.z) {
      if (g.bold !== bold) continue;
      ctx.moveTo(0, g.at);
      ctx.lineTo(mapW, g.at);
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
      const chosen = selection !== null && selection.layerId === layer.id && selection.objectId === o.id;
      ctx.strokeStyle = colour;
      ctx.fillStyle = `${colour}44`;
      ctx.lineWidth = (chosen ? 2.5 : 1.5) * px;
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
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.arc(o.x, o.y, markerR + 4 * px, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = text;
      ctx.fillText(o.name, o.x, o.y + markerR + 12 * px);
    }
  }

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
