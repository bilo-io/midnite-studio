import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';

import { cellAt, cellOrigin, collisionAt, collisionLayer, mapPixelSize, readTmj, sourceRect, tileOf, type TmjTileLayer } from '@midnite/studio-shared';

import type { GameLevelTerrain } from '@midnite/studio-shared';

import { objectToMapPoint, mapPointToObject, type Cell, type EditLevel, type EditSelection, type LevelObject, type ObjectRef, type PlanPoint, type PlanRect } from './level-edit-model';
import { hitPlan, levelMetresPerTile, pixelsPerMetre, planBounds, planFrameBounds } from './level-plan';
import { isAssetDrag, readDroppedAsset, useDraggedAsset, type AssetDropTarget } from './assets/asset-drag';
import { drawHighlight, drawPlan, drawSelectionExtras, prefersReducedMotion, PULSE_MS, SELECTED_COLOUR, type PlanHighlight, type PlanOverlay } from './level-plan-draw';
import { drawBrush, drawExtras, hasExtras, type CanvasExtras } from './level-overlay-draw';
import { fitView, screenToMap, ZOOM_MIN, zoomAround, zoomFloor, type View } from './level-view';

/**
 * The editor's canvas (Phase 132 Theme D). It draws with Sprites' `map-view.ts` (`tileOf`, `sourceRect`,
 * `cellOrigin`, `collisionAt`) so a level looks here as it does in Media ▸ Sprites, and hit-tests with `cellAt`,
 * isometric maps included. It owns the view (wheel zoom around the pointer 0.25×–8×, Space-drag or middle-drag
 * pan) and reports tool input as {@link CanvasPointer}; what a tool does with it is the editor's business.
 */
export type CanvasPointer = {
  phase: 'down' | 'move' | 'up';
  /** The cell under the pointer, `null` off the map. */
  cell: Cell | null;
  /** The map-space point, as an object coordinate (isometric maps measure objects in tile-height units). */
  object: { x: number; y: number };
  /** The object under the pointer, if any (topmost layer first). */
  hit: NonNullable<EditSelection> | null;
  alt: boolean;
  shift: boolean;
  /** Cmd (macOS) or Ctrl held: the toggle modifier of a multi-selection. */
  mod: boolean;
};

/** Plan view (Theme E): a 3D level drawn from above, with the terrain's extent and what the tools are drawing. */
export type PlanView = { terrain: GameLevelTerrain | null; draft: readonly PlanPoint[]; volume: { from: PlanPoint; to: PlanPoint } | null };

/** The terrain's drape image, redrawing once it arrives. */
function useTerrainImage(preview: string | null | undefined): { image: HTMLImageElement | null; loaded: number } {
  const [loaded, setLoaded] = useState(0);
  const image = useMemo(() => {
    if (!preview) return null;
    const img = new Image();
    img.onload = () => setLoaded((n) => n + 1);
    img.src = preview;
    return img;
  }, [preview]);
  return { image, loaded };
}

export const OBJECT_COLOURS: Record<string, string> = { spawn: '#22c55e', exit: '#3b82f6' };
const NEUTRAL = '#e5e7eb';
const COLLISION_FILL = 'rgba(229, 57, 53, 0.4)';
const HIT_RADIUS_PX = 10;

const typeOf = (o: LevelObject): string => o.type || o.class || '';

/** Tileset images by the `image` string the `.tmj` carries, redrawing once each one arrives. */
export function useTilesetImages(images: ReadonlyArray<{ path: string; dataUrl: string }>): { map: ReadonlyMap<string, HTMLImageElement>; loaded: number } {
  const [loaded, setLoaded] = useState(0);
  const map = useMemo(() => {
    const out = new Map<string, HTMLImageElement>();
    for (const { path, dataUrl } of images) {
      const img = new Image();
      img.onload = () => setLoaded((n) => n + 1);
      img.src = dataUrl;
      out.set(path, img);
    }
    return out;
  }, [images]);
  return { map, loaded };
}

/** The topmost object within reach of a map-space point, over the visible object layers. */
export function hitObject(level: EditLevel, mapPoint: { x: number; y: number }, zoom: number, skip?: (ref: ObjectRef) => boolean): NonNullable<EditSelection> | null {
  const reach = HIT_RADIUS_PX / zoom;
  for (let i = level.layers.length - 1; i >= 0; i -= 1) {
    const layer = level.layers[i]!;
    if (layer.type !== 'objectgroup' || layer.visible === false || typeof layer.id !== 'number') continue;
    const objects = layer.objects ?? [];
    for (let j = objects.length - 1; j >= 0; j -= 1) {
      const o = objects[j]!;
      if (skip?.({ layerId: layer.id, objectId: o.id })) continue;
      const at = objectToMapPoint(level, o.x, o.y);
      const w = level.orientation === 'isometric' ? 0 : (o.width ?? 0), h = level.orientation === 'isometric' ? 0 : (o.height ?? 0);
      // A point is its marker; a rectangle (Tiled's y is its top edge) is its box, plus the marker's reach.
      const near = Math.hypot(mapPoint.x - at.x, mapPoint.y - at.y) <= reach;
      const inside = w > 0 && h > 0 && mapPoint.x >= at.x && mapPoint.x <= at.x + w && mapPoint.y >= at.y && mapPoint.y <= at.y + h;
      if (near || inside) return { layerId: layer.id, objectId: o.id };
    }
  }
  return null;
}

function themeColour(el: Element | null, name: string, fallback: string): string {
  if (!el || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : fallback;
}

export function LevelCanvas({
  level,
  images,
  selection,
  selected,
  highlight,
  marquee,
  hidden,
  locked,
  centreOn,
  onContextMenu,
  hoverEnabled,
  preview,
  onPointer,
  onKeyDown,
  label,
  plan,
  extras,
  viewOut,
  viewIn,
  assetDrop,
  brush,
}: {
  level: EditLevel;
  images: ReadonlyArray<{ path: string; dataUrl: string }>;
  /** The primary selection (drawn heavier). */
  selection: EditSelection;
  /** Every selected object (Phase 137 Theme C); defaults to the primary alone. */
  selected?: readonly ObjectRef[];
  /** Objects an agent change set touched, ringed for {@link PULSE_MS} (Phase 138 Theme F). */
  highlight?: PlanHighlight | null;
  /** The marquee being dragged, in object coordinates. */
  marquee?: PlanRect | null;
  /** Objects hidden in the outliner (refKeys): not drawn, not hit. Editor-only (Phase 137 Theme H). */
  hidden?: ReadonlySet<string>;
  /** Objects locked in the outliner (refKeys): drawn, not hit. */
  locked?: ReadonlySet<string>;
  /** Recentre the view on a map-pixel point at the current zoom; `n` makes each request distinct. */
  centreOn?: { x: number; y: number; n: number } | null;
  /** Right-click (Phase 137 Theme I): what is under the pointer, in object coordinates, and where it is on screen. */
  onContextMenu?: (event: { clientX: number; clientY: number; hit: ObjectRef | null; object: PlanPoint }) => void;
  hoverEnabled: boolean;
  /** Cells outlined while a rectangle is being dragged. */
  preview: readonly Cell[] | null;
  onPointer: (event: CanvasPointer) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  label: string;
  /** Set for a 3D level: the canvas draws the plan view instead of tiles. */
  plan?: PlanView;
  /** Collider, trigger, nav-mesh and live-ghost overlays (Phase 140 Themes E to G), in object coordinates. */
  extras?: CanvasExtras;
  /** Kept current with the view and canvas size, so the 3D switch starts its camera where the plan is (Phase 136 E). */
  viewOut?: MutableRefObject<{ view: View; size: { width: number; height: number } } | null>;
  /** A view to jump to: where the 3D view's camera ended when the switch eased back to the plan. */
  viewIn?: View | null;
  /** Phase 139 Theme D: take an asset dragged from the browser; a ghost shows where it would land. */
  assetDrop?: AssetDropTarget;
  /** Phase 139 Theme H: the scatter brush; a circle of `radius` (object units) follows the pointer. */
  brush?: { radius: number } | undefined;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tmj = useMemo(() => readTmj(level), [level]);
  const { map: tilesetImages, loaded } = useTilesetImages(images);
  const [size, setSize] = useState({ width: 640, height: 400 });
  /** What the first fit frames: the map, or for a plan its real bounds (a level may sit at negative pixels). */
  /** How far out this level may zoom: a big 3D level or its terrain lowers the floor so all of it can be reached. */
  const floorFor = (box: { width: number; height: number }): number => {
    if (!plan) return ZOOM_MIN;
    const all = planBounds(level, plan.terrain);
    return zoomFloor(box, all.maxX - all.minX, all.maxY - all.minY);
  };
  const frame = (box: { width: number; height: number }): View => {
    if (!plan) return fitView(box, mapPixelSize(level).width, mapPixelSize(level).height);
    const b = planFrameBounds(level, plan.terrain);
    const v = fitView(box, b.maxX - b.minX, b.maxY - b.minY, floorFor(box));
    return { ...v, x: v.x - b.minX * v.zoom, y: v.y - b.minY * v.zoom };
  };
  const [view, setView] = useState<View>(() => frame({ width: 640, height: 400 }));
  const [hover, setHover] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<PlanPoint | null>(null);
  const [brushAt, setBrushAt] = useState<PlanPoint | null>(null);
  const { image: terrainImage, loaded: terrainLoaded } = useTerrainImage(plan?.terrain?.preview);
  /** Bumped while a pulse is running, so the draw effect repaints it. */
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    if (!highlight) return undefined;
    const left = highlight.startedAt + PULSE_MS - Date.now();
    if (left <= 0) return undefined;
    // Reduced motion: a static ring, repainted once more when it is over; no animation frames.
    if (prefersReducedMotion()) {
      const timer = setTimeout(() => setPulseTick((n) => n + 1), left + 20);
      return () => clearTimeout(timer);
    }
    let raf = 0;
    const step = () => {
      setPulseTick((n) => n + 1);
      if (Date.now() < highlight.startedAt + PULSE_MS) raf = requestAnimationFrame(step);
      else setPulseTick((n) => n + 1);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [highlight]);
  const space = useRef(false);
  /** The drop ghost's centre, in canvas pixels (already snapped), while an asset is dragged over. */
  const [ghost, setGhost] = useState<{ sx: number; sy: number } | null>(null);
  const dragged = useDraggedAsset();
  const ghostSize = plan ? Math.max(12, pixelsPerMetre(level).x * view.zoom) : 24;
  const pan = useRef<{ sx: number; sy: number; view: View } | null>(null);
  const tool = useRef(false);
  const fitted = useRef(false);
  useEffect(() => {
    if (viewOut) viewOut.current = { view, size };
  }, [viewOut, view, size]);
  useEffect(() => {
    if (!centreOn) return;
    fitted.current = true;
    setView((v) => ({ ...v, x: size.width / 2 - centreOn.x * v.zoom, y: size.height / 2 - centreOn.y * v.zoom }));
    // Only a new request recentres; a resize after it keeps the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreOn?.n]);
  useEffect(() => {
    if (!viewIn) return;
    fitted.current = true;
    setView(viewIn);
  }, [viewIn]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const width = Math.max(1, Math.round(el.clientWidth)), height = Math.max(1, Math.round(el.clientHeight));
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
      // The first real measurement fits the map; later resizes keep the user's view.
      if (!fitted.current) {
        fitted.current = true;
        setView(frame({ width, height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Mounted once per scene (the editor keys this component by scene); `level` is only read for the first fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !tmj) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = view.zoom < 1;
    ctx.setTransform(view.zoom, 0, 0, view.zoom, view.x, view.y);
    const outline = themeColour(el, '--primary', '#6366f1');
    const text = themeColour(el, '--foreground', NEUTRAL);
    const cellPath = (x: number, y: number) => {
      const o = cellOrigin(tmj, x, y);
      ctx.beginPath();
      if (tmj.orientation === 'isometric') {
        ctx.moveTo(o.x + tmj.tilewidth / 2, o.y);
        ctx.lineTo(o.x + tmj.tilewidth, o.y + tmj.tileheight / 2);
        ctx.lineTo(o.x + tmj.tilewidth / 2, o.y + tmj.tileheight);
        ctx.lineTo(o.x, o.y + tmj.tileheight / 2);
        ctx.closePath();
      } else ctx.rect(o.x, o.y, tmj.tilewidth, tmj.tileheight);
    };
    if (plan) {
      const overlay: PlanOverlay = { terrain: plan.terrain, terrainImage, draft: plan.draft, cursor: plan.draft.length > 0 ? cursor : null, volume: plan.volume };
      drawPlan(ctx, { level, view, selection, selected, marquee, hidden, overlay, outline, text, highlight });
      if (hasExtras(extras)) drawExtras(ctx, { extras, view });
      if (brush && brushAt) drawBrush(ctx, { at: brushAt, radius: brush.radius, view, outline });
      return;
    }
    const pixel = mapPixelSize(tmj);
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.lineWidth = 1 / view.zoom;
    if (tmj.orientation !== 'isometric') ctx.strokeRect(0, 0, pixel.width, pixel.height);
    const collision = collisionLayer(tmj);
    for (const layer of tmj.layers) {
      if (!layer.visible) continue;
      if (layer.type === 'tilelayer') {
        for (let y = 0; y < tmj.height; y += 1)
          for (let x = 0; x < tmj.width; x += 1) {
            const hit = tileOf(tmj.tilesets, layer.data[y * tmj.width + x] ?? 0);
            const img = hit ? tilesetImages.get(hit.tileset.image) : undefined;
            if (!hit || !img || !img.complete || img.naturalWidth === 0) continue;
            const src = sourceRect(hit.tileset, hit.local);
            const o = cellOrigin(tmj, x, y);
            ctx.drawImage(img, src.x, src.y, src.w, src.h, o.x, o.y + tmj.tileheight - src.h, src.w, src.h);
          }
      }
    }
    // Collision cells get a translucent red overlay whether or not that layer is drawn as tiles.
    if (collision) {
      for (let i = 0; i < collision.data.length; i += 1) {
        if (!collisionAt(tmj, collision as TmjTileLayer, i)) continue;
        ctx.fillStyle = COLLISION_FILL;
        cellPath(i % tmj.width, Math.floor(i / tmj.width));
        ctx.fill();
      }
    }
    // Object layers, typed markers with the name under them.
    ctx.font = `${Math.max(6, tmj.tileheight / 2.5)}px sans-serif`;
    ctx.textAlign = 'center';
    for (const layer of level.layers) {
      if (layer.type !== 'objectgroup' || layer.visible === false) continue;
      for (const o of layer.objects ?? []) {
        if (hidden?.has(`${layer.id}:${o.id}`)) continue;
        const at = objectToMapPoint(level, o.x, o.y);
        const r = Math.max(3, tmj.tileheight / 4);
        const w = level.orientation === 'isometric' ? 0 : (o.width ?? 0), h = level.orientation === 'isometric' ? 0 : (o.height ?? 0);
        const colour = OBJECT_COLOURS[typeOf(o)] ?? NEUTRAL;
        if (w > 0 && h > 0) {
          ctx.fillStyle = `${colour}55`;
          ctx.fillRect(at.x, at.y, w, h);
          ctx.strokeStyle = colour;
          ctx.strokeRect(at.x, at.y, w, h);
        }
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
        ctx.fill();
        const chosen = selected ? selected.some((r) => r.layerId === layer.id && r.objectId === o.id) : selection?.layerId === layer.id && selection?.objectId === o.id;
        if (chosen) {
          ctx.strokeStyle = SELECTED_COLOUR;
          ctx.lineWidth = (selection && selection.layerId === layer.id && selection.objectId === o.id ? 3 : 2) / view.zoom;
          ctx.beginPath();
          ctx.arc(at.x, at.y, r + 3 / view.zoom, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1 / view.zoom;
        }
        ctx.fillStyle = text;
        ctx.fillText(o.name, at.x, at.y + r + tmj.tileheight / 2.5);
      }
    }
    if (hasExtras(extras)) drawExtras(ctx, { extras, view, toMap: (p) => objectToMapPoint(level, p.x, p.y), cellPath });
    drawSelectionExtras(ctx, { level, view, selected: selected ?? [], marquee: marquee ?? null, outline, toMap: (p) => objectToMapPoint(level, p.x, p.y) });
    if (highlight) drawHighlight(ctx, { level, view, highlight, now: Date.now(), reduced: prefersReducedMotion(), toMap: (p) => objectToMapPoint(level, p.x, p.y) });
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5 / view.zoom;
    if (hover && hoverEnabled) {
      cellPath(hover.x, hover.y);
      ctx.stroke();
    }
    for (const c of preview ?? []) {
      cellPath(c.x, c.y);
      ctx.stroke();
    }
    if (brush && brushAt) drawBrush(ctx, { at: brushAt, radius: brush.radius, view, outline, toMap: (p) => objectToMapPoint(level, p.x, p.y) });
  }, [tmj, level, tilesetImages, loaded, view, size, hover, hoverEnabled, preview, selection, selected, marquee, hidden, plan, terrainImage, terrainLoaded, cursor, highlight, pulseTick, extras, brush, brushAt]);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current?.getBoundingClientRect();
    return { sx: e.clientX - (rect?.left ?? 0), sy: e.clientY - (rect?.top ?? 0) };
  };

  const unpickable = (ref: ObjectRef) => {
    const key = `${ref.layerId}:${ref.objectId}`;
    return !!hidden?.has(key) || !!locked?.has(key);
  };

  const emit = (e: ReactPointerEvent<HTMLCanvasElement>, phase: CanvasPointer['phase']) => {
    const { sx, sy } = local(e);
    const p = screenToMap(view, sx, sy);
    const cell = cellAt(level, p.x, p.y);
    if (phase === 'move') {
      setHover(cell);
      if (plan) setCursor({ x: p.x, y: p.y });
      if (brush) setBrushAt(plan ? { x: p.x, y: p.y } : mapPointToObject(level, p.x, p.y));
    }
    onPointer({
      phase,
      cell,
      object: plan ? { x: p.x, y: p.y } : mapPointToObject(level, p.x, p.y),
      hit: plan ? hitPlan(level, p, view.zoom, unpickable) : hitObject(level, p, view.zoom, unpickable),
      alt: e.altKey,
      shift: e.shiftKey,
      mod: e.metaKey || e.ctrlKey,
    });
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    wrap.current?.focus();
    const { sx, sy } = local(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (e.button === 1 || space.current) {
      pan.current = { sx, sy, view };
      return;
    }
    if (e.button !== 0) return;
    tool.current = true;
    emit(e, 'down');
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e);
    const p = pan.current;
    if (p) {
      setView({ ...p.view, x: p.view.x + sx - p.sx, y: p.view.y + sy - p.sy });
      return;
    }
    emit(e, 'move');
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pan.current = null;
    if (tool.current) {
      tool.current = false;
      emit(e, 'up');
    }
  };

  return (
    <div
      ref={wrap}
      tabIndex={0}
      role="application"
      aria-label={label}
      data-testid="level-canvas-wrap"
      className="relative h-full min-h-0 w-full overflow-hidden bg-muted outline-none focus-visible:ring-1 focus-visible:ring-primary"
      onKeyDown={(e) => {
        if (e.key === ' ') space.current = true;
        onKeyDown(e);
      }}
      onKeyUp={(e) => {
        if (e.key === ' ') space.current = false;
      }}
      onBlur={() => {
        space.current = false;
      }}
      onDragOver={(e) => {
        if (!assetDrop || !isAssetDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const { sx, sy } = local(e);
        const p = screenToMap(view, sx, sy);
        const at = assetDrop.snap(plan ? { x: p.x, y: p.y } : mapPointToObject(level, p.x, p.y), e.altKey);
        setGhost(plan ? { sx: at.x * view.zoom + view.x, sy: at.y * view.zoom + view.y } : { sx, sy });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGhost(null);
      }}
      onDrop={(e) => {
        if (!assetDrop || !isAssetDrag(e.dataTransfer)) return;
        e.preventDefault();
        setGhost(null);
        const payload = readDroppedAsset(e.dataTransfer);
        if (!payload) return;
        const { sx, sy } = local(e);
        const p = screenToMap(view, sx, sy);
        assetDrop.onDrop(payload, assetDrop.snap(plan ? { x: p.x, y: p.y } : mapPointToObject(level, p.x, p.y), e.altKey));
      }}
    >
      <canvas
        ref={canvas}
        width={size.width}
        height={size.height}
        data-testid="level-canvas"
        className="block h-full w-full touch-none"
        style={{ imageRendering: view.zoom >= 1 ? 'pixelated' : 'auto', cursor: hoverEnabled ? 'crosshair' : 'default' }}
        onWheel={(e) => {
          const { sx, sy } = local(e);
          setView((v) => zoomAround(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy, floorFor(size)));
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          setHover(null);
          setBrushAt(null);
        }}
        onAuxClick={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!onContextMenu) return;
          const { sx, sy } = local(e);
          const p = screenToMap(view, sx, sy);
          onContextMenu({
            clientX: e.clientX,
            clientY: e.clientY,
            hit: plan ? hitPlan(level, p, view.zoom, (r) => !!hidden?.has(`${r.layerId}:${r.objectId}`)) : hitObject(level, p, view.zoom, (r) => !!hidden?.has(`${r.layerId}:${r.objectId}`)),
            object: plan ? { x: p.x, y: p.y } : mapPointToObject(level, p.x, p.y),
          });
        }}
      />
      {ghost && dragged ? (
        <div
          aria-hidden
          data-testid="level-asset-ghost"
          className="pointer-events-none absolute rounded border border-dashed border-primary bg-primary/30"
          style={{ left: ghost.sx - ghostSize / 2, top: ghost.sy - ghostSize / 2, width: ghostSize, height: ghostSize }}
        />
      ) : null}
      <span className="pointer-events-none absolute bottom-1 right-2 text-[11px] tabular-nums text-muted-foreground" data-testid="level-zoom">
        {plan ? `${level.width * levelMetresPerTile(level)} × ${level.height * levelMetresPerTile(level)} m` : `${level.width} × ${level.height}`} · {view.zoom < 0.095 ? (view.zoom * 100).toFixed(1) : Math.round(view.zoom * 100)}%
      </span>
    </div>
  );
}
