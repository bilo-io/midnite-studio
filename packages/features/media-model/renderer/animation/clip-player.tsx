import type { AnimationClip } from '@midnite/studio-shared';
import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject, type UIEvent } from 'react';
import { LuChevronsDownUp, LuChevronsUpDown, LuPause, LuPlay, LuRepeat, LuSkipBack, LuStepBack, LuStepForward } from 'react-icons/lu';

import { SelectField, useFrameChrome } from '@midnite/studio-frame';

import type { RiggedModel } from '../rigged-models';
import { clipLanes, LANE_COLLAPSE_THRESHOLD, LANE_ROW_HEIGHT, summaryLane, timePercent, visibleLaneRange, type Lane } from './clip-lanes';
import type { PreviewReport, PreviewTarget } from './clip-preview';
import { initialPlayer, PLAYER_SPEEDS, playerReducer, timelineKey, timeReadout, DEFAULT_FPS, type PlayerState } from './player-state';
import { mannequinSkeleton } from './skeleton-spec';
import { RigChoices, useDecodedClip, useFrameClock, useOptionalRepoId, useRigSkeleton } from './use-clip-playback';

const ClipPreview = lazy(() => import('./clip-preview'));

const MANNEQUIN = 'mannequin';
const OWN = 'own';
const rigKey = (m: RiggedModel) => `rig:${m.project}/${m.path}`;

/**
 * The timeline player under the clip list (Phase 125 Theme D): a 3D preview of the selected clip on a chosen
 * model, a transport (play / pause, frame step, loop, speed), a ruler with an in/out preview range and a lane of
 * key ticks per bone. Keys work while the player has focus: Space, ←/→, `[` `]` and `L`.
 */
export function ClipPlayer({ clip }: { clip: AnimationClip }) {
  const decoded = useDecodedClip(clip);
  const repoId = useOptionalRepoId();
  const [models, setModels] = useState<RiggedModel[]>([]);
  const [choice, setChoice] = useState(MANNEQUIN);
  const [report, setReport] = useState<PreviewReport | null>(null);
  const chosenModel = useMemo(() => models.find((m) => rigKey(m) === choice) ?? null, [models, choice]);
  const rig = useRigSkeleton(repoId, chosenModel);
  const mannequin = useMemo(() => mannequinSkeleton(), []);

  const lanes = useLanes(decoded.data?.clip.tracks);
  const duration = decoded.data?.clip.duration ?? clip.durationSec ?? 0;
  const fps = clip.fps ?? (clip.frameCount && duration > 0 ? clip.frameCount / duration : DEFAULT_FPS);
  const [player, dispatch] = useReducer(playerReducer, undefined, () => initialPlayer(duration, fps));
  useEffect(() => dispatch({ type: 'load', duration, fps }), [clip.id, duration, fps]);
  useFrameClock(player.playing, (dt) => dispatch({ type: 'tick', dt }));

  const hasOwn = decoded.data?.root != null;
  const target = useMemo<PreviewTarget | null>(() => {
    if (choice === OWN) return { kind: 'own' };
    if (choice === MANNEQUIN) return { kind: 'skeleton', label: 'Mannequin', skeleton: mannequin };
    return rig.skeleton && chosenModel ? { kind: 'skeleton', label: chosenModel.label, skeleton: rig.skeleton } : null;
  }, [choice, mannequin, rig.skeleton, chosenModel]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const el = event.target as HTMLElement;
    if (el.closest('input, select, textarea')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A focused button keeps Space for its own click.
    if (event.key === ' ' && el.closest('button')) return;
    const action = timelineKey(event.key);
    if (!action) return;
    event.preventDefault();
    dispatch(action);
  };

  const options = [
    { value: MANNEQUIN, label: 'Mannequin' },
    ...(hasOwn ? [{ value: OWN, label: 'Clip’s own skeleton' }] : []),
    ...models.map((m) => ({ value: rigKey(m), label: m.label })),
  ];

  return (
    <section aria-label="Timeline player" tabIndex={0} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col border-t border-border outline-none focus-visible:ring-1 focus-visible:ring-primary/60">
      {repoId ? <RigChoices repoId={repoId} onChange={setModels} /> : null}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium">{clip.name}</span>
        <span className="text-muted-foreground">Preview on</span>
        <div className="w-44">
          <SelectField<string> label="Preview model" value={options.some((o) => o.value === choice) ? choice : MANNEQUIN} onChange={setChoice} options={options} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1" data-testid="clip-stage">
        {decoded.isLoading ? (
          <p className="p-4 text-xs text-muted-foreground">Reading the clip…</p>
        ) : decoded.isError ? (
          <p role="alert" className="p-4 text-xs text-destructive">
            {decoded.error instanceof Error ? decoded.error.message : 'The clip could not be decoded.'}
          </p>
        ) : decoded.data && target ? (
          <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading the 3D preview…</p>}>
            <ClipPreview decoded={decoded.data} target={target} time={player.time} onReport={setReport} />
          </Suspense>
        ) : rig.error ? (
          <p role="alert" className="p-4 text-xs text-destructive">{rig.error}</p>
        ) : (
          <p className="p-4 text-xs text-muted-foreground">Loading the model…</p>
        )}
        <RetargetNote report={report} />
      </div>
      <Transport player={player} dispatch={dispatch} />
      <Timeline player={player} dispatch={dispatch} lanes={lanes} />
    </section>
  );
}

function useLanes(tracks: ReadonlyArray<{ name: string; times: ArrayLike<number> }> | undefined): Lane[] {
  return useMemo(() => (tracks ? clipLanes(tracks) : []), [tracks]);
}

function RetargetNote({ report }: { report: PreviewReport | null }) {
  if (!report) return null;
  let text: string | null = null;
  if (report.mode === 'none') text = 'This clip has no skeleton of its own; choose a model to play it on.';
  else if (report.fellBack) text = 'No bone names matched that model, so the clip plays on its own skeleton.';
  else if (report.mode === 'retarget') text = report.unmatched.length === 0 ? `All ${report.matched} bones matched by name.` : `${report.matched} bones matched, ${report.unmatched.length} unmatched.`;
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute bottom-1 left-2 right-2 flex justify-start">
      <details className="pointer-events-auto max-w-full rounded border border-border/60 bg-card/85 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
        <summary className={report.unmatched.length > 0 ? 'cursor-pointer' : ''} role="status">
          {text}
        </summary>
        {report.unmatched.length > 0 ? <p className="mt-1 max-h-20 overflow-y-auto break-words">Unmatched: {report.unmatched.join(', ')}</p> : null}
      </details>
    </div>
  );
}

type Dispatch = (action: Parameters<typeof playerReducer>[1]) => void;

function Transport({ player, dispatch }: { player: PlayerState; dispatch: Dispatch }) {
  const { IconButton } = useFrameChrome();
  return (
    <div className="flex items-center gap-1 border-t border-border px-2 py-1 text-xs">
      <IconButton icon={LuSkipBack} label="Back to start" size="sm" onClick={() => dispatch({ type: 'scrub', time: player.inPoint })} />
      <IconButton icon={LuStepBack} label="Previous frame" size="sm" onClick={() => dispatch({ type: 'step', frames: -1 })} />
      <IconButton icon={player.playing ? LuPause : LuPlay} label={player.playing ? 'Pause' : 'Play'} size="sm" onClick={() => dispatch({ type: 'toggle' })} />
      <IconButton icon={LuStepForward} label="Next frame" size="sm" onClick={() => dispatch({ type: 'step', frames: 1 })} />
      <button
        type="button"
        aria-pressed={player.loop}
        aria-label="Loop"
        title="Loop (L)"
        onClick={() => dispatch({ type: 'toggleLoop' })}
        className={`rounded p-1 transition-colors ${player.loop ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-primary/10'}`}
      >
        <LuRepeat aria-hidden className="h-3.5 w-3.5" />
      </button>
      <div className="w-20">
        <SelectField<string> label="Speed" value={String(player.speed)} onChange={(v) => dispatch({ type: 'setSpeed', speed: Number(v) })} options={PLAYER_SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))} />
      </div>
      <button type="button" onClick={() => dispatch({ type: 'setIn' })} title="Set in point ([)" className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-primary/10">
        In
      </button>
      <button type="button" onClick={() => dispatch({ type: 'setOut' })} title="Set out point (])" className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-primary/10">
        Out
      </button>
      <button type="button" onClick={() => dispatch({ type: 'clearRange' })} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-primary/10">
        Clear range
      </button>
      <span className="flex-1" />
      <output aria-label="Playhead" className="font-mono text-[11px] text-muted-foreground">
        {timeReadout(player)}
      </output>
    </div>
  );
}

/** Pointer-drag over an element: reports the 0–1 position of the pointer along it. */
function useDragX(el: RefObject<HTMLDivElement | null>, onFraction: (fraction: number) => void) {
  const move = (event: ReactPointerEvent) => {
    const box = el.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    onFraction(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  };
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      move(event);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.buttons === 1) move(event);
    },
  };
}

function Timeline({ player, dispatch, lanes }: { player: PlayerState; dispatch: Dispatch; lanes: Lane[] }) {
  const { duration } = player;
  // All three drags measure against the ruler, not the element under the pointer (a handle is 6 px wide).
  const ruler = useRef<HTMLDivElement>(null);
  const scrub = useDragX(ruler, (f) => dispatch({ type: 'scrub', time: f * duration }));
  const inDrag = useDragX(ruler, (f) => dispatch({ type: 'setIn', time: f * duration }));
  const outDrag = useDragX(ruler, (f) => dispatch({ type: 'setOut', time: f * duration }));
  const long = lanes.length > LANE_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [lanes]);
  const shown = long && !expanded ? [summaryLane(lanes)] : lanes;

  return (
    <div className="flex max-h-40 min-h-0 flex-col border-t border-border text-[11px]">
      <div className="grid grid-cols-[8rem_1fr] items-center">
        <div className="flex items-center justify-between px-2 text-muted-foreground">
          <span>{lanes.length} bones</span>
          {long ? (
            <button type="button" aria-label={expanded ? 'Collapse bone lanes' : 'Expand bone lanes'} onClick={() => setExpanded((e) => !e)} className="rounded p-0.5 hover:bg-primary/10">
              {expanded ? <LuChevronsDownUp aria-hidden className="h-3.5 w-3.5" /> : <LuChevronsUpDown aria-hidden className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
        <div ref={ruler} className="relative h-6 cursor-ew-resize touch-none select-none bg-muted/40" {...scrub} role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={player.time}>
          <div className="absolute inset-y-0 bg-primary/15" style={{ left: `${timePercent(player.inPoint, duration)}%`, right: `${100 - timePercent(player.outPoint, duration)}%` }} data-testid="range" />
          <RangeHandle drag={inDrag} percent={timePercent(player.inPoint, duration)} label="In point" />
          <RangeHandle drag={outDrag} percent={timePercent(player.outPoint, duration)} label="Out point" />
          <Playhead percent={timePercent(player.time, duration)} />
        </div>
      </div>
      <Lanes lanes={shown} player={player} windowed={long && expanded} />
    </div>
  );
}

function RangeHandle({ drag, percent, label }: { drag: ReturnType<typeof useDragX>; percent: number; label: string }) {
  return (
    <div
      {...drag}
      onPointerDown={(event) => {
        event.stopPropagation();
        drag.onPointerDown(event);
      }}
      role="slider"
      aria-label={label}
      aria-valuenow={percent}
      className="absolute inset-y-0 w-1.5 cursor-col-resize bg-primary/70"
      // Kept inside the ruler (6 px wide, so the end handle does not hang over a neighbouring pane's edge).
      style={{ left: `calc(${percent}% - ${percent * 0.06}px)` }}
    />
  );
}

const Playhead = ({ percent }: { percent: number }) => <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-foreground" style={{ left: `${percent}%` }} data-testid="playhead" />;

function Lanes({ lanes, player, windowed }: { lanes: Lane[]; player: PlayerState; windowed: boolean }) {
  const [scrollTop, setScrollTop] = useState(0);
  const viewport = 120;
  const range = windowed ? visibleLaneRange(scrollTop, viewport, lanes.length) : { start: 0, end: lanes.length };
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop), []);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll} aria-label="Bone lanes" role="list" style={windowed ? { maxHeight: viewport } : undefined}>
      <div style={windowed ? { height: lanes.length * LANE_ROW_HEIGHT, position: 'relative' } : undefined}>
        {lanes.slice(range.start, range.end).map((lane, i) => (
          <div
            key={lane.bone}
            role="listitem"
            className="grid grid-cols-[8rem_1fr] items-center"
            style={windowed ? { position: 'absolute', top: (range.start + i) * LANE_ROW_HEIGHT, left: 0, right: 0, height: LANE_ROW_HEIGHT } : { height: LANE_ROW_HEIGHT }}
          >
            <span className="truncate px-2 text-muted-foreground" title={lane.bone}>
              {lane.bone}
            </span>
            <div className="relative h-full border-b border-border/30">
              {lane.keys.map((key) => (
                <span key={key} className="absolute top-1/2 h-2 w-1 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary/70" style={{ left: `${timePercent(key, player.duration)}%` }} />
              ))}
              <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${timePercent(player.time, player.duration)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
