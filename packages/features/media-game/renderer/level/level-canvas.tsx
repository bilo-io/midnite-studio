import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { cellAt, cellOrigin, collisionAt, collisionLayer, mapPixelSize, readTmj, sourceRect, tileOf, type TmjTileLayer } from '@midnite/studio-shared';

import { objectToMapPoint, mapPointToObject, type Cell, type EditLevel, type EditSelection, type LevelObject } from './level-edit-model';
import { fitView, screenToMap, zoomAround, type View } from './level-view';

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
};

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
export function hitObject(level: EditLevel, mapPoint: { x: number; y: number }, zoom: number): NonNullable<EditSelection> | null {
  const reach = HIT_RADIUS_PX / zoom;
  for (let i = level.layers.length - 1; i >= 0; i -= 1) {
    const layer = level.layers[i]!;
    if (layer.type !== 'objectgroup' || layer.visible === false || typeof layer.id !== 'number') continue;
    const objects = layer.objects ?? [];
    for (let j = objects.length - 1; j >= 0; j -= 1) {
      const o = objects[j]!;
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
  hoverEnabled,
  preview,
  onPointer,
  onKeyDown,
  label,
}: {
  level: EditLevel;
  images: ReadonlyArray<{ path: string; dataUrl: string }>;
  selection: EditSelection;
  hoverEnabled: boolean;
  /** Cells outlined while a rectangle is being dragged. */
  preview: readonly Cell[] | null;
  onPointer: (event: CanvasPointer) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tmj = useMemo(() => readTmj(level), [level]);
  const { map: tilesetImages, loaded } = useTilesetImages(images);
  const [size, setSize] = useState({ width: 640, height: 400 });
  const [view, setView] = useState<View>(() => fitView({ width: 640, height: 400 }, mapPixelSize(level).width, mapPixelSize(level).height));
  const [hover, setHover] = useState<Cell | null>(null);
  const space = useRef(false);
  const pan = useRef<{ sx: number; sy: number; view: View } | null>(null);
  const tool = useRef(false);
  const fitted = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const width = Math.max(1, Math.round(el.clientWidth)), height = Math.max(1, Math.round(el.clientHeight));
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
      // The first real measurement fits the map; later resizes keep the user's view.
      if (!fitted.current) {
        fitted.current = true;
        const px = mapPixelSize(level);
        setView(fitView({ width, height }, px.width, px.height));
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
        if (selection && selection.layerId === layer.id && selection.objectId === o.id) {
          ctx.strokeStyle = outline;
          ctx.lineWidth = 2 / view.zoom;
          ctx.beginPath();
          ctx.arc(at.x, at.y, r + 3 / view.zoom, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1 / view.zoom;
        }
        ctx.fillStyle = text;
        ctx.fillText(o.name, at.x, at.y + r + tmj.tileheight / 2.5);
      }
    }
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
  }, [tmj, level, tilesetImages, loaded, view, size, hover, hoverEnabled, preview, selection]);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current?.getBoundingClientRect();
    return { sx: e.clientX - (rect?.left ?? 0), sy: e.clientY - (rect?.top ?? 0) };
  };

  const emit = (e: ReactPointerEvent<HTMLCanvasElement>, phase: CanvasPointer['phase']) => {
    const { sx, sy } = local(e);
    const p = screenToMap(view, sx, sy);
    const cell = cellAt(level, p.x, p.y);
    if (phase === 'move') setHover(cell);
    onPointer({ phase, cell, object: mapPointToObject(level, p.x, p.y), hit: hitObject(level, p, view.zoom), alt: e.altKey });
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
          setView((v) => zoomAround(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy));
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setHover(null)}
        onAuxClick={(e) => e.preventDefault()}
      />
      <span className="pointer-events-none absolute bottom-1 right-2 text-[11px] tabular-nums text-muted-foreground" data-testid="level-zoom">
        {level.width} × {level.height} · {Math.round(view.zoom * 100)}%
      </span>
    </div>
  );
}
