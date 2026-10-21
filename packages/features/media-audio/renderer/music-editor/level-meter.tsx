import { useEffect, useRef } from 'react';

import type { MusicEngine } from './engine/engine';

/**
 * A vertical peak meter (Phase 101 Theme F). It polls the engine on animation frames only while the
 * transport plays, writing straight to the bar's style, so a running meter re-renders nothing.
 */
export function LevelMeter({
  engine,
  trackId,
  label,
}: {
  engine: MusicEngine | null;
  trackId: string | 'master';
  label: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || !engine) return;
    let raf = 0;
    const draw = () => {
      const levels = engine.getLevels();
      const level = trackId === 'master' ? levels.master : (levels.tracks[trackId] ?? 0);
      el.style.height = `${Math.round(level * 100)}%`;
      raf = engine.getState() === 'playing' ? requestAnimationFrame(draw) : 0;
      if (!raf) el.style.height = '0%';
    };
    draw();
    const unsubscribe = engine.subscribe(() => {
      if (!raf) draw();
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [engine, trackId]);
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-full w-1.5 flex-col justify-end overflow-hidden rounded-sm bg-muted"
    >
      <div ref={bar} className="w-full bg-emerald-500" style={{ height: 0 }} />
    </div>
  );
}
