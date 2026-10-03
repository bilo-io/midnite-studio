import { Canvas, useThree } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
import type { ModelPart } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent } from 'react';
import { LuAxis3D, LuGrid3X3, LuMove3D, LuRedo2, LuRotate3D, LuRotateCcw, LuSave, LuScale3D, LuUndo2 } from 'react-icons/lu';
import { Box3, Vector3, type Mesh, type Object3D } from 'three';

import { IconButton } from '../../../components/icon-button';
import { Tooltip } from '../../../components/tooltip';
import { canRedo, canUndo, isDirty, tidyVec, type EditorAction, type EditorState } from './editor-state';
import { ModelInspector } from './model-inspector';
import { framingFor } from './model-utils';
import { createPartGeometry, geometryKey } from './spec-geometry';

/**
 * The Models tab's 3D editor (lazy chunk): react-three-fiber + drei. Renders
 * the design's parts, lets you pick one (click it, or the parts list), move /
 * rotate / scale it with a gizmo (W / E / R), and switch between solid,
 * wireframe and normals views. Every change goes through the pure
 * `editorReducer`, so undo/redo and the exported/saved spec are exact.
 *
 * The canvas draws on demand (`frameloop="demand"`): an idle editor is idle.
 */
type Mode = 'translate' | 'rotate' | 'scale';
type View = 'solid' | 'wireframe' | 'normals';

const MODES: { id: Mode; key: string; label: string; icon: typeof LuMove3D }[] = [
  { id: 'translate', key: 'W', label: 'Move', icon: LuMove3D },
  { id: 'rotate', key: 'E', label: 'Rotate', icon: LuRotate3D },
  { id: 'scale', key: 'R', label: 'Scale', icon: LuScale3D },
];
const VIEWS: { id: View; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'wireframe', label: 'Wireframe' },
  { id: 'normals', label: 'Normals' },
];

export const canUseWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

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
  const [mode, setMode] = useState<Mode>('translate');
  const [view, setView] = useState<View>('solid');
  const [grid, setGrid] = useState(true);
  const [axes, setAxes] = useState(true);
  const [resetTick, setResetTick] = useState(0);
  const webgl = useMemo(canUseWebGL, []);
  const { spec, selected } = state;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
    } else if (mod && key === 'y') {
      event.preventDefault();
      dispatch({ type: 'redo' });
    } else if (mod && key === 's') {
      event.preventDefault();
      if (isDirty(state)) onSave();
    } else if (!mod && key === 'w') setMode('translate');
    else if (!mod && key === 'e') setMode('rotate');
    else if (!mod && key === 'r') setMode('scale');
    else if (key === 'escape') dispatch({ type: 'select', index: null });
    else if ((key === 'delete' || key === 'backspace') && selected !== null) {
      event.preventDefault();
      dispatch({ type: 'remove', index: selected });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col outline-none" tabIndex={0} onKeyDown={onKeyDown} data-testid="model-editor" aria-label="3D editor">
      <div role="toolbar" aria-label="Editor tools" className="flex h-9 shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-2">
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
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <div role="radiogroup" aria-label="View mode" className="flex items-center gap-0.5">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              onClick={() => setView(id)}
              className={`h-6 rounded-md px-1.5 text-[11px] ${view === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <IconButton icon={LuGrid3X3} label={grid ? 'Hide grid' : 'Show grid'} size="sm" onClick={() => setGrid((on) => !on)} />
        <IconButton icon={LuAxis3D} label={axes ? 'Hide axes' : 'Show axes'} size="sm" onClick={() => setAxes((on) => !on)} />
        <IconButton icon={LuRotateCcw} label="Reset camera" size="sm" onClick={() => setResetTick((n) => n + 1)} />
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        <IconButton icon={LuUndo2} label="Undo (Cmd/Ctrl+Z)" size="sm" disabled={!canUndo(state)} onClick={() => dispatch({ type: 'undo' })} />
        <IconButton icon={LuRedo2} label="Redo (Cmd/Ctrl+Shift+Z)" size="sm" disabled={!canRedo(state)} onClick={() => dispatch({ type: 'redo' })} />
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
            camera={{ fov: 40, near: 0.01, far: 2000, position: [3, 2.5, 4] }}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => dispatch({ type: 'select', index: null })}
            data-testid="model-canvas"
          >
            <Scene
              parts={spec.parts}
              selected={selected}
              mode={mode}
              view={view}
              grid={grid}
              axes={axes}
              resetTick={resetTick}
              onSelect={(index) => dispatch({ type: 'select', index })}
              onTransform={(index, patch) => dispatch({ type: 'patch', index, patch })}
            />
          </Canvas>
        ) : (
          <p role="alert" className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
            The 3D viewport needs WebGL, which is unavailable here. You can still edit parts with the fields below.
          </p>
        )}
      </div>

      <ModelInspector
        parts={spec.parts}
        selected={selected}
        onSelect={(index) => dispatch({ type: 'select', index })}
        onPatch={(index, patch) => dispatch({ type: 'patch', index, patch })}
        onDuplicate={(index) => dispatch({ type: 'duplicate', index })}
        onRemove={(index) => dispatch({ type: 'remove', index })}
      />
    </div>
  );
}

type SceneProps = {
  parts: readonly ModelPart[];
  selected: number | null;
  mode: Mode;
  view: View;
  grid: boolean;
  axes: boolean;
  resetTick: number;
  onSelect: (index: number) => void;
  onTransform: (index: number, patch: Pick<ModelPart, 'position' | 'rotation' | 'scale'>) => void;
};

function Scene({ parts, selected, mode, view, grid, axes, resetTick, onSelect, onTransform }: SceneProps) {
  const group = useRef<Object3D>(null);
  const meshes = useRef<(Mesh | null)[]>([]);
  const [target, setTarget] = useState<Object3D | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  // The gizmo attaches to whichever mesh is selected; re-resolve after every commit.
  useEffect(() => {
    setTarget(selected !== null ? (meshes.current[selected] ?? null) : null);
  }, [selected, parts]);
  useEffect(() => invalidate(), [parts, view, grid, axes, invalidate]);

  const commitTransform = () => {
    if (selected === null || !target) return;
    const degrees = (r: number) => (r * 180) / Math.PI;
    onTransform(selected, {
      position: tidyVec(target.position.toArray()),
      rotation: tidyVec([degrees(target.rotation.x), degrees(target.rotation.y), degrees(target.rotation.z)]),
      // A drag through zero would flip the part inside out; the schema wants positive scale.
      scale: tidyVec(target.scale.toArray().map((s) => Math.max(Math.abs(s), 0.01))),
    });
  };

  return (
    <>
      <hemisphereLight args={[0xffffff, 0x666677, 1.6]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 8, 5]} intensity={1.7} />
      {grid ? (
        <Grid args={[20, 20]} cellSize={0.5} sectionSize={2.5} cellColor="#555" sectionColor="#888" fadeDistance={30} infiniteGrid />
      ) : null}
      {axes ? <axesHelper args={[1.5]} /> : null}
      <group ref={group}>
        {parts.map((part, index) => (
          <PartMesh
            key={index}
            part={part}
            view={view}
            selected={index === selected}
            register={(mesh) => {
              meshes.current[index] = mesh;
            }}
            onSelect={() => onSelect(index)}
          />
        ))}
      </group>
      {target ? <TransformControls object={target} mode={mode} onMouseUp={commitTransform} /> : null}
      <OrbitControls makeDefault enableDamping={false} />
      <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
        <GizmoViewport axisColors={['#e5484d', '#30a46c', '#3e63dd']} labelColor="white" />
      </GizmoHelper>
      <CameraRig group={group} parts={parts} resetTick={resetTick} />
    </>
  );
}

function PartMesh({
  part,
  view,
  selected,
  register,
  onSelect,
}: {
  part: ModelPart;
  view: View;
  selected: boolean;
  register: (mesh: Mesh | null) => void;
  onSelect: () => void;
}) {
  const key = geometryKey(part);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the geometry's identity
  const geometry = useMemo(() => createPartGeometry(part), [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const degrees = (d: number) => (d * Math.PI) / 180;
  return (
    <mesh
      ref={register}
      geometry={geometry}
      position={part.position}
      rotation={[degrees(part.rotation[0]), degrees(part.rotation[1]), degrees(part.rotation[2])]}
      scale={part.scale}
      userData={{ part: part.name }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {view === 'normals' ? <meshNormalMaterial /> : <meshStandardMaterial color={part.color} roughness={0.6} metalness={0.05} wireframe={view === 'wireframe'} />}
      {selected ? <Edges threshold={20} color="#4f9dff" /> : null}
    </mesh>
  );
}

/** Frames the whole design on mount, when a different design loads, and on "Reset camera". */
function CameraRig({ group, parts, resetTick }: { group: React.RefObject<Object3D | null>; parts: readonly ModelPart[]; resetTick: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const framedFor = useRef<string | null>(null);
  const lastTick = useRef(resetTick);
  const designKey = parts.map((p) => p.shape).join(',') + parts.length;

  useEffect(() => {
    const forced = lastTick.current !== resetTick;
    lastTick.current = resetTick;
    if (!forced && framedFor.current !== null) return;
    const object = group.current;
    if (!object || !controls || size.width === 0) return;
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const extent = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const framing = framingFor({ size: [extent.x, extent.y, extent.z], center: [center.x, center.y, center.z], fovDeg: 40, aspect: size.width / size.height });
    camera.position.set(...framing.position);
    camera.near = framing.near;
    camera.far = framing.far;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    framedFor.current = designKey;
    invalidate();
  }, [resetTick, controls, size.width, size.height, camera, group, designKey, invalidate]);
  return null;
}
