import { Edges, GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { MeshPart } from '@midnite/studio-shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { Box3, Matrix4, MOUSE, Object3D, PMREMGenerator, Vector3, type Mesh } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { movableSelection, type EditorAction, type EditorState } from './editor-state';
import type { LightingPreset } from './lighting';
import { boundsOf, centreOf, distanceBetween, formatSize, orthoZoom, sizeOf, VIEW_DIRECTIONS, VIEW_PLANE, type CameraView } from './scene-bounds';
import { effectiveStep, type SnapSettings } from './snap';
import { assetTexture } from './model-assets';
import { editorScene, meshGeometry, type EditorScene } from './spec-geometry';
import { anchorWorld, withDescendants } from './spec-edit';
import { framingFor } from './model-utils';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type ShadeMode = 'solid' | 'wireframe' | 'normals';
export type MeasurePoints = [number, number, number][];

const toRowMajor = (m: Matrix4): number[] => m.clone().transpose().elements.slice();
const fromRowMajor = (a: readonly number[]): Matrix4 => new Matrix4().set(...(a as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));

export type SceneProps = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  scene: EditorScene;
  mode: TransformMode;
  shade: ShadeMode;
  xray: boolean;
  grid: boolean;
  axes: boolean;
  dimensions: boolean;
  camera: CameraView;
  resetTick: number;
  frameTick: number;
  lighting: LightingPreset;
  snap: SnapSettings;
  shift: boolean;
  measure: boolean;
  /** Sculpt mode (Phase 104 Theme D): left-drag belongs to the brush, so no gizmo, no picking, and orbit moves to the right button. */
  sculpting?: boolean;
  measurePoints: MeasurePoints;
  onMeasurePoint: (p: [number, number, number]) => void;
};

/** Sculpt mode's orbit buttons: the left one is the brush's. */
const SCULPT_MOUSE = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };

/** Everything inside the R3F canvas. */
export function EditorScene(props: SceneProps) {
  const { state, scene, camera: cameraView } = props;
  const meshes = useRef<Map<Mesh, number>>(new Map());
  const group = useRef<Object3D>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [state.spec, state.selection, props.shade, props.xray, props.grid, props.axes, props.dimensions, props.lighting, props.measurePoints, invalidate]);

  const selectedSet = useMemo(() => new Set(withDescendants(state.spec, state.selection)), [state.spec, state.selection]);

  return (
    <>
      {cameraView === 'perspective' ? (
        <PerspectiveCamera makeDefault fov={40} near={0.01} far={2000} position={[3, 2.5, 4]} />
      ) : (
        <OrthographicCamera makeDefault near={-5000} far={5000} zoom={80} position={VIEW_DIRECTIONS[cameraView].map((n) => n * 20) as [number, number, number]} />
      )}
      <Lights preset={props.lighting} />
      {props.grid ? <Grid args={[20, 20]} cellSize={0.5} sectionSize={2.5} cellColor="#555" sectionColor="#888" fadeDistance={30} infiniteGrid /> : null}
      {props.axes ? <axesHelper args={[1.5]} /> : null}
      <group ref={group}>
        {scene.parts.map((part, i) => (
          <PartMesh
            key={`${i}:${part.sourceIndex}:${part.role}`}
            part={part}
            shade={props.shade}
            xray={props.xray}
            selected={selectedSet.has(part.sourceIndex)}
            locked={state.spec.parts[part.sourceIndex]?.locked === true}
            registry={meshes.current}
            onPick={(event, point) => {
              if (props.sculpting) return;
              if (props.measure) {
                props.onMeasurePoint(point);
                return;
              }
              const mod = event.shiftKey || event.metaKey || event.ctrlKey;
              if (mod) props.dispatch({ type: 'toggleSelect', index: part.sourceIndex });
              else props.dispatch({ type: 'select', index: part.sourceIndex });
            }}
          />
        ))}
      </group>
      {!props.measure && !props.sculpting ? <Gizmo {...props} meshes={meshes.current} /> : null}
      {props.dimensions ? <Dimensions scene={scene} selection={selectedSet} hasSelection={state.selection.length > 0} /> : null}
      {props.measurePoints.length > 0 ? <MeasureOverlay points={props.measurePoints} /> : null}
      <OrbitControls
        makeDefault
        enableDamping={false}
        enableRotate={cameraView === 'perspective'}
        {...(props.sculpting ? { mouseButtons: SCULPT_MOUSE } : {})}
      />
      <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
        <GizmoViewport axisColors={['#e5484d', '#30a46c', '#3e63dd']} labelColor="white" />
      </GizmoHelper>
      <CameraRig group={group} scene={scene} selectedSet={selectedSet} view={cameraView} resetTick={props.resetTick} frameTick={props.frameTick} designKey={state.source} />
    </>
  );
}

function Lights({ preset }: { preset: LightingPreset }) {
  const gl = useThree((s) => s.gl);
  const three = useThree((s) => s.scene);
  // A generated room environment (no network): metals need something to reflect.
  useEffect(() => {
    if (preset.environment <= 0) {
      three.environment = null;
      return;
    }
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    three.environment = target.texture;
    three.environmentIntensity = preset.environment;
    return () => {
      three.environment = null;
      target.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, three, preset.environment]);
  return (
    <>
      <hemisphereLight args={[preset.hemisphere.sky, preset.hemisphere.ground, preset.hemisphere.intensity]} />
      <ambientLight intensity={preset.ambient} />
      {preset.directional.map((light, i) => (
        <directionalLight key={i} position={light.position} intensity={light.intensity} color={light.color ?? '#ffffff'} />
      ))}
    </>
  );
}

function PartMesh({
  part,
  shade,
  xray,
  selected,
  locked,
  registry,
  onPick,
}: {
  part: MeshPart;
  shade: ShadeMode;
  xray: boolean;
  selected: boolean;
  locked: boolean;
  registry: Map<Mesh, number>;
  onPick: (event: MouseEvent, point: [number, number, number]) => void;
}) {
  const geometry = useMemo(() => meshGeometry(part), [part]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const ref = useRef<Mesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    registry.set(mesh, part.sourceIndex);
    return () => void registry.delete(mesh);
  }, [registry, part.sourceIndex, geometry]);
  const ghost = part.role === 'operand';
  const m = part.material;
  const see = xray || m.opacity < 1;
  // An imported mesh draws with its baked texture; the image decodes once and then asks for a frame.
  const invalidate = useThree((s) => s.invalidate);
  const map = useMemo(() => (part.texture && part.uvs ? assetTexture(part.texture, () => invalidate()) : null), [part.texture, part.uvs, invalidate]);
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      userData={{ sourceIndex: part.sourceIndex, part: part.name }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (locked && !ghost) return;
        onPick(event.nativeEvent, event.point.toArray());
      }}
    >
      {ghost ? (
        <meshBasicMaterial color="#ff6b6b" wireframe transparent opacity={0.55} depthWrite={false} />
      ) : shade === 'normals' ? (
        <meshNormalMaterial transparent={xray} opacity={xray ? 0.4 : 1} depthWrite={!xray} />
      ) : (
        <meshStandardMaterial
          key={map ? 'textured' : 'flat'}
          map={map}
          color={part.color}
          roughness={m.roughness}
          metalness={m.metalness}
          emissive={m.emissive}
          emissiveIntensity={m.emissiveIntensity}
          transparent={see}
          opacity={xray ? Math.min(m.opacity, 0.35) : m.opacity}
          depthWrite={!see}
          wireframe={shade === 'wireframe'}
        />
      )}
      {selected && !ghost ? <Edges threshold={20} color="#4f9dff" /> : null}
    </mesh>
  );
}

/**
 * The transform gizmo. It rides a proxy object placed at the selection's anchor (the parent's
 * world matrix × position/rotation/scale); while dragging, the delta is applied to the moving
 * meshes for instant feedback, and on release each part's local fields are recomputed from its new
 * world anchor in one history step.
 */
function Gizmo({ state, dispatch, mode, snap, shift, meshes }: SceneProps & { meshes: Map<Mesh, number> }) {
  const proxy = useRef<Object3D>(null);
  const [object, setObject] = useState<Object3D | null>(null);
  const start = useRef<Matrix4 | null>(null);
  const tops = useMemo(() => movableSelection(state), [state]);
  const anchors = useMemo(() => tops.map((i) => ({ index: i, matrix: fromRowMajor(anchorWorld(state.spec, i)) })), [state.spec, tops]);
  const moving = useMemo(() => new Set(withDescendants(state.spec, tops)), [state.spec, tops]);

  useLayoutEffect(() => {
    const p = proxy.current;
    if (!p || anchors.length === 0) {
      setObject(null);
      return;
    }
    const m =
      anchors.length === 1
        ? anchors[0]!.matrix.clone()
        : new Matrix4().makeTranslation(
            anchors.reduce((s, a) => s + a.matrix.elements[12]!, 0) / anchors.length,
            anchors.reduce((s, a) => s + a.matrix.elements[13]!, 0) / anchors.length,
            anchors.reduce((s, a) => s + a.matrix.elements[14]!, 0) / anchors.length,
          );
    m.decompose(p.position, p.quaternion, p.scale);
    p.updateMatrix();
    p.updateMatrixWorld(true);
    setObject(p);
  }, [anchors]);

  const delta = (): Matrix4 | null => {
    const p = proxy.current;
    if (!p || !start.current) return null;
    p.updateMatrix();
    return p.matrix.clone().multiply(start.current.clone().invert());
  };
  const applyToMeshes = (m: Matrix4 | null) => {
    for (const [mesh, source] of meshes) {
      if (!moving.has(source)) continue;
      mesh.matrixAutoUpdate = false;
      if (m) mesh.matrix.copy(m);
      else mesh.matrix.identity();
      mesh.matrixWorldNeedsUpdate = true;
    }
  };

  const single = anchors.length === 1;
  return (
    <>
      <object3D ref={proxy} />
      {object ? (
        <TransformControls
          object={object}
          mode={mode}
          space={single && mode !== 'translate' ? 'local' : 'world'}
          translationSnap={effectiveStep(snap.grid, shift, 0.1) || null}
          rotationSnap={effectiveStep(snap.angle, shift, 15) ? (effectiveStep(snap.angle, shift, 15) * Math.PI) / 180 : null}
          scaleSnap={effectiveStep(snap.scale, shift, 0.05) || null}
          onMouseDown={() => {
            const p = proxy.current;
            if (!p) return;
            p.updateMatrix();
            start.current = p.matrix.clone();
          }}
          onObjectChange={() => applyToMeshes(delta())}
          onMouseUp={() => {
            const d = delta();
            start.current = null;
            if (!d) return;
            const items = anchors.map((a) => ({ index: a.index, anchor: toRowMajor(d.clone().multiply(a.matrix)) }));
            applyToMeshes(null);
            dispatch({ type: 'transform', items });
          }}
        />
      ) : null}
    </>
  );
}

function Dimensions({ scene, selection, hasSelection }: { scene: EditorScene; selection: ReadonlySet<number>; hasSelection: boolean }) {
  const box = useMemo(() => boundsOf(scene.parts, hasSelection ? selection : undefined), [scene, selection, hasSelection]);
  if (!box) return null;
  const size = sizeOf(box);
  const centre = centreOf(box);
  const label = (text: string, at: [number, number, number]) => (
    <Html position={at} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <span className="whitespace-nowrap rounded bg-background/85 px-1 py-0.5 text-[10px] tabular-nums text-foreground shadow">{text}</span>
    </Html>
  );
  const corners: [number, number, number][] = [];
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) corners.push([x, y, z]);
  const edges: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return (
    <>
      {edges.map(([a, b], i) => (
        <Line key={i} points={[corners[a]!, corners[b]!]} color="#f5a524" lineWidth={1} dashed dashSize={0.08} gapSize={0.05} />
      ))}
      {label(`W ${formatSize([size[0]])}`, [centre[0], box.min[1], box.max[2]])}
      {label(`H ${formatSize([size[1]])}`, [box.max[0], centre[1], box.max[2]])}
      {label(`D ${formatSize([size[2]])}`, [box.max[0], box.min[1], centre[2]])}
    </>
  );
}

function MeasureOverlay({ points }: { points: MeasurePoints }) {
  const [a, b] = points;
  return (
    <>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshBasicMaterial color="#f5a524" depthTest={false} />
        </mesh>
      ))}
      {a && b ? (
        <>
          <Line points={[a, b]} color="#f5a524" lineWidth={2} depthTest={false} />
          <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center style={{ pointerEvents: 'none' }}>
            <span className="whitespace-nowrap rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground shadow">
              {distanceBetween(a, b).toFixed(3)} m
            </span>
          </Html>
        </>
      ) : null}
    </>
  );
}

/** Frames the design on mount, when a different design loads, on "Reset camera" / "Frame selection", and when the camera view changes. */
function CameraRig({
  group,
  scene,
  selectedSet,
  view,
  resetTick,
  frameTick,
  designKey,
}: {
  group: React.RefObject<Object3D | null>;
  scene: EditorScene;
  selectedSet: ReadonlySet<number>;
  view: CameraView;
  resetTick: number;
  frameTick: number;
  designKey: string;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const framed = useRef<{ key: string; camera: unknown; controls: unknown } | null>(null);
  const lastTicks = useRef({ resetTick, frameTick, view });

  useEffect(() => {
    const forced = lastTicks.current.resetTick !== resetTick || lastTicks.current.frameTick !== frameTick || lastTicks.current.view !== view;
    const selectionFrame = lastTicks.current.frameTick !== frameTick;
    lastTicks.current = { resetTick, frameTick, view };
    const key = `${designKey}|${view}`;
    // A swapped camera (or its freshly built OrbitControls) must be framed again.
    const same = framed.current?.key === key && framed.current.camera === camera && framed.current.controls === controls;
    if (!forced && same) return;
    if (!group.current || !controls || size.width === 0) return;
    // The camera swap lands a render after the view changes: wait for the matching camera.
    if ((view === 'perspective') !== (camera.type === 'PerspectiveCamera')) return;
    const bounds = boundsOf(scene.parts, selectionFrame && selectedSet.size > 0 ? selectedSet : undefined);
    const box = bounds ? new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)) : new Box3().setFromObject(group.current);
    if (box.isEmpty()) return;
    const extent = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    if (camera.type === 'OrthographicCamera' && view !== 'perspective') {
      const direction = VIEW_DIRECTIONS[view];
      const radius = Math.max(extent.length(), 1);
      camera.position.set(centre.x + direction[0] * radius * 4, centre.y + direction[1] * radius * 4, centre.z + direction[2] * radius * 4);
      const [h, v] = VIEW_PLANE[view];
      const dims = [extent.x, extent.y, extent.z];
      (camera as unknown as { zoom: number }).zoom = orthoZoom([dims[h]!, dims[v]!], size);
      camera.near = -radius * 20;
      camera.far = radius * 20;
    } else {
      const framing = framingFor({ size: [extent.x, extent.y, extent.z], center: [centre.x, centre.y, centre.z], fovDeg: 40, aspect: size.width / size.height });
      camera.position.set(...framing.position);
      camera.near = framing.near;
      camera.far = framing.far;
    }
    camera.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    framed.current = { key, camera, controls };
    invalidate();
  }, [resetTick, frameTick, view, controls, camera, size, group, designKey, scene, selectedSet, invalidate]);
  return null;
}

export { editorScene };
