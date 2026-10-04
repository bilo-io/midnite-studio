import { clipTiming, type ModelSpec } from '@midnite/studio-shared';
import { useEffect, useRef } from 'react';
import { LuPause, LuPlay, LuRepeat, LuSkipBack } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { FIELD } from './fields';
import { advancePlayhead, clipNamed } from './rig-pose';
import { PLAYBACK_SPEEDS, type RigView, type UpdateRigView } from './rig-view';

/**
 * The clip timeline under the viewport: pick a clip, play / pause, scrub, loop and playback speed.
 * Frames are drawn only while playing — the animation-frame loop exists for exactly as long as
 * `playing` is true, so a paused or idle editor stays idle (the canvas renders on demand).
 */
export function ClipTimeline({ spec, view, onView }: { spec: ModelSpec; view: RigView; onView: UpdateRigView }) {
  const clips = spec.animations ?? [];
  const clip = clipNamed(spec, view.clip);
  const duration = clip ? clipTiming(clip).duration : 0;

  // The loop reads the latest view through a ref so it is started once per play, not once per frame.
  const latest = useRef(view);
  latest.current = view;
  const report = useRef(onView);
  report.current = onView;
  useEffect(() => {
    if (!view.playing || !clip) return;
    let frame = 0;
    let last = performance.now();
    // The loop owns the playhead while it runs (a scrub pauses first), so it never waits on a render.
    let time = latest.current.time;
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * latest.current.speed;
      last = now;
      const next = advancePlayhead(clip, time, dt, latest.current.loop);
      time = next.time;
      report.current(next.ended ? { time: next.time, playing: false } : { time: next.time });
      if (!next.ended) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [view.playing, clip]);

  return (
    <div role="toolbar" aria-label="Timeline" className="flex h-9 shrink-0 items-center gap-1.5 border-t border-border/60 px-2 text-[11px] text-muted-foreground" data-testid="clip-timeline">
      <select
        aria-label="Timeline clip"
        value={view.clip ?? ''}
        onChange={(event) => onView({ clip: event.target.value || null, time: 0, playing: false })}
        className={`${FIELD} max-w-[9rem]`}
      >
        <option value="">Rest pose</option>
        {clips.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <IconButton icon={LuSkipBack} label="Back to start" size="sm" disabled={!clip} onClick={() => onView({ time: 0 })} />
      <IconButton
        icon={view.playing ? LuPause : LuPlay}
        label={view.playing ? 'Pause' : 'Play'}
        size="sm"
        disabled={!clip}
        onClick={() => onView(view.playing ? { playing: false } : { playing: true, time: view.time >= duration && !view.loop ? 0 : view.time })}
      />
      <IconButton icon={LuRepeat} label="Loop playback" size="sm" aria-pressed={view.loop} onClick={() => onView({ loop: !view.loop })} />
      <input
        type="range"
        aria-label="Scrub"
        min={0}
        max={duration || 1}
        step={0.01}
        value={Math.min(view.time, duration || 1)}
        disabled={!clip}
        onChange={(event) => onView({ time: Number(event.target.value), playing: false })}
        className="h-1 min-w-0 flex-1 accent-primary"
      />
      <span className="w-20 shrink-0 text-right tabular-nums" data-testid="timeline-time">
        {view.time.toFixed(2)} / {duration.toFixed(2)}s
      </span>
      <select aria-label="Playback speed" value={view.speed} onChange={(event) => onView({ speed: Number(event.target.value) })} className={FIELD}>
        {PLAYBACK_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}
