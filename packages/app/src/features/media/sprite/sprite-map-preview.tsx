import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';

import { cellOrigin, collisionAt, collisionLayer, mapPixelSize, MAP_ZOOMS, readTmj, sourceRect, stepZoom, tileOf, type Tmj, type TmjTileLayer } from '@midnite/studio-shared';

/**
 * A generated or imported map (Phase 106 Theme J) on a 2D canvas: drag to pan, the wheel or `+`/`-` to
 * zoom (whole steps from 1×, so pixel tiles stay crisp), a checkbox per layer, and the collision overlay
 * — 40 % red over `solid`, 40 % blue over `water` — read from the tiles' own `collision` property.
 */
const COLLISION_FILL: Record<string, string> = { solid: 'rgba(229, 57, 53, 0.4)', water: 'rgba(30, 136, 229, 0.4)' };
const VIEW = { width: 640, height: 400 };

type Loaded = { map: Tmj; images: Map<string, HTMLImageElement>; /** Bumped as each tileset image arrives, so the canvas redraws. */ loadedImages: number };

function useMapFile(url: (path: string) => string, version: string): { data: Loaded | null; error: string | null } {
  const [state, setState] = useState<{ data: Loaded | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(url('map.tmj'));
        if (!res.ok) throw new Error('map.tmj could not be read.');
        const map = readTmj(await res.json());
        if (!map) throw new Error('map.tmj is not a Tiled map.');
        const images = new Map<string, HTMLImageElement>();
        for (const t of map.tilesets) {
          const img = new Image();
          img.onload = () => {
            if (live) setState((current) => (current.data ? { ...current, data: { ...current.data, loadedImages: current.data.loadedImages + 1 } } : current));
          };
          img.src = url(t.image);
          images.set(t.image, img);
        }
        if (live) setState({ data: { map, images, loadedImages: 0 }, error: null });
      } catch (error) {
        if (live) setState({ data: null, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      live = false;
    };
    // `url` is rebuilt every render; the file only changes with `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return state;
}

export function SpriteMapPreview({ url, version }: { url: (path: string) => string; version: string }) {
  const { data, error } = useMapFile(url, version);
  if (error) return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{error}</p>;
  if (!data) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading the map…</p>;
  return <MapCanvas key={version} loaded={data} />;
}

function MapCanvas({ loaded }: { loaded: Loaded }) {
  const { map, images, loadedImages } = loaded;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(map.layers.filter((l) => !l.visible).map((l) => l.name)));
  const [showCollision, setShowCollision] = useState(false);
  const pixel = mapPixelSize(map);
  const lift = Math.max(0, ...map.tilesets.map((t) => t.tileheight - map.tileheight));
  const fit = Math.min(VIEW.width / pixel.width, VIEW.height / (pixel.height + lift));
  const [zoom, setZoom] = useState<number>(() => [...MAP_ZOOMS].reverse().find((z) => z <= fit) ?? MAP_ZOOMS[0]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const collision = useMemo(() => collisionLayer(map), [map]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    ctx.imageSmoothingEnabled = zoom < 1;
    const ox = (VIEW.width - pixel.width * zoom) / 2 + pan.x;
    const oy = (VIEW.height - (pixel.height + lift) * zoom) / 2 + lift * zoom + pan.y;
    ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
    const cellPath = (x: number, y: number) => {
      const o = cellOrigin(map, x, y);
      ctx.beginPath();
      if (map.orientation === 'isometric') {
        ctx.moveTo(o.x + map.tilewidth / 2, o.y);
        ctx.lineTo(o.x + map.tilewidth, o.y + map.tileheight / 2);
        ctx.lineTo(o.x + map.tilewidth / 2, o.y + map.tileheight);
        ctx.lineTo(o.x, o.y + map.tileheight / 2);
        ctx.closePath();
      } else ctx.rect(o.x, o.y, map.tilewidth, map.tileheight);
    };
    for (const layer of map.layers) {
      if (hidden.has(layer.name)) continue;
      if (layer.type === 'tilelayer') {
        for (let y = 0; y < layer.height; y += 1)
          for (let x = 0; x < layer.width; x += 1) {
            const hit = tileOf(map.tilesets, layer.data[y * layer.width + x] ?? 0);
            const img = hit ? images.get(hit.tileset.image) : undefined;
            if (!hit || !img || !img.complete || img.naturalWidth === 0) continue;
            const src = sourceRect(hit.tileset, hit.local);
            const o = cellOrigin(map, x, y);
            ctx.drawImage(img, src.x, src.y, src.w, src.h, o.x, o.y + map.tileheight - src.h, src.w, src.h);
          }
      } else {
        ctx.font = `${Math.max(6, map.tileheight / 2)}px sans-serif`;
        for (const o of layer.objects) {
          // Isometric objects are measured in tile-height units on both axes.
          const at = map.orientation === 'isometric' ? cellOrigin(map, o.x / map.tileheight - 0.5, o.y / map.tileheight - 0.5) : { x: o.x - map.tilewidth / 2, y: o.y - map.tileheight / 2 };
          const cx = at.x + map.tilewidth / 2, cy = at.y + map.tileheight / 2;
          ctx.fillStyle = (o.type ?? o.class) === 'spawn' ? '#22c55e' : (o.type ?? o.class) === 'exit' ? '#f59e0b' : '#e5e7eb';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, map.tileheight / 4), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(o.name, cx + map.tileheight / 3, cy);
        }
      }
    }
    if (showCollision && collision) {
      for (let i = 0; i < collision.data.length; i += 1) {
        const flag = collisionAt(map, collision as TmjTileLayer, i);
        if (!flag) continue;
        ctx.fillStyle = COLLISION_FILL[flag] ?? COLLISION_FILL.solid!;
        cellPath(i % collision.width, Math.floor(i / collision.width));
        ctx.fill();
      }
    }
  }, [map, images, loadedImages, hidden, showCollision, zoom, pan, pixel.width, pixel.height, lift, collision]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') setZoom((z) => stepZoom(z, 1));
    else if (e.key === '-' || e.key === '_') setZoom((z) => stepZoom(z, -1));
    else if (e.key === '0') setPan({ x: 0, y: 0 });
    else return;
    e.preventDefault();
  };
  const onWheel = (e: WheelEvent) => setZoom((z) => stepZoom(z, e.deltaY < 0 ? 1 : -1));
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, pan };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="sprite-map-preview">
      <canvas
        ref={canvas}
        width={VIEW.width}
        height={VIEW.height}
        tabIndex={0}
        role="img"
        aria-label={`Map, ${map.width} × ${map.height} tiles, ${map.orientation}. Drag to pan, + and − to zoom.`}
        className="w-full cursor-grab rounded-md border border-border/60 bg-muted active:cursor-grabbing"
        style={{ imageRendering: zoom >= 1 ? 'pixelated' : 'auto', aspectRatio: `${VIEW.width} / ${VIEW.height}` }}
        onKeyDown={onKey}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Layers">
        {map.layers.map((l) => (
          <label key={l.name} className="flex items-center gap-1">
            <input
              type="checkbox"
              aria-label={`Layer ${l.name}`}
              className="accent-[hsl(var(--primary))]"
              checked={!hidden.has(l.name)}
              onChange={(e) =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (e.target.checked) next.delete(l.name);
                  else next.add(l.name);
                  return next;
                })
              }
            />
            {l.name}
          </label>
        ))}
        <label className="flex items-center gap-1">
          <input type="checkbox" aria-label="Collision overlay" className="accent-[hsl(var(--primary))]" checked={showCollision} onChange={(e) => setShowCollision(e.target.checked)} />
          collision overlay
        </label>
        <span className="ml-auto tabular-nums" data-testid="map-zoom">
          {map.width} × {map.height} · {zoom}×
        </span>
      </div>
    </div>
  );
}
