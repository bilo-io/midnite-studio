import { Canvas } from '@react-three/fiber';
import { DEFAULT_SNAP, TransformModeBar, transformModeForKey, type SnapSettings, type TransformMode } from '@midnite/studio-frame/viewport3d';
import { bridge } from '@midnite/studio-frame';
import { metresPerTile, type GameLevelTerrain } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { LuActivity } from 'react-icons/lu';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { addObject, select, setActiveLayer, type EditLevel, type EditSelection, type EditState } from '../level-edit-model';
import { orbitPose, planPose, type CameraPose } from './camera-transition';
import { formatStats, type GroundTile, type ViewStats } from './level-cull';
import { disposeTree, LevelScene, SCENE_BACKGROUND, type CameraMove } from './level-scene';
import { useLevelViewStore } from './level-view-store';
import { gizmoEdit, groundY, levelWorldItems, worldToObjectPoint, type GizmoChange } from './level-world';
import { ModelCache } from './model-cache';
import { OPTIMISATION_PRESETS, presetFor } from './optimisation';
import { SpatialGrid } from './spatial-grid';

/** What the editor asks of the 3D view: ease back to the plan pose, then hand over the pose it ended on. */
export type Level3dHandle = { exit: (done: (pose: CameraPose) => void) => void };

export type Level3dViewProps = {
  gameId: string;
  level: EditLevel;
  terrain: GameLevelTerrain | null;
  selection: EditSelection;
  readOnly: boolean;
  /** `select` shows the gizmo; `entity` places `entityName` where the ground is clicked. */
  tool: string;
  entityName: string;
  objectLayerId: number | null;
  update: (fn: (s: EditState) => EditState) => void;
  /** Where the camera starts: the plan view's own framing when the switch animates in, else an orbit over the level. */
  enterFrom: { target: [number, number, number]; span: number } | null;
  handle: MutableRefObject<Level3dHandle | null>;
  /** Keys the 3D view does not own (undo, delete, tool keys) go back to the editor. */
  onEditorKey: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function decodeBase64(data: string): ArrayBuffer {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** The level's ground in metres: the terrain's extent, else the map's own. */
export function levelBounds(level: EditLevel, terrain: GameLevelTerrain | null): GroundTile {
  if (terrain) return { minX: terrain.minX, minZ: terrain.minZ, maxX: terrain.maxX, maxZ: terrain.maxZ };
  const mpt = metresPerTile(level);
  return { minX: 0, minZ: 0, maxX: level.width * mpt, maxZ: level.height * mpt };
}

/**
 * The 3D view of a 3D level (Phase 136): the same edit model as the plan view, drawn in perspective with the model
 * editor's gizmo, orbit and axis widget. Lazy-loaded, so three never reaches a 2D level or the plan view.
 */
export default function Level3dView(props: Level3dViewProps) {
  const { level, gameId, update } = props;
  const items = useMemo(() => levelWorldItems(level), [level]);
  const grid = useMemo(() => new SpatialGrid(items), [items]);
  const bounds = useMemo(() => levelBounds(level, props.terrain), [level, props.terrain]);
  const ground = groundY(level);
  const selected = useMemo(() => {
    const sel = props.selection;
    if (!sel) return null;
    const i = items.findIndex((it) => it.sel.layerId === sel.layerId && it.sel.objectId === sel.objectId);
    return i < 0 ? null : i;
  }, [items, props.selection]);

  const step = useLevelViewStore((s) => s.optimisation);
  const statsOn = useLevelViewStore((s) => s.stats);
  const preset = presetFor(step);
  const [mode, setMode] = useState<TransformMode>('translate');
  const [snap, setSnap] = useState<SnapSettings>(DEFAULT_SNAP);
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [dirtyTick, setDirtyTick] = useState(0);
  const [shown, setShown] = useState(false);
  const statsOnRef = useRef(statsOn);
  statsOnRef.current = statsOn;

  const levelCentre = (): { target: [number, number, number]; span: number } => ({
    target: [(bounds.minX + bounds.maxX) / 2, ground, (bounds.minZ + bounds.maxZ) / 2],
    span: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 10) * 0.8,
  });
  const move = useRef<CameraMove | null>(null);
  const poseOut = useRef<CameraPose | null>(null);
  const [initialPose] = useState<CameraPose>(() => {
    if (!props.enterFrom) {
      const c = levelCentre();
      return orbitPose(c.target, c.span);
    }
    const from = planPose(props.enterFrom.target, props.enterFrom.span);
    move.current = { from, to: orbitPose(props.enterFrom.target, props.enterFrom.span), startedAt: null };
    return from;
  });

  const cache = useMemo(
    () =>
      new ModelCache<Object3D>({
        load: async (name) => {
          const result = await bridge()?.games.levels.model({ gameId, name });
          if (!result) throw new Error('The app bridge is not available.');
          if (!result.ok) throw new Error('message' in result ? result.message : 'The model could not be read.');
          const gltf = await new GLTFLoader().parseAsync(decodeBase64(result.value.data), '');
          return gltf.scene;
        },
        dispose: disposeTree,
        onChange: () => setDirtyTick((t) => t + 1),
      }),
    [gameId],
  );
  useEffect(() => () => cache.close(), [cache]);

  useEffect(() => {
    // The canvas fades in over the plan view while the camera eases down from it.
    const id = requestAnimationFrame(() => setShown(true));
    props.handle.current = {
      exit: (done) => {
        const now = poseOut.current ?? initialPose;
        const to = planPose(now.target, now.span);
        move.current = { from: now, to, startedAt: null, onDone: () => done(to) };
      },
    };
    return () => {
      cancelAnimationFrame(id);
      props.handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frame = () => {
    const now = poseOut.current ?? initialPose;
    const item = selected !== null ? items[selected] : undefined;
    const to = item
      ? orbitPose([item.position[0], item.position[1] + item.size[1] / 2, item.position[2]], Math.max(item.size[0], item.size[1], item.size[2], 2) * 4, now.yaw)
      : { ...orbitPose(levelCentre().target, levelCentre().span), yaw: now.yaw };
    move.current = { from: now, to, startedAt: null };
    setDirtyTick((t) => t + 1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod && !event.altKey) {
      const key = event.key.toLowerCase();
      const next = transformModeForKey(key);
      if (next && !props.readOnly) {
        event.preventDefault();
        setMode(next);
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        frame();
        return;
      }
      if (key === 'escape') {
        update((s) => select(s, null));
        return;
      }
    }
    props.onEditorKey(event);
  };

  const editable = !props.readOnly;
  const gizmo = editable && props.tool === 'select' ? mode : null;
  const placing = editable && props.tool === 'entity' && props.objectLayerId !== null && props.entityName !== '';

  return (
    <div
      className="relative h-full w-full outline-none"
      style={{ background: SCENE_BACKGROUND, opacity: shown ? 1 : 0, transition: 'opacity 180ms ease-out' }}
      tabIndex={0}
      role="application"
      aria-label="Level 3D view. Drag to orbit, right-drag to pan, wheel to zoom. W move, E rotate, R scale, F frame, Escape deselects."
      data-testid="level-3d-view"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.currentTarget.focus()}
    >
      <Canvas frameloop={statsOn ? 'always' : 'demand'} dpr={Math.min(preset.pixelRatio, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)} gl={{ antialias: true }} onPointerMissed={() => undefined}>
        <LevelScene
          items={items}
          grid={grid}
          bounds={bounds}
          ground={ground}
          drape={props.terrain?.preview ?? null}
          selected={selected}
          gizmo={gizmo}
          snap={snap}
          preset={preset}
          placing={placing}
          cache={cache}
          initialPose={initialPose}
          move={move}
          poseOut={poseOut}
          dirtyTick={dirtyTick}
          onPick={(index) => {
            const sel = index === null ? null : (items[index]?.sel ?? null);
            update((s) => select(s, sel));
          }}
          onPlace={(x, z) => {
            const layer = props.objectLayerId;
            if (layer === null) return;
            const at = worldToObjectPoint(level, x, z);
            update((s) => addObject(setActiveLayer(s, layer), layer, { type: props.entityName, x: at.x, y: at.y }));
          }}
          onGizmoEnd={(change: GizmoChange) => {
            const sel = props.selection;
            if (sel) update((s) => gizmoEdit(s, sel, change));
          }}
          onStats={(s) => {
            if (statsOnRef.current) setStats(s);
          }}
        />
      </Canvas>
      <ViewBar mode={mode} onMode={setMode} snap={snap} onSnap={setSnap} readOnly={props.readOnly} stats={statsOn ? stats : null} />
    </div>
  );
}

/** The floating bar: gizmo modes and snap (shared with the model editor), the Optimisation slider and the readout. */
function ViewBar({ mode, onMode, snap, onSnap, readOnly, stats }: { mode: TransformMode; onMode: (m: TransformMode) => void; snap: SnapSettings; onSnap: (s: SnapSettings) => void; readOnly: boolean; stats: ViewStats | null }) {
  const step = useLevelViewStore((s) => s.optimisation);
  const statsOn = useLevelViewStore((s) => s.stats);
  const setOptimisation = useLevelViewStore((s) => s.setOptimisation);
  const toggleStats = useLevelViewStore((s) => s.toggleStats);
  return (
    <>
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/85 px-2 py-1 text-xs backdrop-blur" onKeyDown={(e) => e.stopPropagation()}>
        {readOnly ? null : <TransformModeBar mode={mode} onModeChange={onMode} snap={snap} onSnapChange={onSnap} />}
        <label className="flex items-center gap-1.5 text-muted-foreground" title="1 favours quality, 5 favours speed: draw distance, detail, shadows, lights and resolution.">
          <span>Optimisation</span>
          <input
            type="range"
            min={1}
            max={OPTIMISATION_PRESETS.length}
            step={1}
            value={step}
            aria-label="Optimisation"
            aria-valuetext={`${step} of ${OPTIMISATION_PRESETS.length}: ${presetFor(step).label}`}
            data-testid="level-optimisation"
            onChange={(e) => setOptimisation(Number(e.target.value))}
            className="w-20 accent-primary"
          />
          <span className="w-16 tabular-nums">{`${step} · ${presetFor(step).label}`}</span>
        </label>
        <button
          type="button"
          aria-pressed={statsOn}
          aria-label="Show performance readout"
          title="Frame rate, draw calls and visible objects"
          onClick={toggleStats}
          className={`rounded p-1 ${statsOn ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
        >
          <LuActivity aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      {statsOn ? (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white" data-testid="level-3d-stats" aria-live="off">
          {stats ? formatStats(stats) : 'measuring…'}
        </div>
      ) : null}
    </>
  );
}
