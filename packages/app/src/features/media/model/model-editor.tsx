import { Canvas } from '@react-three/fiber';
import type { ModelSpec } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent } from 'react';
import {
  LuAxis3D,
  LuCircleHelp,
  LuBox,
  LuScanEye,
  LuEye,
  LuGrid2X2,
  LuRedo2,
  LuRotateCcw,
  LuRuler,
  LuSave,
  LuScan,
  LuSquareDashed,
  LuUndo2,
} from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { IconSelect, type IconSelectOption } from '../../../components/icon-select';
import type { RetargetSource } from './clip-panel';
import { ClipTimeline } from './clip-timeline';
import { resolveKey, type UiCommand } from './editor-keys';
import { canRedo, canUndo, isDirty, type EditorAction, type EditorState } from './editor-state';
import { EditorScene, type MeasurePoints, type ShadeMode, type TransformMode } from './editor-scene';
import { DEFAULT_LIGHTING, LIGHTING_PRESETS, lightingById } from './lighting';
import { ModelInspector } from './model-inspector';
import type { ConvertFn } from './mesh-panel';
import type { SdfBaker } from './sculpt/use-sdf';
import { sculptWorldMatrix, type SculptIO } from './sculpt/sculpt-controller';
import { SculptLayer } from './sculpt/sculpt-layer';
import { useSculpt } from './sculpt/use-sculpt';
import { specForSave } from './sculpt-panel';
import { specForPaintSave } from './paint-panel';
import { PaintLayer } from './paint/paint-layer';
import { paintIOFrom, usePaint } from './paint/use-paint';
import { RigOverlay } from './rig-overlay';
import { clipNamed, poseAt, posedScene, rigModel } from './rig-pose';
import { INITIAL_RIG_VIEW, type RigView } from './rig-view';
import { boundsOf, distanceBetween, formatSize, sizeOf, type CameraView } from './scene-bounds';
import { ShortcutHelp } from './shortcut-help';
import { DEFAULT_SNAP, GRID_STEPS, stepAlong, type SnapSettings } from './snap';
import { useModelAssetEpoch } from './model-assets';
import { editorScene } from './spec-geometry';
import { withDescendants } from './spec-edit';
import { ViewportWidgets } from './viewport-widgets';
import { MediaPaneToggles } from '../media-layout';

/**
 * The Models tab's 3D editor (lazy chunk): react-three-fiber + drei. The geometry it draws is the
 * exact geometry the files are written from (the shared kernel), so booleans, modifiers, groups
 * and materials look here the way they export. Every change goes through the pure `editorReducer`.
 *
 * The canvas draws on demand (`frameloop="demand"`): an idle editor is idle.
 */
const SHADES: IconSelectOption[] = [
  { value: 'solid', label: 'Solid', icon: LuBox, description: 'Solid shading with materials' },
  { value: 'wireframe', label: 'Wireframe', icon: LuGrid2X2, description: 'Show mesh wireframe edges' },
  { value: 'normals', label: 'Normals', icon: LuAxis3D, description: 'Visualize surface normals' },
];
const CAMERAS: IconSelectOption[] = [
  { value: 'perspective', label: 'Perspective', icon: LuEye, description: 'Camera projection: perspective keeps depth' },
  { value: 'front', label: 'Front', icon: LuSquareDashed, description: 'Front orthographic view (1)' },
  { value: 'side', label: 'Side', icon: LuSquareDashed, description: 'Side orthographic view (2)' },
  { value: 'top', label: 'Top', icon: LuSquareDashed, description: 'Top orthographic view (3)' },
];

export const canUseWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

const SELECT = 'h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground';

export default function ModelEditor({
  state,
  dispatch,
  onSave,
  saving,
  retargetSources,
  onConvert,
  sdfBaker,
  sculptIO,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Saves the design — `spec` when given (sculpt mode hands over the spec repointed at its flushed mesh). */
  onSave: (spec?: ModelSpec) => void;
  saving: boolean;
  /** Other rigged models in the library, for the Animation tab's Retarget. */
  retargetSources?: readonly RetargetSource[];
  /** Voxel-remeshes the design's primitives into a `sculpt` part (Phase 104 Theme B). */
  onConvert?: ConvertFn;
  /** Bakes signed-distance trees into sculpt parts (Phase 104 Theme C); the SDF tab shows only with it. */
  sdfBaker?: SdfBaker;
  /** Reads and writes sculpt meshes (Phase 104 Theme D); the Sculpt tab shows only with it. */
  sculptIO?: SculptIO;
}) {
  const [mode, setMode] = useState<TransformMode>('translate');
  const [shade, setShade] = useState<ShadeMode>('solid');
  const [xray, setXray] = useState(false);
  const [grid, setGrid] = useState(true);
  const [axes, setAxes] = useState(true);
  const [dimensions, setDimensions] = useState(false);
  const [camera, setCamera] = useState<CameraView>('perspective');
  const [lightingId, setLightingId] = useState(DEFAULT_LIGHTING);
  const [snap, setSnap] = useState<SnapSettings>(DEFAULT_SNAP);
  const [measure, setMeasure] = useState(false);
  const [points, setPoints] = useState<MeasurePoints>([]);
  const [resetTick, setResetTick] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [shift, setShift] = useState(false);
  const [help, setHelp] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const webgl = useMemo(canUseWebGL, []);
  const { spec, selection } = state;
  // An imported mesh (an SF3D result) that finishes loading changes the epoch, and the scene rebuilds.
  const assetEpoch = useModelAssetEpoch();
  // A live SDF preview (Theme C) is drawn instead of the design while a blend slider is dragged — viewport only, never history.
  const [sdfPreview, setSdfPreview] = useState<ModelSpec | null>(null);
  useEffect(() => setSdfPreview(null), [spec]);
  const shown = sdfPreview ?? spec;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the epoch is the registry's version, read inside editorScene
  const scene = useMemo(() => editorScene(shown), [shown, assetEpoch]);
  const lighting = lightingById(lightingId);

  // Sculpt mode (Theme D): the worker's mesh replaces the part in the viewport while it is open.
  const { controller: sculpt, snapshot: sculptState } = useSculpt(sculptIO, dispatch, spec);
  const sculpting = !!sculptState && sculptState.status === 'ready';
  const sculptIndex = sculpting ? spec.parts.findIndex((p) => p.id === sculptState.partId) : -1;
  const sculptLook = sculptIndex >= 0 ? scene.parts.find((p) => p.sourceIndex === sculptIndex) : undefined;
  const sculptMatrix = useMemo(() => (sculptIndex >= 0 ? sculptWorldMatrix(spec, sculptIndex) : null), [spec, sculptIndex]);
  // Paint mode (Theme G): the part drawn with its live textures while it is open; it shares the sculpt IO.
  const paintIO = useMemo(() => paintIOFrom(sculptIO), [sculptIO]);
  const { controller: paint, snapshot: paintState } = usePaint(paintIO, dispatch, spec);
  const painting = !!paintState && paintState.status === 'ready';
  const paintIndex = painting ? spec.parts.findIndex((p) => p.id === paintState.partId) : -1;
  const paintMatrix = useMemo(() => (paintIndex >= 0 ? sculptWorldMatrix(spec, paintIndex) : null), [spec, paintIndex]);
  // One brush mode at a time: opening one closes the other (saving it first).
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => {
    if (painting && sculpt?.active) void sculpt.exit(specRef.current);
  }, [painting, sculpt]);
  useEffect(() => {
    if (sculpting && paint?.active) void paint.exit(specRef.current);
  }, [sculpting, paint]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useCallback(async () => {
    setSaveError(null);
    const out = await specForSave(sculpt, state.spec);
    if (!out.ok) return setSaveError(out.error);
    const painted = await specForPaintSave(paint, out.spec);
    if (!painted.ok) return setSaveError(painted.error);
    onSave(painted.spec);
  }, [sculpt, paint, state.spec, onSave]);

  // Rig, pose and playback (view state only — never in the design or its history).
  const [rigView, setRigView] = useState<RigView>(INITIAL_RIG_VIEW);
  const onRigView = useCallback((patch: Partial<RigView>) => setRigView((v) => ({ ...v, ...patch })), []);
  const rigged = useMemo(() => rigModel(spec, scene), [spec, scene]);
  const clip = clipNamed(spec, rigView.clip);
  useEffect(() => {
    if (rigView.clip !== null && !clip) onRigView({ clip: null, time: 0, playing: false });
  }, [rigView.clip, clip, onRigView]);
  const pose = useMemo(() => (rigged ? poseAt(rigged, clip, rigView.time) : null), [rigged, clip, rigView.time]);
  const posed = useMemo(() => (rigged && pose && clip ? posedScene(scene, rigged, pose) : scene), [scene, rigged, pose, clip]);
  const display = useMemo(
    () => (sculptIndex >= 0 || paintIndex >= 0 ? { ...posed, parts: posed.parts.filter((p) => p.sourceIndex !== sculptIndex && p.sourceIndex !== paintIndex) } : posed),
    [posed, sculptIndex, paintIndex],
  );

  // Shift flips snapping while it is held (the gizmo reads this).
  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => event.key === 'Shift' && setShift(true);
    const up = (event: globalThis.KeyboardEvent) => event.key === 'Shift' && setShift(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const runUi = (command: UiCommand) => {
    switch (command) {
      case 'mode:translate':
        return setMode('translate');
      case 'mode:rotate':
        return setMode('rotate');
      case 'mode:scale':
        return setMode('scale');
      case 'measure':
        setPoints([]);
        return setMeasure((on) => !on);
      case 'xray':
        return setXray((on) => !on);
      case 'grid':
        return setGrid((on) => !on);
      case 'frame':
        return setFrameTick((n) => n + 1);
      case 'camera:perspective':
        return setCamera('perspective');
      case 'camera:front':
        return setCamera('front');
      case 'camera:side':
        return setCamera('side');
      case 'camera:top':
        return setCamera('top');
      case 'snap:down':
        return setSnap((s) => ({ ...s, grid: stepAlong(GRID_STEPS, s.grid, -1) }));
      case 'snap:up':
        return setSnap((s) => ({ ...s, grid: stepAlong(GRID_STEPS, s.grid, 1) }));
      case 'help':
        return setHelp((on) => !on);
      case 'save':
        if (isDirty(state) || sculptState?.unsaved || paintState?.unsaved) void save();
        return;
      case 'sculpt:radius':
      case 'sculpt:strength':
        return sculpt?.startAdjust(command === 'sculpt:radius' ? 'radius' : 'strength', sculpt.pointerX);
      case 'sculpt:smaller':
        return sculpt?.stepRadius(-1);
      case 'sculpt:larger':
        return sculpt?.stepRadius(1);
      case 'sculpt:maskInvert':
        return void sculpt?.maskOp('invert');
      case 'sculpt:maskClear':
        return void sculpt?.maskOp('clear');
      case 'escape':
        if (sculptState?.adjust) return sculpt?.endAdjust(true);
        if (help) return setHelp(false);
        if (points.length > 0) return setPoints([]);
        if (measure) return setMeasure(false);
        return dispatch({ type: 'select', index: null });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
    const outcome = resolveKey({ key: event.key, mod: event.metaKey || event.ctrlKey, shift: event.shiftKey, alt: event.altKey, sculpt: sculpting }, state, snap.grid);
    if (!outcome) return;
    event.preventDefault();
    // In paint mode, undo and redo walk the painted strokes; the layer stack has the toolbar's buttons.
    if (painting && paint && outcome.kind === 'dispatch' && (outcome.action.type === 'undo' || outcome.action.type === 'redo')) {
      if (outcome.action.type === 'undo' && paintState!.undo > 0) return paint.undo();
      if (outcome.action.type === 'redo' && paintState!.redo > 0) return paint.redo();
    }
    if (outcome.kind === 'dispatch') dispatch(outcome.action);
    else runUi(outcome.command);
  };

  const selected = useMemo(() => new Set(withDescendants(spec, selection)), [spec, selection]);
  const box = useMemo(() => boundsOf(scene.parts, selection.length > 0 ? selected : undefined), [scene, selected, selection.length]);
  const measured = points.length === 2 ? distanceBetween(points[0]!, points[1]!) : null;
  const errors = scene.issues;

  return (
    <div className="flex h-full min-h-0 flex-col outline-none" tabIndex={0} onKeyDown={onKeyDown} data-testid="model-editor" aria-label="3D editor">
      <div role="toolbar" aria-label="Editor tools" className="flex min-h-9 shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1">
        <IconSelect
          options={SHADES}
          value={shade}
          onChange={(value) => setShade(value as ShadeMode)}
          icon={LuBox}
          label="Shading"
          description="Choose rendering mode"
        />
        <IconButton icon={LuScanEye} label="X-ray (X)" size="sm" aria-pressed={xray} onClick={() => setXray((on) => !on)} />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <IconSelect
          options={CAMERAS}
          value={camera}
          onChange={(value) => setCamera(value as CameraView)}
          icon={LuEye}
          label="Projection"
          description="Camera projection mode"
        />
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Light
          <select aria-label="Lighting" value={lightingId} onChange={(e) => setLightingId(e.target.value)} className={SELECT}>
            {LIGHTING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <IconButton icon={LuRuler} label={measure ? 'Stop measuring' : 'Measure (M)'} size="sm" aria-pressed={measure} onClick={() => runUi('measure')} />
        <IconButton icon={LuScan} label="Frame selection (F)" size="sm" onClick={() => setFrameTick((n) => n + 1)} />
        <IconButton icon={LuRotateCcw} label="Reset camera" size="sm" onClick={() => setResetTick((n) => n + 1)} />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <IconButton icon={LuUndo2} label="Undo (Cmd/Ctrl+Z)" size="sm" disabled={!canUndo(state)} onClick={() => dispatch({ type: 'undo' })} />
        <IconButton icon={LuRedo2} label="Redo (Cmd/Ctrl+Shift+Z)" size="sm" disabled={!canRedo(state)} onClick={() => dispatch({ type: 'redo' })} />
        <IconButton icon={LuCircleHelp} label="Keyboard shortcuts (?)" size="sm" aria-pressed={help} onClick={() => setHelp((on) => !on)} />
        <button
          type="button"
          disabled={(!isDirty(state) && !sculptState?.unsaved && !paintState?.unsaved) || saving}
          onClick={() => void save()}
          className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuSave aria-hidden className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : isDirty(state) || sculptState?.unsaved || paintState?.unsaved ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-muted/40 to-background">
        {webgl ? (
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => !measure && !sculpting && !painting && dispatch({ type: 'select', index: null })}
            data-testid="model-canvas"
          >
            <EditorScene
              state={state}
              dispatch={dispatch}
              scene={display}
              mode={mode}
              shade={shade}
              xray={xray}
              grid={grid}
              axes={axes}
              dimensions={dimensions}
              camera={camera}
              resetTick={resetTick}
              frameTick={frameTick}
              lighting={lighting}
              snap={snap}
              shift={shift}
              measure={measure}
              sculpting={sculpting || painting}
              measurePoints={points}
              onMeasurePoint={(p) => setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]))}
            />
            {sculpting && sculpt && sculptState && sculptMatrix ? (
              <SculptLayer
                controller={sculpt}
                snapshot={sculptState}
                toWorld={sculptMatrix}
                color={sculptLook?.color ?? '#b0b0b0'}
                roughness={sculptLook?.material.roughness ?? 0.6}
                metalness={sculptLook?.material.metalness ?? 0}
                wireframe={shade === 'wireframe'}
                xray={xray}
              />
            ) : null}
            {painting && paint && paintState && paintMatrix ? <PaintLayer controller={paint} snapshot={paintState} spec={spec} toWorld={paintMatrix} wireframe={shade === 'wireframe'} xray={xray} /> : null}
            {rigged && pose ? <RigOverlay model={rigged} scene={display} pose={pose} view={rigView} onView={onRigView} /> : null}
          </Canvas>
        ) : (
          <p role="alert" className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
            The 3D viewport needs WebGL, which is unavailable here. You can still edit parts with the fields below.
          </p>
        )}
        <MediaPaneToggles tab="model" hasDetail />
        <ViewportWidgets
          mode={mode}
          onModeChange={setMode}
          snap={snap}
          onSnapChange={setSnap}
          grid={grid}
          onGridToggle={() => setGrid((on) => !on)}
          axes={axes}
          onAxesToggle={() => setAxes((on) => !on)}
          dimensions={dimensions}
          onDimensionsToggle={() => setDimensions((on) => !on)}
        />
        <div className="pointer-events-none absolute bottom-1 left-2 flex flex-col gap-0.5 text-[10px] tabular-nums text-muted-foreground" data-testid="model-stats">
          <span>
            {scene.stats.parts} {scene.stats.parts === 1 ? 'mesh' : 'meshes'} · {scene.stats.triangles.toLocaleString()} tris · {scene.stats.vertices.toLocaleString()} verts
          </span>
          {box ? (
            <span>
              {selection.length > 0 ? `Selection ${formatSize(sizeOf(box))} m` : `Size ${formatSize(sizeOf(box))} m`}
              {measure ? ` · measuring${measured !== null ? ` ${measured.toFixed(3)} m` : points.length === 1 ? ': pick a second point' : ': pick a point'}` : ''}
            </span>
          ) : null}
        </div>
        {errors.length > 0 ? (
          <div className="absolute left-2 top-12 max-w-[70%] text-[11px]">
            <button
              type="button"
              onClick={() => setWarningsOpen((on) => !on)}
              aria-expanded={warningsOpen}
              className="rounded-md border border-amber-500/50 bg-background/90 px-2 py-0.5 text-amber-500 shadow"
            >
              {errors.length} {errors.length === 1 ? 'warning' : 'warnings'}
            </button>
            {warningsOpen ? (
              <ul role="status" aria-label="Warnings" className="mt-1 max-h-32 overflow-auto rounded-md border border-border bg-background/95 p-1.5 shadow">
                {errors.map((issue, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-mono text-[10px] text-foreground">{issue.path}</span> {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {saveError ? (
          <p role="alert" className="absolute bottom-6 left-2 rounded-md border border-destructive/50 bg-background/95 px-2 py-0.5 text-[11px] text-destructive shadow">
            {saveError}
          </p>
        ) : null}
        {help ? <ShortcutHelp onClose={() => setHelp(false)} /> : null}
      </div>

      {rigged && (spec.animations?.length ?? 0) > 0 ? <ClipTimeline spec={spec} view={rigView} onView={onRigView} /> : null}
      <ModelInspector
        state={state}
        dispatch={dispatch}
        issues={errors}
        {...(onConvert ? { onConvert } : {})}
        {...(sdfBaker ? { sdf: { baker: sdfBaker, onPreview: setSdfPreview } } : {})}
        {...(sculpt && sculptState ? { sculpt: { controller: sculpt, snapshot: sculptState } } : {})}
        {...(paint && paintState ? { paint: { controller: paint, snapshot: paintState } } : {})}
        rig={{ view: rigView, onView: onRigView, model: rigged, scene, ...(retargetSources ? { sources: retargetSources } : {}) }}
      />
    </div>
  );
}

