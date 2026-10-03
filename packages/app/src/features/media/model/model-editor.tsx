import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState, type Dispatch, type KeyboardEvent } from 'react';
import {
  LuAxis3D,
  LuCircleHelp,
  LuGrid3X3,
  LuMove3D,
  LuRedo2,
  LuRotate3D,
  LuRotateCcw,
  LuRuler,
  LuSave,
  LuScale3D,
  LuScan,
  LuSquareDashed,
  LuUndo2,
} from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { Tooltip } from '../../../components/tooltip';
import { resolveKey, type UiCommand } from './editor-keys';
import { canRedo, canUndo, isDirty, type EditorAction, type EditorState } from './editor-state';
import { EditorScene, type MeasurePoints, type ShadeMode, type TransformMode } from './editor-scene';
import { DEFAULT_LIGHTING, LIGHTING_PRESETS, lightingById } from './lighting';
import { ModelInspector } from './model-inspector';
import { boundsOf, distanceBetween, formatSize, sizeOf, type CameraView } from './scene-bounds';
import { ShortcutHelp } from './shortcut-help';
import { ANGLE_STEPS, DEFAULT_SNAP, GRID_STEPS, stepAlong, type SnapSettings } from './snap';
import { editorScene } from './spec-geometry';
import { withDescendants } from './spec-edit';

/**
 * The Models tab's 3D editor (lazy chunk): react-three-fiber + drei. The geometry it draws is the
 * exact geometry the files are written from (the shared kernel), so booleans, modifiers, groups
 * and materials look here the way they export. Every change goes through the pure `editorReducer`.
 *
 * The canvas draws on demand (`frameloop="demand"`): an idle editor is idle.
 */
const MODES: { id: TransformMode; key: string; label: string; icon: typeof LuMove3D }[] = [
  { id: 'translate', key: 'W', label: 'Move', icon: LuMove3D },
  { id: 'rotate', key: 'E', label: 'Rotate', icon: LuRotate3D },
  { id: 'scale', key: 'R', label: 'Scale', icon: LuScale3D },
];
const SHADES: { id: ShadeMode; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'wireframe', label: 'Wireframe' },
  { id: 'normals', label: 'Normals' },
];
const CAMERAS: { id: CameraView; key: string; label: string }[] = [
  { id: 'perspective', key: '0', label: 'Perspective' },
  { id: 'front', key: '1', label: 'Front' },
  { id: 'side', key: '2', label: 'Side' },
  { id: 'top', key: '3', label: 'Top' },
];

export const canUseWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

const RADIO = (on: boolean) => `h-6 rounded-md px-1.5 text-[11px] ${on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`;
const SELECT = 'h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground';

export default function ModelEditor({
  state,
  dispatch,
  onSave,
  saving,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onSave: () => void;
  saving: boolean;
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
  const scene = useMemo(() => editorScene(spec), [spec]);
  const lighting = lightingById(lightingId);

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
        if (isDirty(state)) onSave();
        return;
      case 'escape':
        if (help) return setHelp(false);
        if (points.length > 0) return setPoints([]);
        if (measure) return setMeasure(false);
        return dispatch({ type: 'select', index: null });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
    const outcome = resolveKey({ key: event.key, mod: event.metaKey || event.ctrlKey, shift: event.shiftKey, alt: event.altKey }, state, snap.grid);
    if (!outcome) return;
    event.preventDefault();
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
        <div role="radiogroup" aria-label="Transform mode" className="flex items-center gap-0.5">
          {MODES.map(({ id, key, label, icon: Icon }) => (
            <Tooltip key={id} label={`${label} (${key})`}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === id}
                aria-label={label}
                onClick={() => setMode(id)}
                className={`flex h-6 w-6 items-center justify-center rounded-md ${mode === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Snap
          <select aria-label="Grid snap" value={snap.grid} onChange={(e) => setSnap((s) => ({ ...s, grid: Number(e.target.value) }))} className={SELECT}>
            {GRID_STEPS.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Off' : `${s} m`}
              </option>
            ))}
          </select>
          <select aria-label="Angle snap" value={snap.angle} onChange={(e) => setSnap((s) => ({ ...s, angle: Number(e.target.value) }))} className={SELECT}>
            {ANGLE_STEPS.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Off' : `${s}°`}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <div role="radiogroup" aria-label="View mode" className="flex items-center gap-0.5">
          {SHADES.map(({ id, label }) => (
            <button key={id} type="button" role="radio" aria-checked={shade === id} onClick={() => setShade(id)} className={RADIO(shade === id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={xray} onClick={() => setXray((on) => !on)} className={RADIO(xray)} title="X-ray (X)">
          X-ray
        </button>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <div role="radiogroup" aria-label="Camera" className="flex items-center gap-0.5">
          {CAMERAS.map(({ id, key, label }) => (
            <button key={id} type="button" role="radio" aria-checked={camera === id} title={`${label} (${key})`} onClick={() => setCamera(id)} className={RADIO(camera === id)}>
              {label}
            </button>
          ))}
        </div>
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
        <IconButton icon={LuGrid3X3} label={grid ? 'Hide grid' : 'Show grid'} size="sm" onClick={() => setGrid((on) => !on)} />
        <IconButton icon={LuAxis3D} label={axes ? 'Hide axes' : 'Show axes'} size="sm" onClick={() => setAxes((on) => !on)} />
        <IconButton icon={LuSquareDashed} label={dimensions ? 'Hide dimensions' : 'Show dimensions'} size="sm" aria-pressed={dimensions} onClick={() => setDimensions((on) => !on)} />
        <IconButton icon={LuRuler} label={measure ? 'Stop measuring' : 'Measure (M)'} size="sm" aria-pressed={measure} onClick={() => runUi('measure')} />
        <IconButton icon={LuScan} label="Frame selection (F)" size="sm" onClick={() => setFrameTick((n) => n + 1)} />
        <IconButton icon={LuRotateCcw} label="Reset camera" size="sm" onClick={() => setResetTick((n) => n + 1)} />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <IconButton icon={LuUndo2} label="Undo (Cmd/Ctrl+Z)" size="sm" disabled={!canUndo(state)} onClick={() => dispatch({ type: 'undo' })} />
        <IconButton icon={LuRedo2} label="Redo (Cmd/Ctrl+Shift+Z)" size="sm" disabled={!canRedo(state)} onClick={() => dispatch({ type: 'redo' })} />
        <IconButton icon={LuCircleHelp} label="Keyboard shortcuts (?)" size="sm" aria-pressed={help} onClick={() => setHelp((on) => !on)} />
        <button
          type="button"
          disabled={!isDirty(state) || saving}
          onClick={onSave}
          className="ml-auto flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuSave aria-hidden className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : isDirty(state) ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-muted/40 to-background">
        {webgl ? (
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => !measure && dispatch({ type: 'select', index: null })}
            data-testid="model-canvas"
          >
            <EditorScene
              state={state}
              dispatch={dispatch}
              scene={scene}
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
              measurePoints={points}
              onMeasurePoint={(p) => setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]))}
            />
          </Canvas>
        ) : (
          <p role="alert" className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
            The 3D viewport needs WebGL, which is unavailable here. You can still edit parts with the fields below.
          </p>
        )}
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
          <div className="absolute left-2 top-2 max-w-[70%] text-[11px]">
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
        {help ? <ShortcutHelp onClose={() => setHelp(false)} /> : null}
      </div>

      <ModelInspector state={state} dispatch={dispatch} issues={errors} />
    </div>
  );
}

