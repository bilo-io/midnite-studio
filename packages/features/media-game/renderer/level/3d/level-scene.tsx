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
  DoubleSide,
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

import type { GameLevelTerrainDetail, LevelViewCamera } from '@midnite/studio-shared';
import { captureScene, type CapturedPixels } from './level-capture';
import { blendPose, cameraPosition, dollyOffset, poseFromCamera, TRANSITION_MS, type CameraPose } from './camera-transition';
import { cull, groundTiles, itemRadius, tileInReach, type GroundTile, type ViewStats } from './level-cull';
import { detailSegments, gridUnit, reachFor, tileSizeFor } from './level-big';
import { fogRange, viewOffset } from './level-lod';
import type { ScreenPoint } from './level-marquee';
import { DEFAULT_SIZE_Y } from '../level-edit-model';
import { ExtrasView } from './level-extras-view';
import type { SceneExtras } from './level-extras';
import type { GizmoPivot, GizmoSpace } from './level-view-store';
import { nearestEuler, type GizmoChange, type GroupDelta, type GroupPivot, type WorldItem } from './level-world';
import type { ModelCache } from './model-cache';
import type { OptimisationPreset } from './optimisation';
import type { SpatialGrid } from './spatial-grid';

export const SCENE_BACKGROUND = '#1d1f24';
const TYPE_COLOURS: Record<string, string> = { spawn: '#22c55e', exit: '#3b82f6', light: '#facc15', prop: '#9aa3b2', collider: '#f97316', trigger: '#a855f7', path: '#38bdf8' };
const colourOf = (type: string): string => TYPE_COLOURS[type] ?? '#c084fc';
/** Tiled writes `#aarrggbb`; three reads `#rrggbb`. */
const cssColour = (c: string): string => (/^#[0-9a-f]{8}$/i.test(c) ? `#${c.slice(3)}` : c);

/** What the Volume, Path and Rotate tools are drawing right now, in world metres (Phase 137 Theme G). */
export type ToolDraft = {
  volume: { x0: number; z0: number; x1: number; z1: number } | null;
  path: ReadonlyArray<readonly [number, number]>;
  aim: { from: readonly [number, number]; to: readonly [number, number] } | null;
};
export const NO_DRAFT: ToolDraft = { volume: null, path: [], aim: null };

export type CameraMove = { from: CameraPose; to: CameraPose; startedAt: number | null; onDone?: () => void };

export type LevelSceneProps = {
  items: readonly WorldItem[];
  grid: SpatialGrid;
  bounds: GroundTile;
  ground: number;
  drape: string | null;
  /** The area the grid covers: the work, when the ground dwarfs it. */
  focus: GroundTile;
  /** The part of the terrain the level works in, in detail: a sharper drape crop, roads and building outlines. */
  detail: GameLevelTerrainDetail | null;
  /** Item indices of every selected object; every one gets an amber outline. */
  selected: readonly number[];
  /** The selection's pivot (Theme D): where the group gizmo sits when two or more are selected. */
  pivot: GroupPivot | null;
  pivotMode: GizmoPivot;
  space: GizmoSpace;
  /** False while Shift is held with the Select tool: the 3D marquee owns that drag. */
  orbit: boolean;
  /** Set while a gizmo is being dragged, so the marquee leaves the gesture alone. */
  gizmoDragging: MutableRefObject<boolean>;
  /** The pointer's ray for a client position (the tools cast it at the ground and at items). */
  ray: MutableRefObject<((clientX: number, clientY: number) => { origin: [number, number, number]; dir: [number, number, number] } | null) | null>;
  /** Switches the orbit controls on or off for a tool gesture (they stay off while Shift marquees). */
  setOrbit: MutableRefObject<((on: boolean) => void) | null>;
  draft: ToolDraft;
  /** Collider / trigger volumes, the nav-mesh and live ghosts (Phase 140 Themes E to G). */
  extras?: SceneExtras;
  /** Draws the scene once through a temporary camera (`game_level_view`); the live camera never moves. */
  capture: MutableRefObject<((view: LevelViewCamera, width: number, height: number) => CapturedPixels & { visible: number }) | null>;
  /** Projects a world point to the canvas (px), for the marquee. */
  project: MutableRefObject<((p: [number, number, number]) => ScreenPoint) | null>;
  /** `null`: no gizmo (read-only, or Place). */
  gizmo: TransformMode | null;
  snap: SnapSettings;
  preset: OptimisationPreset;
  placing: boolean;
  /** Phase 139 Theme H: a ground ring of `radius` metres; `move` is set by the ring and moves it (null hides it). */
  brush?: { radius: number; move: MutableRefObject<((at: [number, number] | null) => void) | null> } | undefined;
  cache: ModelCache<Object3D>;
  initialPose: CameraPose;
  /** Set to animate the camera (the Floorplan ↔ 3D switch, F to frame). */
  move: MutableRefObject<CameraMove | null>;
  /** The live pose, kept current for the switch back to Floorplan. */
  poseOut: MutableRefObject<CameraPose | null>;
  /** Bumps whenever something outside the camera changes what is drawn (a model landed). */
  dirtyTick: number;
  onPick: (index: number | null, modifier: 'replace' | 'add' | 'toggle') => void;
  /** The item under the pointer (null over ground or nothing): feeds the right-click menu. */
  onHover?: (index: number | null) => void;
  onPlace: (x: number, z: number) => void;
  onGizmoEnd: (change: GizmoChange, inverted: boolean) => void;
  onGroupEnd: (delta: GroupDelta, pivot: GroupPivot, inverted: boolean) => void;
  onStats: (stats: ViewStats) => void;
};

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler(0, 0, 0, 'YXZ');
const v = new Vector3();
const s = new Vector3();
const colour = new Color();
const sphere = new Sphere();
/** A press that travelled further than this (px) was an orbit or a gizmo drag, not a click. */
const CLICK_SLOP_PX = 4;
const wasDrag = (event: ThreeEvent<MouseEvent>): boolean => event.delta > CLICK_SLOP_PX;
/** Mod toggles an object in or out of the selection; Shift adds it (Phase 137 Theme D). */
const modifierOf = (event: ThreeEvent<MouseEvent>): 'replace' | 'add' | 'toggle' => (event.metaKey || event.ctrlKey ? 'toggle' : event.shiftKey ? 'add' : 'replace');

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

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const dirty = useRef(true);
  const markDirty = () => {
    dirty.current = true;
    invalidate();
  };
  useEffect(markDirty, [items, preset, selected, props.dirtyTick, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const orbitAllowed = useRef(props.orbit);
  orbitAllowed.current = props.orbit;
  useEffect(() => {
    props.setOrbit.current = (on) => {
      if (controls) (controls as unknown as { enabled: boolean }).enabled = on && orbitAllowed.current;
    };
    props.ray.current = (clientX, clientY) => {
      const box = gl.domElement.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return null;
      camera.updateMatrixWorld();
      const near = new Vector3(((clientX - box.left) / box.width) * 2 - 1, -(((clientY - box.top) / box.height) * 2 - 1), 0.5).unproject(camera);
      const dir = near.sub(camera.position).normalize();
      return { origin: [camera.position.x, camera.position.y, camera.position.z], dir: [dir.x, dir.y, dir.z] };
    };
    return () => {
      props.setOrbit.current = null;
      props.ray.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, camera, gl]);
  useEffect(markDirty, [props.draft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    props.capture.current = (view, width, height) => {
      // The culling pass ran for the live camera; a fresh pass for the temporary one is not worth a second scene walk.
      const captured = captureScene(gl, scene, view, width, height);
      markDirty();
      return { ...captured, visible: stats.current.visible };
    };
    return () => {
      props.capture.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene]);

  // The marquee's projection: a world point to canvas pixels, and whether it is in front of the camera.
  useEffect(() => {
    const p = new Vector3();
    props.project.current = (point) => {
      camera.updateMatrixWorld();
      p.set(point[0], point[1], point[2]).applyMatrix4(camera.matrixWorldInverse);
      const inFront = p.z < 0;
      p.set(point[0], point[1], point[2]).project(camera);
      return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height, inFront };
    };
    return () => {
      props.project.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size.width, size.height]);

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
    const list = groundTiles(props.bounds, tileSizeFor(props.bounds, preset.terrainTile));
    return list.map((tile) => ({ tile, geometry: tileGeometry(tile, props.bounds, props.ground, preset.terrainSegments) }));
  }, [props.bounds, props.ground, preset.terrainTile, preset.terrainSegments]);
  useEffect(() => () => tiles.forEach((t) => t.geometry.dispose()), [tiles]);
  const grids = useMemo(() => {
    // Over the focus (the work, on a terrain that dwarfs it), in a unit that suits its size: 1 m, 10 m or 100 m
    // fine lines with every tenth bold. A 10 m grid over 10 km was a thousand lines a side, and aliased to noise.
    const w = props.focus.maxX - props.focus.minX, h = props.focus.maxZ - props.focus.minZ;
    const unit = gridUnit(Math.max(w, h));
    const cells = Math.max(1, Math.ceil(Math.max(w, h) / unit));
    const boldCells = Math.max(1, Math.ceil(cells / 10));
    const x0 = Math.floor(props.focus.minX / (unit * 10)) * unit * 10, z0 = Math.floor(props.focus.minZ / (unit * 10)) * unit * 10;
    const fine = cells <= 400 ? new GridHelper(cells * unit, cells, '#3a3f48', '#3a3f48') : null;
    const bold = new GridHelper(boldCells * unit * 10, boldCells, '#5b616c', '#5b616c');
    fine?.position.set(x0 + (cells * unit) / 2, props.ground + 0.01, z0 + (cells * unit) / 2);
    bold.position.set(x0 + boldCells * unit * 5, props.ground + 0.02, z0 + boldCells * unit * 5);
    return [fine, bold].filter((g): g is GridHelper => g !== null);
  }, [props.focus, props.ground]);
  const fineGridReach = 120 * gridUnit(Math.max(props.focus.maxX - props.focus.minX, props.focus.maxZ - props.focus.minZ));

  // The part of the terrain the level works in: a sharper crop of the drape laid just over the ground, and the
  // pack's roads and building outlines as lines.
  const detailDrape = useMemo<Texture | null>(() => {
    if (!props.detail?.preview) return null;
    const t = new TextureLoader().load(props.detail.preview, () => invalidate());
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [props.detail?.preview, invalidate]);
  useEffect(() => () => detailDrape?.dispose(), [detailDrape]);
  const detailPlane = useMemo(() => {
    if (!props.detail || !detailDrape) return null;
    const d = props.detail, w = d.maxX - d.minX, h = d.maxZ - d.minZ;
    const geometry = new PlaneGeometry(w, h).rotateX(-Math.PI / 2).translate(d.minX + w / 2, props.ground + 0.005, d.minZ + h / 2);
    const material = new MeshStandardMaterial({ map: detailDrape, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { geometry, material };
  }, [props.detail, detailDrape, props.ground]);
  useEffect(() => () => {
    detailPlane?.geometry.dispose();
    detailPlane?.material.dispose();
  }, [detailPlane]);
  const detailLines = useMemo(() => {
    if (!props.detail) return null;
    const segments = detailSegments(props.detail, props.ground + 0.04);
    const make = (positions: Float32Array) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(positions, 3));
      return g;
    };
    return { roads: make(segments.roads), buildings: make(segments.buildings) };
  }, [props.detail, props.ground]);
  useEffect(() => () => {
    detailLines?.roads.dispose();
    detailLines?.buildings.dispose();
  }, [detailLines]);
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
  /** The first pose lands on the first frame with controls, on whichever camera is the default by then. */
  const placed = useRef(false);
  useEffect(() => {
    if (!controls) return;
    markDirty();
    const onChange = () => markDirty();
    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // The axis widget renders its own pass, and three resets `info` per render call: counted by hand, the readout
  // covers the whole frame instead of the widget's last pass.
  useEffect(() => {
    const before = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = before;
    };
  }, [gl]);
  const frameInfo = useRef({ calls: 0, triangles: 0 });
  const frustum = useMemo(() => new Frustum(), []);
  const stats = useRef({ frames: 0, since: performance.now(), visible: 0, models: 0, sweptAt: performance.now() });

  useFrame(() => {
    const now = performance.now();
    frameInfo.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
    if (!placed.current && controls) {
      placed.current = true;
      const pose = props.initialPose;
      camera.fov = pose.fov;
      camera.position.set(...cameraPosition(pose));
      controls.target.set(...pose.target);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
      dirty.current = true;
    }
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
      const distance = camera.position.distanceTo(target);
      // Backed off over a big level, the reach grows with the camera's distance (`reachFor`), so an overview shows it.
      const reach = reachFor(preset.drawDistance, distance);
      const offset = viewOffset(distance, dollyOffset(pose), reach);
      camera.near = Math.max(0.05, distance / 2000);
      camera.far = distance + reach * 1.5 + 50;
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
        preset: reach === preset.drawDistance ? preset : { ...preset, drawDistance: reach },
        exclude: selectedSet,
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
        child.visible = tile ? tileInReach(tile, focus, reach) : false;
      });
      // The 1 m grid only close in: from far off its lines alias into stripes.
      if (grids.length > 1) grids[0]!.visible = distance - offset < fineGridReach;
      sun.position.set(target.x + 40, target.y + 80, target.z + 30);
      sun.target.position.copy(target);
      sun.target.updateMatrixWorld();
      sun.castShadow = preset.shadows;
      const half = Math.min(preset.drawDistance, 120) / 2;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, far: 400 });
      sun.shadow.camera.updateProjectionMatrix();
      const fog = scene.fog as Fog | null;
      if (fog) {
        const range = fogRange(reach, offset);
        fog.near = range.near;
        fog.far = range.far;
      }
      stats.current.visible = boxList.length + drawn.size + selected.length;
      stats.current.models = drawn.size;
    }

    // The readout, twice a second; a sweep of idle models every five.
    stats.current.frames++;
    const elapsed = now - stats.current.since;
    if (elapsed >= 500) {
      props.onStats({ fps: (stats.current.frames * 1000) / elapsed, calls: frameInfo.current.calls, triangles: frameInfo.current.triangles, visible: stats.current.visible, total: items.length, models: stats.current.models });
      stats.current.frames = 0;
      stats.current.since = now;
    }
    if (now - stats.current.sweptAt > 5000) {
      stats.current.sweptAt = now;
      props.cache.sweep();
    }
  });

  const pickModel = (event: ThreeEvent<MouseEvent>) => {
    if (wasDrag(event)) return;
    let o: Object3D | null = event.object;
    while (o && typeof o.userData.itemIndex !== 'number') o = o.parent;
    if (!o) return;
    event.stopPropagation();
    props.onPick(o.userData.itemIndex as number, modifierOf(event));
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
            onPointerMove={() => props.onHover?.(null)}
            onClick={(event) => {
              event.stopPropagation();
              if (wasDrag(event)) return;
              if (props.placing) props.onPlace(event.point.x, event.point.z);
              else if (modifierOf(event) === 'replace') props.onPick(null, 'replace');
            }}
          />
        ))}
      </group>
      {detailPlane ? <mesh geometry={detailPlane.geometry} material={detailPlane.material} raycast={() => null} /> : null}
      {detailLines ? (
        <>
          <lineSegments geometry={detailLines.buildings} raycast={() => null}>
            <lineBasicMaterial color="#cbd5e1" transparent opacity={0.55} />
          </lineSegments>
          <lineSegments geometry={detailLines.roads} raycast={() => null}>
            <lineBasicMaterial color="#f1f5f9" transparent opacity={0.8} />
          </lineSegments>
        </>
      ) : null}
      {grids.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
      <lineSegments geometry={paths}>
        <lineBasicMaterial color={TYPE_COLOURS.path} />
      </lineSegments>
      <primitive
        object={boxes}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          props.onHover?.(event.instanceId === undefined ? null : (boxItems.current[event.instanceId] ?? null));
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          const index = event.instanceId === undefined ? undefined : boxItems.current[event.instanceId];
          if (index === undefined || wasDrag(event)) return;
          event.stopPropagation();
          props.onPick(index, modifierOf(event));
        }}
      />
      <group
        ref={modelsGroup}
        onClick={pickModel}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          let o: Object3D | null = event.object;
          while (o && typeof o.userData.itemIndex !== 'number') o = o.parent;
          props.onHover?.(o ? (o.userData.itemIndex as number) : null);
        }}
      />
      {selected.length === 1 && items[selected[0]!] ? <Selected key={selected[0]} {...props} item={items[selected[0]!]!} /> : null}
      {selected.length > 1 && props.pivot ? <GroupSelected {...props} members={selected.map((i) => items[i]!).filter(Boolean)} pivot={props.pivot} /> : null}
      <DraftView draft={props.draft} ground={props.ground} />
      {props.brush ? <BrushRing radius={props.brush.radius} move={props.brush.move} ground={props.ground} /> : null}
      {props.extras ? <ExtrasView items={items} extras={props.extras} ground={props.ground} /> : null}
      <OrbitControls makeDefault enabled={props.orbit} enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.02} />
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
  useLayoutEffect(() => {
    const p = proxy.current;
    if (!p) return;
    p.position.set(item.position[0], item.position[1], item.position[2]);
    p.rotation.set(item.pitch, item.yaw, item.roll, 'YXZ');
    p.scale.set(1, 1, 1);
    invalidate();
  }, [item, invalidate]);
  useEffect(() => {
    // Shift (the frame's fine step) and Alt (Phase 137 Theme F) both invert snapping for the gesture.
    const down = (ev: KeyboardEvent) => (shift.current = ev.shiftKey || ev.altKey);
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
    const e3 = new Euler().setFromQuaternion(p.quaternion, 'YXZ');
    const r = nearestEuler({ yaw: e3.y, pitch: e3.x, roll: e3.z }, item);
    if (Math.abs(r.yaw - item.yaw) > eps) change.yaw = r.yaw;
    if (Math.abs(r.pitch - item.pitch) > eps) change.pitch = r.pitch;
    if (Math.abs(r.roll - item.roll) > eps) change.roll = r.roll;
    if (Math.abs(p.scale.x - 1) > eps || Math.abs(p.scale.y - 1) > eps || Math.abs(p.scale.z - 1) > eps) {
      if (item.kind === 'point') change.scale = (item.scale * (p.scale.x + p.scale.y + p.scale.z)) / 3;
      else change.size = [item.size[0] * p.scale.x, item.size[1] * p.scale.y, item.size[2] * p.scale.z];
    }
    if (Object.keys(change).length > 0) props.onGizmoEnd(change, shift.current);
  };

  const step = (value: number, fallback: number) => effectiveStep(value, shift.current, fallback);
  return (
    <>
      <group ref={proxy}>
        <ItemVisual item={item} cache={props.cache} />
      </group>
      {props.gizmo && proxy.current ? (
        <TransformControls
          object={proxy.current}
          mode={props.gizmo}
          space={props.gizmo === 'translate' ? 'world' : 'local'}
          translationSnap={step(props.snap.grid, 0.1) || null}
          rotationSnap={step(props.snap.angle, 15) ? (step(props.snap.angle, 15) * Math.PI) / 180 : null}
          scaleSnap={step(props.snap.scale, 0.05) || null}
          onMouseDown={() => (props.gizmoDragging.current = true)}
          onMouseUp={() => {
            props.gizmoDragging.current = false;
            commit();
          }}
        />
      ) : (
        <GizmoReady />
      )}
    </>
  );
}

const DRAFT_COLOUR = '#f59e0b';

/** The tools' rubber bands: a translucent volume box, the path so far with its points, and the rotate aim line. */
function DraftView({ draft, ground }: { draft: ToolDraft; ground: number }) {
  const lines = useMemo(() => {
    const pts: number[] = [];
    const seg = (a: readonly [number, number], b: readonly [number, number], y: number) => pts.push(a[0], y, a[1], b[0], y, b[1]);
    for (let i = 1; i < draft.path.length; i++) seg(draft.path[i - 1]!, draft.path[i]!, ground + 0.08);
    if (draft.aim) seg(draft.aim.from, draft.aim.to, ground + 0.1);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }, [draft.path, draft.aim, ground]);
  useEffect(() => () => lines.dispose(), [lines]);
  const v = draft.volume;
  return (
    <>
      {v ? (
        <mesh position={[(v.x0 + v.x1) / 2, ground + DEFAULT_SIZE_Y / 2, (v.z0 + v.z1) / 2]} scale={[Math.max(Math.abs(v.x1 - v.x0), 0.01), DEFAULT_SIZE_Y, Math.max(Math.abs(v.z1 - v.z0), 0.01)]}>
          <boxGeometry />
          <meshBasicMaterial color={DRAFT_COLOUR} transparent opacity={0.25} depthWrite={false} />
        </mesh>
      ) : null}
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={DRAFT_COLOUR} />
      </lineSegments>
      {draft.path.map((p, i) => (
        <mesh key={i} position={[p[0], ground + 0.1, p[1]]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshBasicMaterial color={DRAFT_COLOUR} />
        </mesh>
      ))}
    </>
  );
}

/** A selected item as drawn under a gizmo: its model clone, else its box with the amber outline. */
function ItemVisual({ item, cache }: { item: WorldItem; cache: ModelCache<Object3D> }) {
  const template = item.model ? cache.request(item.model) : null;
  const model = useMemo(() => (template ? template.clone(true) : null), [template]);
  return model ? (
    <primitive object={model} scale={item.scale} />
  ) : (
    <mesh position={[0, item.size[1] / 2, 0]} scale={[Math.max(item.size[0], 0.01), Math.max(item.size[1], 0.01), Math.max(item.size[2], 0.01)]} castShadow>
      <boxGeometry />
      <meshStandardMaterial color={colourOf(item.type)} roughness={0.8} />
      <Edges color="#f5a524" />
    </mesh>
  );
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const degrees = (rad: number): number => (rad * 180) / Math.PI;
const radians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Two or more selected objects under one gizmo (Phase 137 Theme D). Every member is drawn as a child of a pivot
 * group; the gizmo drags that group, so a drag moves only these proxies (Decision 8), and releasing commits one
 * `gizmoEditGroup`. The pivot's frame is its yaw in Local, axis-aligned in World.
 */
function GroupSelected(props: LevelSceneProps & { members: WorldItem[]; pivot: GroupPivot }) {
  const { members, pivot } = props;
  const group = useRef<Group>(null);
  const kids = useRef<Array<Group | null>>([]);
  const shift = useRef(false);
  const invalidate = useThree((st) => st.invalidate);
  const local = props.space === 'local';
  /** The frame the gizmo is oriented by: the pivot's yaw in Local, none in World (three's yaw is Tiled's negated). */
  const frame: GroupPivot = { centre: pivot.centre, yaw: local ? pivot.yaw : 0 };
  const frameYaw = -radians(frame.yaw);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.position.set(...pivot.centre);
    g.rotation.set(0, frameYaw, 0);
    g.scale.set(1, 1, 1);
    g.updateMatrixWorld(true);
    const inverse = new Matrix4().copy(g.matrixWorld).invert();
    const euler = new Euler(0, 0, 0, 'YXZ');
    members.forEach((item, i) => {
      const kid = kids.current[i];
      if (!kid) return;
      euler.set(item.pitch, item.yaw, item.roll, 'YXZ');
      const world = new Matrix4().compose(new Vector3(...item.position), new Quaternion().setFromEuler(euler), new Vector3(1, 1, 1));
      new Matrix4().multiplyMatrices(inverse, world).decompose(kid.position, kid.quaternion, kid.scale);
    });
    invalidate();
  }, [members, pivot, frameYaw, invalidate]);
  useEffect(() => {
    const down = (ev: KeyboardEvent) => (shift.current = ev.shiftKey || ev.altKey);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', down);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', down);
    };
  }, []);

  const commit = () => {
    const g = group.current;
    if (!g) return;
    const eps = 1e-4;
    const delta: GroupDelta = {};
    const t: [number, number, number] = [g.position.x - pivot.centre[0], g.position.y - pivot.centre[1], g.position.z - pivot.centre[2]];
    if (t.some((n) => Math.abs(n) > eps)) delta.translate = t;
    const turn = wrapAngle(new Euler().setFromQuaternion(g.quaternion, 'YXZ').y - frameYaw);
    if (Math.abs(turn) > eps) delta.rotateYaw = Math.round(-degrees(turn) * 1000) / 1000;
    if ([g.scale.x, g.scale.y, g.scale.z].some((n) => Math.abs(n - 1) > eps)) delta.scale = [g.scale.x, g.scale.y, g.scale.z];
    if (Object.keys(delta).length > 0) props.onGroupEnd(delta, frame, shift.current);
  };

  const step = (value: number, fallback: number) => effectiveStep(value, shift.current, fallback);
  const mode = props.gizmo;
  return (
    <>
      <group ref={group}>
        {members.map((item, i) => (
          <group key={item.index} ref={(el) => (kids.current[i] = el)}>
            <ItemVisual item={item} cache={props.cache} />
          </group>
        ))}
      </group>
      {mode && group.current ? (
        <TransformControls
          object={group.current}
          mode={mode}
          space={local ? 'local' : 'world'}
          showX={mode !== 'rotate'}
          showZ={mode !== 'rotate'}
          translationSnap={step(props.snap.grid, 0.1) || null}
          rotationSnap={step(props.snap.angle, 15) ? (step(props.snap.angle, 15) * Math.PI) / 180 : null}
          scaleSnap={step(props.snap.scale, 0.05) || null}
          onMouseDown={() => (props.gizmoDragging.current = true)}
          onMouseUp={() => {
            props.gizmoDragging.current = false;
            commit();
          }}
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

/** The scatter brush on the ground (Phase 139 Theme D's ring, flat until Phase 141 conforms it to terrain). */
function BrushRing({ radius, move, ground }: { radius: number; move: MutableRefObject<((at: [number, number] | null) => void) | null>; ground: number }) {
  const mesh = useRef<Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    move.current = (at) => {
      const m = mesh.current;
      if (!m) return;
      if (at) m.position.set(at[0], ground + 0.06, at[1]);
      m.visible = at !== null;
      invalidate();
    };
    return () => {
      move.current = null;
    };
  }, [move, ground, invalidate]);
  const r = Math.max(radius, 0.05);
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5}>
      <ringGeometry args={[r * 0.96, r, 64]} />
      <meshBasicMaterial color="#6366f1" transparent opacity={0.9} side={DoubleSide} depthTest={false} />
    </mesh>
  );
}
