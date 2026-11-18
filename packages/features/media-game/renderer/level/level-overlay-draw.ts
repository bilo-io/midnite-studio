import type { GameEntitySnapshot, OverlayShape } from '@midnite/studio-shared';

import type { PlanPoint } from './level-edit-model';
import type { GhostLink } from './live/live-model';
import { footprintCorners } from './level-plan';
import { PLAN_COLOURS, themeColour } from './level-plan-draw';
import type { View } from './level-view';

/**
 * What the editor draws over the level besides the objects (Phase 140 Themes E, F and G): collider and trigger
 * shapes, the kit's nav-mesh, and the running game's live ghosts. Everything is in object coordinates (pixels);
 * `toMap` carries a point into the space being drawn (the identity for a plan, the diamond layout for isometric).
 */
export type CanvasExtras = {
  colliders: readonly OverlayShape[];
  triggers: readonly OverlayShape[];
  /** Spawn zones with the label each shows (`traffic ×1.5`). */
  spawners: ReadonlyArray<{ shape: OverlayShape; label: string }>;
  /** The nav-mesh's polygons in object coordinates. */
  nav: ReadonlyArray<readonly PlanPoint[]>;
  ghosts: ReadonlyArray<{ ghost: GameEntitySnapshot; at: PlanPoint }>;
  links: readonly GhostLink[];
};

export const NO_EXTRAS: CanvasExtras = { colliders: [], triggers: [], spawners: [], nav: [], ghosts: [], links: [] };

export const hasExtras = (x: CanvasExtras | undefined): x is CanvasExtras => !!x && (x.colliders.length > 0 || x.triggers.length > 0 || x.spawners.length > 0 || x.nav.length > 0 || x.ghosts.length > 0);

type Mapper = (p: PlanPoint) => PlanPoint;
const IDENTITY: Mapper = (p) => p;

/** Collider tint (the app's warning amber) and trigger tint (the note blue), nav-mesh green: tokens, never literals. */
export const overlayColours = () => ({
  collider: themeColour('health-warn', '#f59e0b'),
  trigger: themeColour('callout-note', '#3b82f6'),
  nav: themeColour('callout-tip', '#22c55e'),
  /** A spawn zone: its plan colour, a lime no other object type uses. */
  spawner: PLAN_COLOURS.spawner!,
  ghost: themeColour('primary', '#6366f1'),
  text: themeColour('foreground', '#e5e7eb'),
});

/** Shapes as a 30% fill with a 1 px stroke. `cellPath` outlines one tile cell (2D maps); a plan has none and skips cells. */
export function drawOverlayShapes(
  ctx: CanvasRenderingContext2D,
  input: { shapes: readonly OverlayShape[]; colour: string; view: View; toMap?: Mapper; cellPath?: (col: number, row: number) => void; fill?: number },
): void {
  const { shapes, colour, view } = input;
  if (shapes.length === 0) return;
  const toMap = input.toMap ?? IDENTITY;
  const px = 1 / view.zoom;
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = px;
  ctx.setLineDash([]);
  for (const s of shapes) {
    ctx.globalAlpha = input.fill ?? 0.3;
    if (s.kind === 'cell') {
      if (!input.cellPath) continue;
      input.cellPath(s.col, s.row);
      ctx.fill();
      ctx.globalAlpha = 1;
      // A one-way tile reads as dashed: the player can pass up through it.
      if (s.oneWay) ctx.setLineDash([3 * px, 2 * px]);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (s.kind === 'rect') {
      const corners = footprintCorners({ x: s.x, y: s.y, width: s.width, height: s.height, rotation: s.rotation })?.map(toMap);
      if (!corners) continue;
      ctx.beginPath();
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      continue;
    }
    const c = toMap({ x: s.x, y: s.y });
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A spawn zone's fill: zones are often kilometres wide and overlap, so they tint the ground instead of covering it. */
export const SPAWNER_FILL = 0.08;

/** Spawn zones as a light tint, each with its `spawns ×density` label inside its first corner (a zone is often far wider than the view, so its centre is rarely on screen). */
export function drawSpawners(ctx: CanvasRenderingContext2D, input: { spawners: CanvasExtras['spawners']; colour: string; view: View; text: string; toMap?: Mapper }): void {
  if (input.spawners.length === 0) return;
  const toMap = input.toMap ?? IDENTITY;
  drawOverlayShapes(ctx, { shapes: input.spawners.map((s) => s.shape), colour: input.colour, view: input.view, toMap, fill: SPAWNER_FILL });
  const px = 1 / input.view.zoom;
  ctx.font = `${11 * px}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = input.text;
  for (const { shape, label } of input.spawners) {
    if (shape.kind === 'cell') continue;
    const corners = shape.kind === 'rect' ? footprintCorners({ x: shape.x, y: shape.y, width: shape.width, height: shape.height, rotation: shape.rotation })?.map(toMap) : [toMap({ x: shape.x, y: shape.y })];
    if (!corners?.length) continue;
    ctx.fillText(label, corners[0]!.x + 4 * px, corners[0]!.y + 4 * px);
  }
  ctx.textBaseline = 'alphabetic';
}

/** The nav-mesh's polygons: a 1 px outline over a 15% fill. */
export function drawNav(ctx: CanvasRenderingContext2D, input: { polygons: ReadonlyArray<readonly PlanPoint[]>; colour: string; view: View; toMap?: Mapper }): void {
  const toMap = input.toMap ?? IDENTITY;
  ctx.strokeStyle = input.colour;
  ctx.fillStyle = input.colour;
  ctx.lineWidth = 1 / input.view.zoom;
  ctx.setLineDash([]);
  for (const poly of input.polygons) {
    if (poly.length < 2) continue;
    ctx.beginPath();
    poly.map(toMap).forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
}

/** The ghost's label letter: the first character of its type. */
export const ghostInitial = (ghost: Pick<GameEntitySnapshot, 'type'>): string => (ghost.type.charAt(0) || '?').toUpperCase();

/**
 * Live ghosts (Theme E): a hollow circle in the primary colour at 70% alpha with the type's initial, and a thin dashed
 * connector from the authored position to the live one so drift is visible. A dead entity is drawn at 30%.
 */
export function drawGhosts(ctx: CanvasRenderingContext2D, input: { ghosts: CanvasExtras['ghosts']; links: readonly GhostLink[]; view: View; colour: string; toMap?: Mapper }): void {
  const toMap = input.toMap ?? IDENTITY;
  const px = 1 / input.view.zoom;
  ctx.strokeStyle = input.colour;
  ctx.fillStyle = input.colour;
  ctx.lineWidth = px;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([4 * px, 3 * px]);
  for (const l of input.links) {
    const a = toMap(l.from), b = toMap(l.to);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5 * px;
  ctx.font = `${10 * px}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { ghost, at } of input.ghosts) {
    const c = toMap(at);
    ctx.globalAlpha = ghost.alive ? 0.7 : 0.3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 8 * px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(ghostInitial(ghost), c.x, c.y);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

/** Draw every enabled layer, bottom to top: nav, colliders, triggers, spawners, ghosts. */
export function drawExtras(ctx: CanvasRenderingContext2D, input: { extras: CanvasExtras; view: View; text?: string; toMap?: Mapper; cellPath?: (col: number, row: number) => void }): void {
  const { extras, view } = input;
  const colours = overlayColours();
  const base = { view, ...(input.toMap ? { toMap: input.toMap } : {}) };
  if (extras.nav.length) drawNav(ctx, { ...base, polygons: extras.nav, colour: colours.nav });
  const cell = input.cellPath ? { cellPath: input.cellPath } : {};
  drawOverlayShapes(ctx, { ...base, ...cell, shapes: extras.colliders, colour: colours.collider });
  drawOverlayShapes(ctx, { ...base, ...cell, shapes: extras.triggers, colour: colours.trigger });
  drawSpawners(ctx, { ...base, spawners: extras.spawners, colour: colours.spawner, text: input.text ?? colours.text });
  if (extras.ghosts.length) drawGhosts(ctx, { ...base, ghosts: extras.ghosts, links: extras.links, colour: colours.ghost });
}

/** The scatter brush's circle (Phase 139 Theme H) at `at` (object coordinates), `radius` in the same units. */
export function drawBrush(
  ctx: CanvasRenderingContext2D,
  { at, radius, view, outline, toMap }: { at: PlanPoint; radius: number; view: View; outline: string; toMap?: (p: PlanPoint) => PlanPoint },
): void {
  const c = toMap ? toMap(at) : at;
  ctx.save();
  ctx.lineWidth = 1.5 / view.zoom;
  ctx.strokeStyle = outline;
  ctx.fillStyle = 'rgba(99,102,241,0.12)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
