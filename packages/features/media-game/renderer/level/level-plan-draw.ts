import type { GameLevelTerrain, GameLevelTerrainDetail } from '@midnite/studio-shared';

import { objectCentre, type EditLevel, type EditSelection, type LevelObject, type ObjectRef, type PlanPoint, type PlanRect } from './level-edit-model';
import { footprintCorners, gridLines, metresToPlan, pathPoints, planBounds, terrainRect, yawTipPoint } from './level-plan';
import { selectionBounds } from './level-selection';
import type { View } from './level-view';

/** What the plan view draws besides the level: the terrain's extent and the path being drawn. */
export type PlanOverlay = {
  terrain: GameLevelTerrain | null;
  terrainImage: HTMLImageElement | null;
  /** The sharper crop of the drape over `terrain.detail`'s extent, when the level has one. */
  terrainDetailImage?: HTMLImageElement | null;
  /** The drapes of `terrain.packs`, in the same order (a missing one draws as its outline alone). */
  terrainPackImages?: ReadonlyArray<HTMLImageElement | null>;
  /** The path being drawn (points in map pixels), with the pointer's current position as its rubber-band end. */
  draft: readonly PlanPoint[];
  cursor: PlanPoint | null;
  /** The volume rectangle being dragged. */
  volume: { from: PlanPoint; to: PlanPoint } | null;
};

const BUILDING_FILL = 'rgba(148, 163, 184, 0.35)';
const BUILDING_EDGE = 'rgba(203, 213, 225, 0.6)';
const ROAD_COLOUR = 'rgba(241, 245, 249, 0.55)';

/**
 * The detailed part of a terrain: the drape crop over the whole-terrain preview, then building footprints and
 * roads as vectors in world metres, so they stay sharp however far the plan is zoomed in. Roads are drawn at their
 * real width, never thinner than a screen pixel.
 */
export function drawTerrainDetail(ctx: CanvasRenderingContext2D, level: EditLevel, detail: GameLevelTerrainDetail, image: HTMLImageElement | null | undefined, px: number): void {
  if (image?.complete && image.naturalWidth > 0) {
    const r = terrainRect(level, detail);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(image, r.x, r.y, r.width, r.height);
    ctx.globalAlpha = 1;
  }
  const trace = (points: readonly number[], close: boolean) => {
    for (let i = 0; i + 1 < points.length; i += 2) {
      const at = metresToPlan(level, points[i]!, points[i + 1]!);
      if (i === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    }
    if (close) ctx.closePath();
  };
  if (detail.buildings.length > 0) {
    ctx.beginPath();
    for (const polygon of detail.buildings) trace(polygon, true);
    ctx.fillStyle = BUILDING_FILL;
    ctx.fill();
    ctx.strokeStyle = BUILDING_EDGE;
    ctx.lineWidth = px;
    ctx.stroke();
  }
  // One stroke per road width, not per road.
  const byWidth = new Map<number, number[][]>();
  for (const road of detail.roads) {
    const group = byWidth.get(road.width);
    if (group) group.push(road.points);
    else byWidth.set(road.width, [road.points]);
  }
  const scale = metresToPlan(level, 1, 0).x - metresToPlan(level, 0, 0).x;
  ctx.strokeStyle = ROAD_COLOUR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, roads] of byWidth) {
    ctx.beginPath();
    for (const points of roads) trace(points, false);
    ctx.lineWidth = Math.max(px, width * scale);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

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

// --- theme colours on a canvas (Phase 138 Theme F) ------------------------------------

/** `'38 92% 50%'` (a shadcn-style HSL triplet) as `#rrggbb`; `null` when it is not one. */
export function hslTripletToHex(triplet: string): string | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%\s*$/.exec(triplet);
  if (!m) return null;
  const h = (((Number(m[1]) % 360) + 360) % 360) / 360;
  const sat = Math.min(100, Number(m[2])) / 100;
  const l = Math.min(100, Number(m[3])) / 100;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const channel = (t0: number): number => {
    const t = t0 < 0 ? t0 + 1 : t0 > 1 ? t0 - 1 : t0;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(channel(h + 1 / 3))}${hex(channel(h))}${hex(channel(h - 1 / 3))}`;
}

const colourCache = new Map<string, string>();
let colourCacheTheme: string | null = null;

/**
 * A theme token (`'primary'`) as a hex a 2D canvas or `THREE.Color` can use, read from the root element's custom
 * property, cached per theme (a `data-theme` change clears the cache) and falling back to `fallback` when the token
 * is missing (tests, jsdom).
 */
export function themeColour(token: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const theme = document.documentElement.dataset.theme ?? '';
  if (theme !== colourCacheTheme) {
    colourCache.clear();
    colourCacheTheme = theme;
  }
  const cached = colourCache.get(token);
  if (cached) return cached;
  const hex = hslTripletToHex(getComputedStyle(document.documentElement).getPropertyValue(`--${token}`));
  if (!hex) return fallback;
  colourCache.set(token, hex);
  return hex;
}

// --- the agent change pulse ---------------------------------------------------------

/** Objects an agent change set touched, ringed for {@link PULSE_MS}. */
export type PlanHighlight = { ids: readonly number[]; startedAt: number };
export const PULSE_MS = 2400;

/** Whether the user asked for less motion: `data-motion="reduced"`, or the OS setting without `data-motion="full"`. */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  const motion = document.documentElement.dataset.motion;
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The ring at `now`: `null` once the pulse is over; reduced motion is a static, full-strength ring. */
export function pulseFrame(highlight: PlanHighlight, now: number, reduced: boolean): { grow: number; alpha: number } | null {
  const t = (now - highlight.startedAt) / PULSE_MS;
  if (t < 0 || t >= 1) return null;
  if (reduced) return { grow: 0, alpha: 1 };
  return { grow: (t * 3) % 1, alpha: 1 - t };
}

/**
 * Ring every highlighted object: an expanding, fading circle (a static 2 px ring under reduced motion). `toMap`
 * carries the object's coordinate into the drawn space. Draws nothing once the pulse is over.
 */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  input: { level: EditLevel; view: View; highlight: PlanHighlight; now: number; reduced: boolean; toMap?: (p: PlanPoint) => PlanPoint },
): void {
  const frame = pulseFrame(input.highlight, input.now, input.reduced);
  if (!frame) return;
  const px = 1 / input.view.zoom;
  const toMap = input.toMap ?? ((p: PlanPoint) => p);
  const ids = new Set(input.highlight.ids);
  ctx.strokeStyle = themeColour('primary', '#6366f1');
  ctx.lineWidth = (input.reduced ? 2 : 3) * px;
  ctx.globalAlpha = frame.alpha;
  for (const layer of input.level.layers) {
    for (const o of layer.objects ?? []) {
      if (!ids.has(o.id)) continue;
      const c = toMap(objectCentre(o as LevelObject));
      const base = Math.max(10 * px, Math.max(o.width ?? 0, o.height ?? 0) / 2 + 4 * px);
      ctx.beginPath();
      ctx.arc(c.x, c.y, base + frame.grow * 18 * px, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
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
  input: { level: EditLevel; view: View; selection: EditSelection; selected?: readonly ObjectRef[]; marquee?: PlanRect | null; hidden?: ReadonlySet<string>; overlay: PlanOverlay; outline: string; text: string; highlight?: PlanHighlight | null; now?: number },
): void {
  const { level, view, selection, overlay, outline, text } = input;
  const selected = input.selected ?? (selection ? [selection] : []);
  const chosenKeys = new Set(selected.map((r) => `${r.layerId}:${r.objectId}`));
  const px = 1 / view.zoom;
  const mapW = level.width * level.tilewidth, mapH = level.height * level.tileheight;
  const bounds = planBounds(level, overlay.terrain);

  if (overlay.terrain) {
    const outlined = (r: { x: number; y: number; width: number; height: number }, name: string): void => {
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      ctx.setLineDash([]);
      ctx.fillStyle = text;
      ctx.font = `${12 * px}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`terrain: ${name}`, r.x + 4 * px, r.y + 14 * px);
    };
    const draped = (image: HTMLImageElement | null | undefined, r: { x: number; y: number; width: number; height: number }): void => {
      if (!image?.complete || image.naturalWidth === 0) return;
      ctx.globalAlpha = 0.45;
      ctx.drawImage(image, r.x, r.y, r.width, r.height);
      ctx.globalAlpha = 1;
    };
    // The packs round the terrain, last first: an earlier one lies over a later one, and the terrain over them all.
    // What a nearer one covers is clipped out, so two translucent drapes never stack.
    const packs = overlay.terrain.packs ?? [];
    const rects = [overlay.terrain, ...packs].map((t) => terrainRect(level, t));
    for (let i = packs.length; i >= 1; i -= 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rects[i]!.x, rects[i]!.y, rects[i]!.width, rects[i]!.height);
      for (let j = 0; j < i; j += 1) ctx.rect(rects[j]!.x, rects[j]!.y, rects[j]!.width, rects[j]!.height);
      ctx.clip('evenodd');
      draped(overlay.terrainPackImages?.[i - 1], rects[i]!);
      ctx.restore();
    }
    const r = rects[0]!;
    draped(overlay.terrainImage, r);
    if (overlay.terrain.detail) drawTerrainDetail(ctx, level, overlay.terrain.detail, overlay.terrainDetailImage, px);
    for (let i = packs.length; i >= 1; i -= 1) outlined(rects[i]!, packs[i - 1]!.name);
    outlined(r, overlay.terrain.name);
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
      // An object hidden in the outliner (Phase 137 Theme H) is editor-only: not drawn, never in the file.
      if (input.hidden?.has(`${layer.id}:${o.id}`)) continue;
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
  if (input.highlight) drawHighlight(ctx, { level, view, highlight: input.highlight, now: input.now ?? Date.now(), reduced: prefersReducedMotion() });
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
