import {
  clipFrames,
  MEDIA_ROOT_DIR,
  mstudioFileUrl,
  SPRITE_LOOPS,
  spriteFramePath,
  spriteSheetDirections,
  type SheetFrame,
  type SpriteFramesFile,
  type SpriteLoop,
  type SpriteSheetSpec,
} from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LuCrosshair, LuGrid2X2, LuLayers, LuPause, LuPlay, LuStepBack, LuStepForward } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { Spinner } from '../../../components/skeleton';
import { previewClock } from './preview-clock';
import { SPRITE_CHECKER } from './sprite-checker';
import type { SpriteRef } from './use-sprite';

/**
 * The animation previewer (Phase 106 Theme G): plays one clip in one direction on a 2D canvas,
 * from the frame PNGs themselves — composed exactly as the packer composes them (`flipped` about the
 * anchor column, then `anchorNudge`), so what plays is what exports.
 *
 * Controls: play/pause, an fps override, the loop mode, the direction compass (4 or 8 directions),
 * onion skin (previous and next frame at 30 %), a checker or solid background, integer zoom with
 * `image-rendering: pixelated` (default: the largest that fits), and the anchor/baseline overlay.
 * Keys, only while the previewer has focus: Space play/pause, `,`/`.` step, `[`/`]` previous/next
 * clip, `1`–`8` pick a direction.
 */
export const OVERLAY_COLOUR = '#ff3b30';
const ONION_ALPHA = 0.3;
const MAX_ZOOM = 8;

/** The compass, laid out as a 3 × 3 grid (the centre is empty). */
const COMPASS: ReadonlyArray<string | null> = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];

export type SpritePreviewerProps = {
  repoId: string;
  target: SpriteRef;
  spec: SpriteSheetSpec;
  file: SpriteFramesFile;
  clip: string;
  dir: string;
  onClip: (clip: string) => void;
  onDir: (dir: string) => void;
  /** Index into the clip's frames (the strip's selection). */
  frame: number;
  onFrame: (index: number) => void;
  version: string;
  /** A running job's progress, shown while frames land. */
  progress: { done: number; total: number } | null;
};

/** Loads (and caches) frame images; re-renders when one finishes loading. */
function useFrameImages(urls: readonly string[]): Map<string, HTMLImageElement> {
  const cache = useRef(new Map<string, HTMLImageElement>());
  const [, setLoaded] = useState(0);
  useEffect(() => {
    for (const url of urls) {
      if (cache.current.has(url)) continue;
      const img = new Image();
      img.onload = () => setLoaded((n) => n + 1);
      img.src = url;
      cache.current.set(url, img);
    }
  }, [urls]);
  return cache.current;
}

export function SpritePreviewer({ repoId, target, spec, file, clip, dir, onClip, onDir, frame, onFrame, version, progress }: SpritePreviewerProps) {
  const clipSpec = spec.clips.find((c) => c.name === clip) ?? spec.clips[0];
  const frames: SheetFrame[] = useMemo(() => (clipSpec ? clipFrames(file, clipSpec, dir) : []), [file, clipSpec, dir]);
  const directions = spriteSheetDirections(spec);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState<number | null>(null);
  const [loop, setLoop] = useState<SpriteLoop | null>(null);
  const [onion, setOnion] = useState(false);
  const [checker, setChecker] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fit, setFit] = useState(MAX_ZOOM);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [fw, fh] = spec.frameSize;
  const scale = zoom ?? fit;
  const urlOf = (n: number) =>
    `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/sprite/${target.group}/${target.asset}/${spriteFramePath(clip, dir, n)}`)}?v=${encodeURIComponent(version)}`;
  const urls = useMemo(() => frames.map((f) => urlOf(f.n)), [frames, version]); // eslint-disable-line react-hooks/exhaustive-deps -- urlOf is derived from these
  const images = useFrameImages(urls);
  const current = Math.min(frame, Math.max(0, frames.length - 1));

  // The largest integer zoom that fits the box (1× at least).
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = box.clientWidth - 16;
      const h = box.clientHeight - 16;
      if (w > 0 && h > 0) setFit(Math.max(1, Math.min(MAX_ZOOM, Math.floor(Math.min(w / fw, h / fh)))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [fw, fh]);

  // Playback: a fresh clock per clip, direction, fps and loop mode, stepped by requestAnimationFrame.
  const mode = loop ?? clipSpec?.loop ?? 'loop';
  const rate = fps ?? clipSpec?.fps ?? 8;
  useEffect(() => {
    if (!playing || frames.length < 2 || typeof requestAnimationFrame === 'undefined') return;
    const clock = previewClock({ frames: frames.length, fps: rate, loop: mode });
    clock.seek(current);
    if (mode === 'once' && !clock.running) clock.seek(0);
    let last = performance.now();
    let handle = requestAnimationFrame(function tick(now) {
      const next = clock.step(now - last);
      last = now;
      onFrame(next);
      if (clock.running) handle = requestAnimationFrame(tick);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(handle);
    // `current` seeds the clock only when playback (re)starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frames.length, rate, mode, clip, dir]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    canvas.width = fw * scale;
    canvas.height = fh * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const draw = (index: number, alpha: number) => {
      const f = frames[index];
      const img = f ? images.get(urls[index]!) : undefined;
      if (!f || !img || !img.complete || img.naturalWidth === 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(f.meta.anchorNudge[0] * scale, f.meta.anchorNudge[1] * scale);
      if (f.meta.flipped) {
        ctx.translate(Math.round(2 * spec.anchor.x * fw) * scale, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, fw * scale, fh * scale);
      ctx.restore();
    };
    if (onion && frames.length > 1) {
      draw((current - 1 + frames.length) % frames.length, ONION_ALPHA);
      draw((current + 1) % frames.length, ONION_ALPHA);
    }
    draw(current, 1);
    if (overlay) {
      const ax = Math.round(spec.anchor.x * fw * scale);
      const ay = Math.round(spec.anchor.y * fh * scale);
      ctx.fillStyle = OVERLAY_COLOUR;
      ctx.fillRect(0, Math.min(canvas.height - 1, ay), canvas.width, 1);
      ctx.fillRect(ax - 2, Math.min(canvas.height - 1, ay) , 5, 1);
      ctx.fillRect(ax, Math.min(canvas.height - 1, ay) - 2, 1, 5);
    }
  });

  const stepBy = (delta: number) => {
    if (frames.length === 0) return;
    setPlaying(false);
    onFrame((current + delta + frames.length) % frames.length);
  };
  const clipBy = (delta: number) => {
    const i = spec.clips.findIndex((c) => c.name === clip);
    const next = spec.clips[(i + delta + spec.clips.length) % spec.clips.length];
    if (next) onClip(next.name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('select, input')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === ',' || e.key === '.') {
      e.preventDefault();
      stepBy(e.key === ',' ? -1 : 1);
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      clipBy(e.key === '[' ? -1 : 1);
    } else if (/^[1-8]$/.test(e.key)) {
      const pick = directions[Number(e.key) - 1];
      if (pick) {
        e.preventDefault();
        onDir(pick);
      }
    }
  };

  const select = 'h-6 rounded border border-border bg-card px-1 text-[11px] text-foreground';
  const empty = Object.keys(file.frames).length === 0;

  return (
    <div
      role="group"
      aria-label="Animation previewer"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-col gap-2 rounded-md border border-border p-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      data-testid="sprite-previewer"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <select aria-label="Clip" className={select} value={clip} onChange={(e) => onClip(e.target.value)}>
          {spec.clips.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <IconButton icon={LuStepBack} label="Previous frame" size="sm" onClick={() => stepBy(-1)} disabled={frames.length === 0} />
        <IconButton icon={playing ? LuPause : LuPlay} label={playing ? 'Pause' : 'Play'} size="sm" onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2} />
        <IconButton icon={LuStepForward} label="Next frame" size="sm" onClick={() => stepBy(1)} disabled={frames.length === 0} />
        <span className="text-[11px] tabular-nums text-muted-foreground" data-testid="sprite-previewer-frame">
          {frames.length > 0 ? `${current + 1} / ${frames.length}` : '0 / 0'}
        </span>
        <label className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          fps
          <input
            aria-label="FPS override"
            type="number"
            min={1}
            max={60}
            value={fps ?? clipSpec?.fps ?? 8}
            onChange={(e) => setFps(Number(e.target.value) >= 1 ? Math.min(60, Number(e.target.value)) : null)}
            className="h-6 w-12 rounded border border-border bg-card px-1 text-[11px] text-foreground tabular-nums"
          />
        </label>
        <select aria-label="Loop" className={select} value={mode} onChange={(e) => setLoop(e.target.value as SpriteLoop)}>
          {SPRITE_LOOPS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton icon={LuLayers} label="Onion skin" size="sm" aria-pressed={onion} onClick={() => setOnion((v) => !v)} />
          <IconButton icon={LuGrid2X2} label={checker ? 'Solid background' : 'Checker background'} size="sm" aria-pressed={checker} onClick={() => setChecker((v) => !v)} />
          <IconButton icon={LuCrosshair} label="Anchor and baseline" size="sm" aria-pressed={overlay} onClick={() => setOverlay((v) => !v)} />
          <select aria-label="Zoom" className={select} value={zoom ?? 0} onChange={(e) => setZoom(Number(e.target.value) || null)}>
            <option value={0}>Fit ({fit}×)</option>
            {Array.from({ length: MAX_ZOOM }, (_, i) => i + 1).map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex min-h-0 gap-2">
        <div ref={boxRef} className="flex min-h-[200px] min-w-0 flex-1 items-center justify-center overflow-auto rounded-sm" style={checker ? SPRITE_CHECKER : { background: 'var(--card)' }}>
          {empty ? (
            progress ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground" role="status">
                <Spinner size="sm" /> {progress.done} / {progress.total}
              </div>
            ) : (
              <p className="px-4 text-center text-xs text-muted-foreground">No frames yet. Pick a method and Generate.</p>
            )
          ) : (
            <canvas ref={canvasRef} aria-label={`${clip} facing ${dir}, frame ${current + 1}`} className="[image-rendering:pixelated]" width={fw * scale} height={fh * scale} />
          )}
        </div>
        {directions.length > 1 ? (
          <div role="radiogroup" aria-label="Direction" className="grid h-fit grid-cols-3 gap-0.5 self-start">
            {COMPASS.map((d, i) =>
              d === null ? (
                <span key={`c${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={dir === d}
                  aria-label={d.toUpperCase()}
                  disabled={!directions.includes(d)}
                  onClick={() => onDir(d)}
                  className={`h-6 w-7 rounded text-[10px] font-medium uppercase disabled:opacity-30 ${dir === d ? 'bg-primary text-primary-foreground' : 'border border-border'}`}
                >
                  {d}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
      {!empty && progress ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
          <Spinner size="sm" /> Frames landing · {progress.done} / {progress.total}
        </p>
      ) : null}
    </div>
  );
}
