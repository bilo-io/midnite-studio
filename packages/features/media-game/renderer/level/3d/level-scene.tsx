import { Edges, GizmoHelper, GizmoViewport, OrbitControls, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { effectiveStep, type SnapSettings, type TransformMode } from '@midnite/studio-frame/viewport3d';
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  Fog,
  Frustum,
  GridHelper,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Sphere,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Material,
  type Mesh,
  type PerspectiveCamera as ThreePerspectiveCamera,
  type Texture,
} from 'three';

import { blendPose, cameraPosition, dollyOffset, poseFromCamera, TRANSITION_MS, type CameraPose } from './camera-transition';
import { cull, groundTiles, itemRadius, tileInReach, type GroundTile, type ViewStats } from './level-cull';
import { fogRange } from './level-lod';
import type { GizmoChange, WorldItem } from './level-world';
import type { ModelCache } from './model-cache';
import type { OptimisationPreset } from './optimisation';
import type { SpatialGrid } from './spatial-grid';

export const SCENE_BACKGROUND = '#1d1f24';
const TYPE_COLOURS: Record<string, string> = { spawn: '#22c55e', exit: '#3b82f6', light: '#facc15', prop: '#9aa3b2', collider: '#f97316', trigger: '#a855f7', path: '#38bdf8' };
const colourOf = (type: string): string => TYPE_COLOURS[type] ?? '#c084fc';
/** Tiled writes `#aarrggbb`; three reads `#rrggbb`. */
const cssColour = (c: string): string => (/^#[0-9a-f]{8}$/i.test(c) ? `#${c.slice(3)}` : c);

export type CameraMove = { from: CameraPose; to: CameraPose; startedAt: number | null; onDone?: () => void };

export type LevelSceneProps = {
  items: readonly WorldItem[];
  grid: SpatialGrid;
  bounds: GroundTile;
  ground: number;
  drape: string | null;
  selected: number | null;
  /** `null`: no gizmo (read-only, or Place). */
  gizmo: TransformMode | null;
  snap: SnapSettings;
  preset: OptimisationPreset;
  placing: boolean;
  cache: ModelCache<Object3D>;
  initialPose: CameraPose;
  /** Set to animate the camera (the Floorplan ↔ 3D switch, F to frame). */
  move: MutableRefObject<CameraMove | null>;
  /** The live pose, kept current for the switch back to Floorplan. */
  poseOut: MutableRefObject<CameraPose | null>;
  /** Bumps whenever something outside the camera changes what is drawn (a model landed). */
  dirtyTick: number;
  onPick: (index: number | null) => void;
  onPlace: (x: number, z: number) => void;
  onGizmoEnd: (change: GizmoChange) => void;
  onStats: (stats: ViewStats) => void;
};

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler(0, 0, 0, 'YXZ');
const v = new Vector3();
const s = new Vector3();
const colour = new Color();
const sphere = new Sphere();

function composeItem(item: WorldItem, out: Matrix4): Matrix4 {
  e.set(item.pitch, item.yaw, item.roll, 'YXZ');
  q.setFromEuler(e);
  return out.compose(v.set(item.position[0], item.position[1], item.position[2]), q, s.set(Math.max(item.size[0], 0.01), Math.max(item.size[1], 0.01), Math.max(item.size[2], 0.01)));
}

/** A model clone placed as the item: natural size × the item's `scale`, base on the item's base. */
function placeModel(target: Object3D, item: WorldItem): void {
  target.position.set(item.position[0], item.position[1], item.position[2]);
  target.rotation.set(item.pitch, item.yaw, item.roll, 'YXZ');
  target.scale.setScalar(item.scale);
}

/** One ground tile: a flat grid of `segments`² quads at `y`, its UVs a window onto the whole level's drape. */
function tileGeometry(tile: GroundTile, all: GroundTile, y: number, segments: number): BufferGeometry {
  const w = tile.maxX - tile.minX, h = tile.maxZ - tile.minZ;
  const g = new PlaneGeometry(w, h, segments, segments).rotateX(-Math.PI / 2).translate(tile.minX + w / 2, y, tile.minZ + h / 2);
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const W = all.maxX - all.minX || 1, H = all.maxZ - all.minZ || 1;
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - all.minX) / W;
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - all.minZ) / H;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

function disposeTree(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) mat.dispose();
  });
}

/** Everything inside the 3D view's R3F canvas (Phase 136 Themes C, D, F). */
export function LevelScene(props: LevelSceneProps) {
  const { items, preset, selected } = props;
  const camera = useThree((st) => st.camera) as ThreePerspectiveCamera;
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const size = useThree((st) => st.size);
  const setDpr = useThree((st) => st.setDpr);
  const invalidate = useThree((st) => st.invalidate);
  const controls = useThree((st) => st.controls) as unknown as { target: Vector3; update: () => void; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void } | null;

  const dirty = useRef(true);
  const markDirty = () => {
    dirty.current = true;
    invalidate();
  };
  useEffect(markDirty, [items, preset, selected, props.dirtyTick, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- what is drawn: instanced boxes, model clones, lights, ground tiles ---------------------
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const boxMaterial = useMemo(() => new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }), []);
  const boxes = useMemo(() => {
    const mesh = new InstancedMesh(unitBox, boxMaterial, Math.max(1, items.length));
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.setColorAt(0, colour.set('#ffffff'));
    return mesh;
  }, [items.length, unitBox, boxMaterial]);
  useEffect(() => () => boxes.dispose(), [boxes]);
  useEffect(() => () => {
    unitBox.dispose();
    boxMaterial.dispose();
  }, [unitBox, boxMaterial]);
  /** Instance id → item index, as of the last cull. */
  const boxItems = useRef<number[]>([]);
  const modelsGroup = useRef<Group>(null);
  const clones = useRef(new Map<number, { name: string; object: Object3D }>());
  const lightPool = useMemo(() => Array.from({ length: 16 }, () => new PointLight('#ffffff', 0, 10, 2)), []);
  const sun = useMemo(() => {
    const light = new DirectionalLight('#ffffff', 1.4);
    light.shadow.mapSize.set(2048, 2048);
    return light;
  }, []);
  const tilesGroup = useRef<Group>(null);
  const drape = useMemo<Texture | null>(() => {
    if (!props.drape) return null;
    const t = new TextureLoader().load(props.drape, () => invalidate());
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [props.drape, invalidate]);
  useEffect(() => () => drape?.dispose(), [drape]);
  const groundMaterial = useMemo(() => new MeshStandardMaterial({ color: drape ? '#ffffff' : '#2b3038', map: drape, roughness: 1 }), [drape]);
  useEffect(() => () => groundMaterial.dispose(), [groundMaterial]);
  const tiles = useMemo(() => {
    const list = groundTiles(props.bounds, preset.terrainTile);
    return list.map((tile) => ({ tile, geometry: tileGeometry(tile, props.bounds, props.ground, preset.terrainSegments) }));
  }, [props.bounds, props.ground, preset.terrainTile, preset.terrainSegments]);
  useEffect(() => () => tiles.forEach((t) => t.geometry.dispose()), [tiles]);
  const grids = useMemo(() => {
    const w = props.bounds.maxX - props.bounds.minX, h = props.bounds.maxZ - props.bounds.minZ;
    const side = Math.ceil(Math.max(w, h));
    const fine = side <= 400 ? new GridHelper(side, side, '#3a3f48', '#3a3f48') : null;
    const bold = new GridHelper(Math.ceil(side / 10) * 10, Math.ceil(side / 10), '#5b616c', '#5b616c');
    for (const g of [fine, bold]) g?.position.set(props.bounds.minX + side / 2, props.ground + 0.01, props.bounds.minZ + side / 2);
    bold.position.set(props.bounds.minX + Math.ceil(side / 10) * 5, props.ground + 0.02, props.bounds.minZ + Math.ceil(side / 10) * 5);
    return [fine, bold].filter((g): g is GridHelper => g !== null);
  }, [props.bounds, props.ground]);
  useEffect(() => () => grids.forEach((g) => g.dispose()), [grids]);
  const paths = useMemo(() => {
    const pts: number[] = [];
    for (const item of items) {
      if (!item.path) continue;
      for (let i = 1; i < item.path.length; i++) {
        const a = item.path[i - 1]!, b = item.path[i]!;
        pts.push(a[0], item.position[1] + 0.05, a[1], b[0], item.position[1] + 0.05, b[1]);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }, [items]);
  useEffect(() => () => paths.dispose(), [paths]);

  // Settings the slider owns: pixel ratio and shadows, live.
  useEffect(() => {
    setDpr(Math.min(preset.pixelRatio, Math.max(0.5, window.devicePixelRatio || 1)));
  }, [preset.pixelRatio, setDpr]);
  useEffect(() => {
    if (gl.shadowMap.enabled === preset.shadows) return;
    gl.shadowMap.enabled = preset.shadows;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) mat.needsUpdate = true;
    });
    invalidate();
  }, [preset.shadows, gl, scene, invalidate]);
  useEffect(() => {
    scene.fog = new Fog(SCENE_BACKGROUND, 1e6, 1e6 + 1);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  useEffect(
    () => () => {
      for (const { object } of clones.current.values()) object.removeFromParent();
      clones.current.clear();
    },
    [],
  );

  // --- the camera: initial pose, controls changes, moves ------------------------------------
  useLayoutEffect(() => {
    const pose = props.initialPose;
    camera.fov = pose.fov;
    camera.position.set(...cameraPosition(pose));
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...pose.target);
      controls.update();
    }
    markDirty();
    // Only the first pose: later ones come through `move`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);
  useEffect(() => {
    if (!controls) return;
    const onChange = () => markDirty();
    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  const frustum = useMemo(() => new Frustum(), []);
  const stats = useRef({ frames: 0, since: performance.now(), visible: 0, models: 0, sweptAt: performance.now() });

  useFrame(() => {
    const now = performance.now();
    const move = props.move.current;
    if (move && controls) {
      if (move.startedAt === null) move.startedAt = now;
      const t = (now - move.startedAt) / TRANSITION_MS;
      const pose = blendPose(move.from, move.to, t);
      camera.fov = pose.fov;
      camera.position.set(...cameraPosition(pose));
      controls.target.set(...pose.target);
      camera.lookAt(controls.target);
      controls.update();
      dirty.current = true;
      if (t >= 1) {
        props.move.current = null;
        move.onDone?.();
      }
      invalidate();
    }
    const target = controls?.target ?? new Vector3();
    const pose = poseFromCamera([camera.position.x, camera.position.y, camera.position.z], [target.x, target.y, target.z], camera.fov);
    props.poseOut.current = pose;

    if (dirty.current) {
      dirty.current = false;
      const offset = dollyOffset(pose);
      const distance = camera.position.distanceTo(target);
      camera.near = Math.max(0.05, distance / 2000);
      camera.far = distance + preset.drawDistance * 1.5 + 50;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const focus: [number, number, number] = [target.x, target.y, target.z];
      const result = cull({
        items,
        grid: props.grid,
        camera: [camera.position.x, camera.position.y, camera.position.z],
        focus,
        offset,
        fovDeg: camera.fov,
        viewportHeight: size.height,
        preset,
        exclude: selected,
        modelFailed: (name) => props.cache.failed(name),
        inFrustum: (item) => frustum.intersectsSphere(sphere.set(v.set(item.position[0], item.position[1] + item.size[1] / 2, item.position[2]), itemRadius(item))),
      });
      // Models: a clone per item in range; one still loading draws as its box meanwhile.
      const drawn = new Set<number>();
      const boxList = result.boxes;
      for (const index of result.models) {
        const item = items[index]!;
        const template = props.cache.request(item.model!);
        if (!template) {
          boxList.push(index);
          continue;
        }
        drawn.add(index);
        let entry = clones.current.get(index);
        if (entry && entry.name !== item.model) {
          entry.object.removeFromParent();
          entry = undefined;
        }
        if (!entry) {
          const object = template.clone(true);
          object.userData.itemIndex = index;
          object.traverse((c) => {
            c.castShadow = true;
            c.receiveShadow = true;
          });
          entry = { name: item.model!, object };
          clones.current.set(index, entry);
          modelsGroup.current?.add(object);
        }
        placeModel(entry.object, item);
      }
      for (const [index, entry] of clones.current) {
        if (drawn.has(index)) continue;
        entry.object.removeFromParent();
        clones.current.delete(index);
      }
      // Boxes: one instanced draw.
      boxItems.current = boxList;
      for (let k = 0; k < boxList.length; k++) {
        const item = items[boxList[k]!]!;
        boxes.setMatrixAt(k, composeItem(item, m));
        boxes.setColorAt(k, colour.set(colourOf(item.type)));
      }
      boxes.count = boxList.length;
      boxes.instanceMatrix.needsUpdate = true;
      if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
      boxes.boundingSphere = null;
      // Level lights, nearest first, up to the preset's cap.
      lightPool.forEach((light, i) => {
        const item = i < preset.maxLights ? items[result.lights[i] ?? -1] : undefined;
        if (!item?.light) {
          light.visible = false;
          return;
        }
        light.visible = true;
        light.position.set(item.position[0], item.position[1] + item.size[1], item.position[2]);
        light.color.set(cssColour(item.light.color));
        light.intensity = item.light.intensity * 20;
        light.distance = item.light.range;
      });
      // Ground tiles past the draw distance are not drawn; the sun and its shadow follow the focus.
      tilesGroup.current?.children.forEach((child, i) => {
        const tile = tiles[i]?.tile;
        child.visible = tile ? tileInReach(tile, focus, preset.drawDistance) : false;
      });
      sun.position.set(target.x + 40, target.y + 80, target.z + 30);
      sun.target.position.copy(target);
      sun.target.updateMatrixWorld();
      sun.castShadow = preset.shadows;
      const half = Math.min(preset.drawDistance, 120) / 2;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: 400 });
      sun.shadow.camera.updateProjectionMatrix();
      const fog = scene.fog as Fog | null;
      if (fog) {
        const range = fogRange(preset.drawDistance, offset);
        fog.near = range.near;
        fog.far = range.far;
      }
      stats.current.visible = boxList.length + drawn.size + (selected !== null ? 1 : 0);
      stats.current.models = drawn.size;
    }

    // The readout, twice a second; a sweep of idle models every five.
    stats.current.frames++;
    const elapsed = now - stats.current.since;
    if (elapsed >= 500) {
      props.onStats({ fps: (stats.current.frames * 1000) / elapsed, calls: gl.info.render.calls, triangles: gl.info.render.triangles, visible: stats.current.visible, total: items.length, models: stats.current.models });
      stats.current.frames = 0;
      stats.current.since = now;
    }
    if (now - stats.current.sweptAt > 5000) {
      stats.current.sweptAt = now;
      props.cache.sweep();
    }
  });

  const pickModel = (event: ThreeEvent<MouseEvent>) => {
    let o: Object3D | null = event.object;
    while (o && typeof o.userData.itemIndex !== 'number') o = o.parent;
    if (!o) return;
    event.stopPropagation();
    props.onPick(o.userData.itemIndex as number);
  };

  return (
    <>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <PerspectiveCamera makeDefault fov={props.initialPose.fov} near={0.1} far={5000} />
      <hemisphereLight args={['#dfe7f5', '#3a3326', 0.9]} />
      <ambientLight intensity={0.25} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      {lightPool.map((light, i) => (
        <primitive key={i} object={light} />
      ))}
      <group ref={tilesGroup}>
        {tiles.map(({ geometry }, i) => (
          <mesh
            key={i}
            geometry={geometry}
            material={groundMaterial}
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              if (props.placing) props.onPlace(event.point.x, event.point.z);
              else props.onPick(null);
            }}
          />
        ))}
      </group>
      {grids.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
      <lineSegments geometry={paths}>
        <lineBasicMaterial color={TYPE_COLOURS.path} />
      </lineSegments>
      <primitive
        object={boxes}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          const index = event.instanceId === undefined ? undefined : boxItems.current[event.instanceId];
          if (index === undefined) return;
          event.stopPropagation();
          props.onPick(index);
        }}
      />
      <group ref={modelsGroup} onClick={pickModel} />
      {selected !== null && items[selected] ? <Selected key={selected} {...props} item={items[selected]} /> : null}
      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.02} />
      <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
        <GizmoViewport axisColors={['#e5484d', '#30a46c', '#3e63dd']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

/**
 * The selected object, drawn on its own under the gizmo (W move, E rotate, R scale). A drag moves only this proxy;
 * releasing commits one edit, so a big level does not re-render per pointer move (Decision 8).
 */
function Selected(props: LevelSceneProps & { item: WorldItem }) {
  const { item } = props;
  const proxy = useRef<Group>(null);
  const shift = useRef(false);
  const invalidate = useThree((st) => st.invalidate);
  const template = item.model ? props.cache.request(item.model) : null;
  const model = useMemo(() => (template ? template.clone(true) : null), [template]);

  useLayoutEffect(() => {
    const p = proxy.current;
    if (!p) return;
    p.position.set(item.position[0], item.position[1], item.position[2]);
    p.rotation.set(item.pitch, item.yaw, item.roll, 'YXZ');
    p.scale.set(1, 1, 1);
    invalidate();
  }, [item, invalidate]);
  useEffect(() => {
    const down = (ev: KeyboardEvent) => (shift.current = ev.shiftKey);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', down);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', down);
    };
  }, []);

  const commit = () => {
    const p = proxy.current;
    if (!p) return;
    const change: GizmoChange = {};
    const eps = 1e-4;
    if (Math.abs(p.position.x - item.position[0]) > eps || Math.abs(p.position.z - item.position[2]) > eps) change.centre = [p.position.x, p.position.z];
    if (Math.abs(p.position.y - item.position[1]) > eps) change.elevation = p.position.y;
    const r = new Euler().setFromQuaternion(p.quaternion, 'YXZ');
    if (Math.abs(r.y - item.yaw) > eps) change.yaw = r.y;
    if (Math.abs(r.x - item.pitch) > eps) change.pitch = r.x;
    if (Math.abs(r.z - item.roll) > eps) change.roll = r.z;
    if (Math.abs(p.scale.x - 1) > eps || Math.abs(p.scale.y - 1) > eps || Math.abs(p.scale.z - 1) > eps) {
      if (item.kind === 'point') change.scale = (item.scale * (p.scale.x + p.scale.y + p.scale.z)) / 3;
      else change.size = [item.size[0] * p.scale.x, item.size[1] * p.scale.y, item.size[2] * p.scale.z];
    }
    if (Object.keys(change).length > 0) props.onGizmoEnd(change);
  };

  const step = (value: number, fallback: number) => effectiveStep(value, shift.current, fallback);
  return (
    <>
      <group ref={proxy}>
        {model ? (
          <primitive object={model} scale={item.scale} />
        ) : (
          <mesh position={[0, item.size[1] / 2, 0]} scale={[Math.max(item.size[0], 0.01), Math.max(item.size[1], 0.01), Math.max(item.size[2], 0.01)]} castShadow>
            <boxGeometry />
            <meshStandardMaterial color={colourOf(item.type)} roughness={0.8} />
            <Edges color="#f5a524" />
          </mesh>
        )}
      </group>
      {props.gizmo && proxy.current ? (
        <TransformControls
          object={proxy.current}
          mode={props.gizmo}
          space={props.gizmo === 'translate' ? 'world' : 'local'}
          translationSnap={step(props.snap.grid, 0.1) || null}
          rotationSnap={step(props.snap.angle, 15) ? (step(props.snap.angle, 15) * Math.PI) / 180 : null}
          scaleSnap={step(props.snap.scale, 0.05) || null}
          onMouseUp={commit}
        />
      ) : (
        <GizmoReady />
      )}
    </>
  );
}

/** Renders once more after mount, so the gizmo attaches to the proxy the first render created. */
function GizmoReady() {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => invalidate(), [invalidate]);
  return null;
}

export { disposeTree };
