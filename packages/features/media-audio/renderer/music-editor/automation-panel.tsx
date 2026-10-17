import {
  songEndTick,
  type Song,
  type SongAutomationLane,
  type SongTrack,
} from '@midnite/studio-shared';
import { useRef } from 'react';
import { LuTrash2 } from 'react-icons/lu';

import { valueAt } from './model/automation';
import {
  addLane,
  addLanePoint,
  availableTargets,
  moveLanePoint,
  removeLane,
  removeLanePoint,
  setLaneCurve,
  targetRange,
} from './model/mixer-edit';
import { arrangementSpan } from './model/ruler';
import { barTicks, snapTick } from './model/song-edit';
import { useElementSize } from './use-element-size';

type Props = {
  song: Song;
  trackId: string | null;
  /** Snap grid in ticks; 0 is off. */
  grid: number;
  onCommit: (next: Song, key?: string | null) => void;
};

export const LANE_H = 84;
const PAD = 8;

/**
 * Automation lanes for the active track (Phase 101 Theme F): volume, pan and any effect parameter as
 * breakpoint curves. Click empty space to add a point, drag a point to move it, double-click it to
 * delete. Each lane runs the length of the arrangement, so it lines up with the ruler above.
 */
export function AutomationPanel({ song, trackId, grid, onCommit }: Props) {
  const track = song.tracks.find((t) => t.id === trackId) ?? null;
  if (!track)
    return (
      <p data-testid="automation" className="p-3 text-xs text-muted-foreground">
        Add a track to automate it.
      </p>
    );
  const targets = availableTargets(track);
  return (
    <div data-testid="automation" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1 text-xs">
        <span className="font-medium">Automation · {track.name || 'Track'}</span>
        <select
          aria-label="Add automation lane"
          value=""
          onChange={(e) => {
            const added = addLane(song, track.id, e.target.value);
            if (added) onCommit(added.song);
          }}
          disabled={targets.length === 0}
          className="h-6 rounded border border-border bg-background px-1 text-xs"
        >
          <option value="">Add lane…</option>
          {targets.map((t) => (
            <option key={t.target} value={t.target}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {track.automation.length === 0 && (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          No lanes. Add one to draw volume, pan or effect changes over time.
        </p>
      )}
      {track.automation.map((lane) => (
        <Lane key={lane.id} song={song} track={track} lane={lane} grid={grid} onCommit={onCommit} />
      ))}
    </div>
  );
}

function Lane({
  song,
  track,
  lane,
  grid,
  onCommit,
}: {
  song: Song;
  track: SongTrack;
  lane: SongAutomationLane;
  grid: number;
  onCommit: Props['onCommit'];
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const gesture = useRef(0);
  const dragging = useRef<{ index: number; key: string } | null>(null);
  const range = targetRange(track, lane.target) ?? {
    min: 0,
    max: 1,
    default: 0,
    label: lane.target,
  };
  const sig = song.timeSignatures[0] ?? { numerator: 4, denominator: 4 as const };
  const span = arrangementSpan(songEndTick(song), barTicks(sig.numerator, sig.denominator));
  const w = Math.max(1, size.width);
  const x = (tick: number) => (tick / span) * w;
  const y = (value: number) =>
    PAD + (1 - (value - range.min) / (range.max - range.min || 1)) * (LANE_H - PAD * 2);
  const toTick = (px: number) => snapTick((px / w) * span, grid);
  const toValue = (py: number) =>
    range.min + (1 - (py - PAD) / (LANE_H - PAD * 2)) * (range.max - range.min);

  // The polyline the engine will actually play: held to the first point, stepped or linear after.
  const pts = lane.points;
  const path: string[] = [];
  if (pts.length > 0) {
    path.push(`M0,${y(pts[0]!.value)}`);
    pts.forEach((p, i) => {
      const prev = pts[i - 1];
      if (prev && lane.curve === 'step') path.push(`L${x(p.tick)},${y(prev.value)}`);
      path.push(`L${x(p.tick)},${y(p.value)}`);
    });
    path.push(`L${w},${y(pts[pts.length - 1]!.value)}`);
  } else {
    path.push(`M0,${y(range.default)}L${w},${y(range.default)}`);
  }

  const local = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  return (
    <div
      data-testid="automation-lane"
      data-target={lane.target}
      className="flex border-b border-border"
    >
      <div className="flex w-[148px] shrink-0 flex-col gap-1 border-r border-border p-2 text-xs">
        <span className="truncate font-medium" title={range.label}>
          {range.label}
        </span>
        <select
          aria-label={`${range.label} curve`}
          value={lane.curve}
          onChange={(e) =>
            onCommit(setLaneCurve(song, track.id, lane.id, e.target.value as 'linear' | 'step'))
          }
          className="h-6 rounded border border-border bg-background px-1 text-xs"
        >
          <option value="linear">Linear</option>
          <option value="step">Step</option>
        </select>
        <button
          type="button"
          aria-label={`Remove ${range.label} lane`}
          onClick={() => onCommit(removeLane(song, track.id, lane.id))}
          className="flex items-center gap-1 text-muted-foreground hover:text-destructive"
        >
          <LuTrash2 className="h-3 w-3" aria-hidden /> Remove
        </button>
      </div>
      <div ref={ref} className="min-w-0 flex-1" style={{ height: LANE_H }}>
        <svg
          width={w}
          height={LANE_H}
          role="application"
          aria-label={`${range.label} automation`}
          className="block touch-none text-primary"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'path') return;
            const { px, py } = local(e);
            gesture.current += 1;
            const tick = toTick(px);
            onCommit(addLanePoint(song, track.id, lane.id, { tick, value: toValue(py) }));
          }}
          onPointerMove={(e) => {
            const drag = dragging.current;
            if (!drag) return;
            const { px, py } = local(e);
            onCommit(
              moveLanePoint(song, track.id, lane.id, drag.index, {
                tick: toTick(px),
                value: toValue(py),
              }),
              drag.key,
            );
          }}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        >
          <rect x={0} y={0} width={w} height={LANE_H} fill="transparent" />
          <line
            x1={0}
            x2={w}
            y1={y(range.default)}
            y2={y(range.default)}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="3 3"
          />
          <path d={path.join('')} fill="none" stroke="currentColor" strokeWidth={1.5} />
          {pts.map((p, i) => (
            <circle
              key={`${p.tick}`}
              data-testid="automation-point"
              cx={x(p.tick)}
              cy={y(p.value)}
              r={5}
              fill="currentColor"
              className="cursor-grab"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                gesture.current += 1;
                dragging.current = { index: i, key: `lane:${lane.id}:${gesture.current}` };
              }}
              onDoubleClick={() => onCommit(removeLanePoint(song, track.id, lane.id, i))}
            >
              <title>{`${valueAt({ curve: lane.curve, points: pts }, p.tick, p.value).toFixed(2)} at tick ${p.tick}`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}
