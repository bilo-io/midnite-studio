import { Canvas } from '@react-three/fiber';
import { DEFAULT_SNAP, TransformModeBar, type SnapSettings, type TransformMode } from '@midnite/studio-frame/viewport3d';
import { bridge } from '@midnite/studio-frame';
import { levelOrigin, levelPixelsToWorld, metresPerTile, terrainExtent, type GameLevelTerrain } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { LuActivity, LuBox, LuCrosshair, LuGlobe, LuGroup } from 'react-icons/lu';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { addObject, addSelected, select, setActiveLayer, setOptionalNumber, toggleSelected, type EditLevel, type EditSelection, type EditState, type ObjectRef, type PlanPoint, type PlanRect } from '../level-edit-model';
import { cameraPosition, orbitPose, planPose, type CameraPose } from './camera-transition';
import { boxCentre, capturePose, framingSpan, levelWorldBox, type WorldBox } from './level-capture-pose';
import { pixelsToPng } from './level-capture';
import type { LevelCaptured, LevelCaptureRequest } from '../level-editor-controls';
import { focusBounds, workBounds } from './level-big';
import { formatStats, type GroundTile, type ViewStats } from './level-cull';
import { footprintBox, gizmoSteps, surfaceElevation } from '../level-snap';
import type { SceneExtras } from './level-extras';
import type { LevelSceneProps } from './level-scene';
import { disposeTree, LevelScene, NO_DRAFT, SCENE_BACKGROUND, type CameraMove, type ToolDraft } from './level-scene';
import { commitVolume, groundPoint, rayHitsItem, rotateToward, snappedPlanPoint, volumeFromDrag, worldPointFromPlan } from './level-ground';
import { marqueeHits, type ScreenPoint, type ScreenRect } from './level-marquee';
import { isMac, matchShortcut } from '../level-shortcuts';
import { isAssetDrag, readDroppedAsset, useDraggedAsset, type AssetDragPayload, type AssetDropTarget } from '../assets/asset-drag';
import { useLevelViewStore, type GizmoPivot, type GizmoSpace } from './level-view-store';
import { liftItems, reliefOf, reliefPoint } from './level-relief';
import { gizmoEdit, gizmoEditGroup, groundY, groupPivot, levelWorldItems, POINT_SIZE, worldItemOf, worldToObjectPoint, type GizmoChange, type GroupDelta, type GroupPivot } from './level-world';
import { ModelCache } from './model-cache';
import { OPTIMISATION_PRESETS, presetFor } from './optimisation';
import { SpatialGrid } from './spatial-grid';

/** What the editor asks of the 3D view: ease back to the plan pose, then hand over the pose it ended on. */
export type Level3dHandle = {
  exit: (done: (pose: CameraPose) => void) => void;
  /** Ease the camera over `refs` (else the ground under `rect`, map pixels): `game_level_frame` and the banner's Show. */
  frameTo?: (rect: PlanRect, refs: readonly ObjectRef[]) => void;
  /** Ease the camera onto the selected object (the outliner's double-click). */
  frame?: () => void;
  /** A PNG of the level from a preset or camera, drawn through a temporary camera (`game_level_view`). */
  capture?: (req: LevelCaptureRequest) => Promise<LevelCaptured>;
};

export type Level3dViewProps = {
  gameId: string;
  level: EditLevel;
  terrain: GameLevelTerrain | null;
  selection: EditSelection;
  /** Every selected object (Phase 137 Theme A); `selection` is the primary among them. */
  selected: readonly ObjectRef[];
  readOnly: boolean;
  /** `select` shows the gizmo; `entity` places `entityName` where the ground is clicked. */
  tool: string;
  entityName: string;
  objectLayerId: number | null;
  /** The path being drawn (map pixels); the editor owns it, so Enter, Escape and Backspace work in both views. */
  pathDraft: readonly PlanPoint[];
  onPathPoint: (point: PlanPoint) => void;
  update: (fn: (s: EditState) => EditState) => void;
  /** Where the camera starts: the plan view's own framing when the switch animates in, else an orbit over the level. */
  enterFrom: { target: [number, number, number]; span: number } | null;
  handle: MutableRefObject<Level3dHandle | null>;
  /** Keys the 3D view does not own (undo, delete, tool keys) go back to the editor. */
  onEditorKey: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Objects hidden in the outliner (refKeys): not drawn. Editor-only (Phase 137 Theme H). */
  hidden?: ReadonlySet<string>;
  /** Objects locked in the outliner (refKeys): drawn, but a click does not pick them. */
  locked?: ReadonlySet<string>;
  /** Collider / trigger volumes, the nav-mesh and live ghosts (Phase 140 Themes E to G). */
  extras?: SceneExtras;
  /** Right-click (Phase 137 Theme I): the object under the pointer, or null over the ground. */
  onContextMenu?: (event: { clientX: number; clientY: number; hit: { layerId: number; objectId: number } | null }) => void;
  /** Phase 139 Theme D: an asset dropped from the browser lands on the ground point under the pointer (already snapped). */
  assetDrop?: Pick<AssetDropTarget, 'onDrop'>;
  /** An armed browser tile: the next ground click places it instead of the entity tool's object. */
  armed?: AssetDragPayload | null;
  /** Phase 139 Theme H: the scatter brush. The ground under a drag becomes plan points (object units); `radius` is in the same units. */
  scatter?: { radius: number; onStroke: (phase: 'down' | 'move' | 'up', at: PlanPoint, alt: boolean) => void } | undefined;
};

type LevelSceneRayRef = LevelSceneProps['ray'];

/** A Shift press that travels further than this (px) is a marquee, not a click. */
const MARQUEE_SLOP_PX = 4;

function decodeBase64(data: string): ArrayBuffer {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** The level's ground in metres: the terrain's extent, else the map's own. */
export function levelBounds(level: EditLevel, terrain: GameLevelTerrain | null): GroundTile {
  if (terrain) return { minX: terrain.minX, minZ: terrain.minZ, maxX: terrain.maxX, maxZ: terrain.maxZ };
  const mpt = metresPerTile(level), o = levelOrigin(level);
  return { minX: o.x, minZ: o.z, maxX: o.x + level.width * mpt, maxZ: o.z + level.height * mpt };
}

/**
 * The 3D view of a 3D level (Phase 136): the same edit model as the plan view, drawn in perspective with the model
 * editor's gizmo, orbit and axis widget. Lazy-loaded, so three never reaches a 2D level or the plan view.
 */
export default function Level3dView(props: Level3dViewProps) {
  const { level, gameId, update } = props;
  const hiddenKeys = props.hidden;
  const ground = groundY(level);
  /** The ground's real shape, when the terrain pack has heights: objects with no elevation of their own sit on it. */
  const relief = useMemo(() => reliefOf(props.terrain, ground), [props.terrain, ground]);
  const heightAt = (x: number, z: number): number => (relief ? relief.heightAt(x, z) : ground);
  const items = useMemo(() => {
    const all = liftItems(levelWorldItems(level), relief);
    return hiddenKeys && hiddenKeys.size > 0 ? all.filter((it) => !hiddenKeys.has(`${it.sel.layerId}:${it.sel.objectId}`)) : all;
  }, [level, hiddenKeys, relief]);
  /** Where the pointer's ray meets the ground: the relief, else the flat plane. */
  const castGround = (r: { origin: [number, number, number]; dir: [number, number, number] } | null | undefined): [number, number, number] | null =>
    !r ? null : relief ? reliefPoint(r.origin, r.dir, relief) : groundPoint(r.origin, r.dir, ground);
  const grid = useMemo(() => new SpatialGrid(items), [items]);
  const bounds = useMemo(() => levelBounds(level, props.terrain), [level, props.terrain]);
  /** All the ground: the terrain with every pack placed round it. */
  const extent = useMemo<GroundTile>(() => (props.terrain ? terrainExtent(props.terrain) : bounds), [props.terrain, bounds]);
  const packs = useMemo(() => (props.terrain?.packs ?? []).map((p) => ({ minX: p.minX, minZ: p.minZ, maxX: p.maxX, maxZ: p.maxZ, drape: p.preview })), [props.terrain?.packs]);
  /** Item indices of the selection, primary first-class via `props.selection`. */
  const selectedIdx = useMemo(() => {
    const out: number[] = [];
    for (const ref of props.selected) {
      const i = items.findIndex((it) => it.sel.layerId === ref.layerId && it.sel.objectId === ref.objectId);
      if (i >= 0) out.push(i);
    }
    return out;
  }, [items, props.selected]);
  /** The lone selected item, which `F` frames and the single-object gizmo drives. */
  const selected = selectedIdx.length === 1 ? selectedIdx[0]! : null;
  const pivotMode = useLevelViewStore((s) => s.pivot);
  const space = useLevelViewStore((s) => s.space);
  const setPivotMode = useLevelViewStore((s) => s.setPivot);
  const setSpace = useLevelViewStore((s) => s.setSpace);
  const selectedRefs = useMemo(() => selectedIdx.map((i) => items[i]!.sel), [items, selectedIdx]);
  const pivot = useMemo(() => (selectedRefs.length > 1 ? groupPivot(level, selectedRefs, props.selection ?? selectedRefs[0]!, pivotMode) : null), [level, selectedRefs, props.selection, pivotMode]);

  const step = useLevelViewStore((s) => s.optimisation);
  const statsOn = useLevelViewStore((s) => s.stats);
  const preset = presetFor(step);
  const [mode, setMode] = useState<TransformMode>('translate');
  const levelSnap = useLevelViewStore((s) => s.snap);
  const setLevelSnap = useLevelViewStore((s) => s.setSnap);
  const snap = useMemo<SnapSettings>(() => ({ ...gizmoSteps(levelSnap), scale: DEFAULT_SNAP.scale }), [levelSnap]);
  const setSnap = (next: SnapSettings) => setLevelSnap({ grid: next.grid, angle: next.angle, enabled: next.grid > 0 || next.angle > 0 });
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [dirtyTick, setDirtyTick] = useState(0);
  const [shown, setShown] = useState(false);
  const gizmoDragging = useRef(false);
  const project = useRef<((p: [number, number, number]) => ScreenPoint) | null>(null);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [shiftDown, setShiftDown] = useState(false);
  const ray: LevelSceneRayRef = useRef(null);
  const captureFn: LevelSceneProps['capture'] = useRef(null);
  const setOrbit = useRef<((on: boolean) => void) | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<ToolDraft['volume']>(null);
  const [aimDraft, setAimDraft] = useState<ToolDraft['aim']>(null);
  const statsOnRef = useRef(statsOn);
  statsOnRef.current = statsOn;

  /** What the view opens on and grids: the work, when the terrain dwarfs it. */
  const focus = useMemo(() => focusBounds(extent, workBounds(level, items)), [extent, level, items]);
  const levelCentre = (): { target: [number, number, number]; span: number } => ({
    target: [(focus.minX + focus.maxX) / 2, heightAt((focus.minX + focus.maxX) / 2, (focus.minZ + focus.maxZ) / 2), (focus.minZ + focus.maxZ) / 2],
    span: Math.max(focus.maxX - focus.minX, focus.maxZ - focus.minZ, 10) * 0.8,
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
      frame: () => frameRef.current(),
      frameTo: (rect, refs) => latest.current.frame(rect, refs),
      capture: (req) => latest.current.capture(req),
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

  /** The item under the pointer, for a right-click (the scene's pointer-move events set it). */
  const pointerHit = useRef<{ layerId: number; objectId: number } | null>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  /** The box (world metres) of `refs`' items, else of the ground under `rect`. */
  const boxOf = (rect: PlanRect | null, refs: readonly ObjectRef[]): WorldBox | null => {
    const found = liftItems(refs.map((r) => worldItemOf(level, r)).filter((i): i is NonNullable<typeof i> => i !== null), relief);
    if (found.length > 0) {
      return {
        min: [Math.min(...found.map((i) => i.bounds.minX)), Math.min(...found.map((i) => i.position[1])), Math.min(...found.map((i) => i.bounds.minZ))],
        max: [Math.max(...found.map((i) => i.bounds.maxX)), Math.max(...found.map((i) => i.position[1] + i.size[1])), Math.max(...found.map((i) => i.bounds.maxZ))],
      };
    }
    if (!rect) return null;
    const planToWorld = (x: number, y: number): [number, number] => levelPixelsToWorld(level, x, y);
    const a = planToWorld(rect.x, rect.y), b = planToWorld(rect.x + rect.width, rect.y + rect.height);
    const y = heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    return { min: [Math.min(a[0], b[0]), y, Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), y, Math.max(a[1], b[1])] };
  };
  const frameBox = (rect: PlanRect, refs: readonly ObjectRef[]) => {
    const box = boxOf(rect, refs);
    if (!box) return;
    const now = poseOut.current ?? initialPose;
    const c = boxCentre(box);
    move.current = { from: now, to: { ...orbitPose(c, framingSpan(box)), yaw: now.yaw }, startedAt: null };
    setDirtyTick((t) => t + 1);
  };
  const captureView = async (req: LevelCaptureRequest): Promise<LevelCaptured> => {
    // A view just switched to mounts its scene a beat later: wait for it, then for a couple of frames to draw.
    for (let i = 0; i < 60 && !captureFn.current; i += 1) await new Promise((r) => setTimeout(r, 50)); // allow-timeout: polling for the scene to mount
    const draw = captureFn.current;
    if (!draw) throw new Error('The 3D view is not ready to draw a picture yet.');
    for (let i = 0; i < 2; i += 1) await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const whole = levelWorldBox(extent, ground, items);
    const live = poseOut.current ?? initialPose;
    const liveCamera = { position: cameraPosition(live), target: live.target, fov: live.fov };
    const camera = capturePose(req, whole, boxOf(null, selectedRefs)) ?? liveCamera;
    const { visible, ...pixels } = draw(camera, req.width, req.height);
    return { png: await pixelsToPng(pixels), camera, objects: visible, width: req.width, height: req.height };
  };
  const latest = useRef({ frame: frameBox, capture: captureView });
  latest.current = { frame: frameBox, capture: captureView };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cmd = matchShortcut(event, { view: '3d', dimension: '3d', mac: isMac() });
    const next = cmd === 'gizmo.translate' ? 'translate' : cmd === 'gizmo.rotate' ? 'rotate' : cmd === 'gizmo.scale' ? 'scale' : null;
    if (next && !props.readOnly) {
      event.preventDefault();
      setMode(next);
      return;
    }
    if ((cmd === 'gizmo.pivot' || cmd === 'gizmo.space') && !props.readOnly) {
      event.preventDefault();
      if (cmd === 'gizmo.pivot') setPivotMode(pivotMode === 'pivot' ? 'centre' : 'pivot');
      else setSpace(space === 'world' ? 'local' : 'world');
      return;
    }
    if (cmd === 'view.frame') {
      event.preventDefault();
      frame();
      return;
    }
    if (cmd === 'select.none') {
      update((s) => select(s, null));
      return;
    }
    props.onEditorKey(event);
  };

  const editable = !props.readOnly;
  const gizmo = editable && props.tool === 'select' ? mode : null;
  const marqueeOn = editable && props.tool === 'select';
  // Shift hands the plain drag to the marquee: the orbit controls stand down while it is held.
  useEffect(() => {
    const track = (ev: globalThis.KeyboardEvent) => setShiftDown(ev.shiftKey);
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    return () => {
      window.removeEventListener('keydown', track);
      window.removeEventListener('keyup', track);
    };
  }, []);

  const pathWorld = useMemo(() => props.pathDraft.map((p) => worldPointFromPlan(level, p)), [props.pathDraft, level]);
  const draft = useMemo<ToolDraft>(() => (volumeDraft || aimDraft || pathWorld.length > 0 ? { volume: volumeDraft, path: pathWorld, aim: aimDraft } : NO_DRAFT), [volumeDraft, aimDraft, pathWorld]);

  /**
   * Volume, Path and Rotate in 3D (Phase 137 Theme G). The pointer's ray is cast at the ground; a Volume or Rotate drag
   * holds the orbit controls still, a Path click leaves them alone (a press that travelled is an orbit, as in Phase 136).
   * Runs in the capture phase so the controls are off before they see the press.
   */
  const toolDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const tool = props.tool;
    if (!editable || event.button !== 0 || event.shiftKey || !(event.target instanceof HTMLCanvasElement)) return;
    if (tool !== 'volume' && tool !== 'path' && tool !== 'rotate' && tool !== 'scatter') return;
    const cast = (x: number, y: number): [number, number, number] | null => {
      const r = ray.current?.(x, y);
      return castGround(r);
    };
    const start = cast(event.clientX, event.clientY);
    const layer = props.objectLayerId;
    const x0 = event.clientX, y0 = event.clientY;
    const travelled = (ev: PointerEvent) => Math.hypot(ev.clientX - x0, ev.clientY - y0) > MARQUEE_SLOP_PX;
    const track = (onMove: (ev: PointerEvent, at: [number, number, number] | null) => void, onUp: (ev: PointerEvent, at: [number, number, number] | null) => void) => {
      const move = (ev: PointerEvent) => onMove(ev, cast(ev.clientX, ev.clientY));
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setOrbit.current?.(true);
        setVolumeDraft(null);
        setAimDraft(null);
        onUp(ev, cast(ev.clientX, ev.clientY));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    if (tool === 'volume') {
      if (!start || layer === null) return;
      setOrbit.current?.(false);
      const snapped = (at: [number, number, number], invert: boolean) => volumeFromDrag(level, [start[0], start[2]], [at[0], at[2]], levelSnap, invert);
      track(
        (ev, at) => {
          if (!at || !travelled(ev)) return;
          const d = snapped(at, ev.altKey);
          const a = worldPointFromPlan(level, d.from), b = worldPointFromPlan(level, d.to);
          setVolumeDraft({ x0: a[0], z0: a[1], x1: b[0], z1: b[1] });
        },
        (ev, at) => {
          if (at && travelled(ev)) update((s) => commitVolume(s, layer, snapped(at, ev.altKey)));
        },
      );
    } else if (tool === 'scatter') {
      const sc = props.scatter;
      if (!start || !sc) return;
      setOrbit.current?.(false);
      const plan = (at: [number, number, number]) => worldToObjectPoint(level, at[0], at[2]);
      sc.onStroke('down', plan(start), event.altKey);
      track(
        (ev, at) => {
          if (at) sc.onStroke('move', plan(at), ev.altKey);
        },
        (ev, at) => sc.onStroke('up', plan(at ?? start), ev.altKey),
      );
    } else if (tool === 'path') {
      if (!start || layer === null) return;
      track(
        () => undefined,
        (ev, at) => {
          if (at && !travelled(ev)) props.onPathPoint(snappedPlanPoint(level, at[0], at[2], levelSnap, ev.altKey));
        },
      );
    } else {
      const r = ray.current?.(event.clientX, event.clientY);
      const refs = selectedRefs;
      const grabbed = r ? selectedIdx.map((i) => items[i]!).find((it) => rayHitsItem(r.origin, r.dir, it)) : undefined;
      if (!grabbed || refs.length === 0) return;
      setOrbit.current?.(false);
      const from: [number, number] = [grabbed.position[0], grabbed.position[2]];
      const angle = (ev: PointerEvent) => (levelSnap.enabled !== (ev.altKey || ev.shiftKey) ? levelSnap.angle : 0);
      track(
        (ev, at) => {
          if (at && travelled(ev)) setAimDraft({ from, to: [at[0], at[2]] });
        },
        (ev, at) => {
          if (at && travelled(ev)) update((s) => rotateToward(s, refs, level, [at[0], at[2]], angle(ev)));
        },
      );
    }
  };

  const startMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus();
    if (!marqueeOn || !event.shiftKey || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const from = { x: event.clientX - box.left, y: event.clientY - box.top };
    let active = false;
    const rectAt = (ev: PointerEvent): ScreenRect => ({ x0: from.x, y0: from.y, x1: ev.clientX - box.left, y1: ev.clientY - box.top });
    const move = (ev: PointerEvent) => {
      if (gizmoDragging.current) return;
      const r = rectAt(ev);
      if (!active && Math.hypot(r.x1 - r.x0, r.y1 - r.y0) <= MARQUEE_SLOP_PX) return;
      active = true;
      setMarquee(r);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      const projectPoint = project.current;
      if (!active || gizmoDragging.current || !projectPoint) return;
      const hits = marqueeHits(
        items.map((it) => ({ id: it.index, centre: [it.position[0], it.position[1] + it.size[1] / 2, it.position[2]] as [number, number, number] })),
        projectPoint,
        rectAt(ev),
      );
      const refs = hits.map((i) => items[i]!.sel).filter((r) => !props.locked?.has(`${r.layerId}:${r.objectId}`));
      if (refs.length > 0) update((s) => addSelected(s, refs));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** The scatter ring follows the pointer over the ground without a React render per move. */
  const brushMove = useRef<((at: [number, number] | null) => void) | null>(null);
  const brushRadius = props.scatter ? worldPointFromPlan(level, { x: props.scatter.radius, y: props.scatter.radius })[0] : 0;
  const armedAsset = editable && props.armed ? props.armed : null;
  const placing = armedAsset !== null || (editable && props.tool === 'entity' && props.objectLayerId !== null && props.entityName !== '');
  const dragged = useDraggedAsset();
  /** The drop ghost: where the pointer is over the view while a browser tile is dragged (client-relative px). */
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const dragPoint = (event: { clientX: number; clientY: number; altKey: boolean }): PlanPoint | null => {
    const r = ray.current?.(event.clientX, event.clientY);
    const g = castGround(r);
    return g ? snappedPlanPoint(level, g[0], g[2], levelSnap, event.altKey) : null;
  };

  return (
    <div
      className="relative h-full w-full outline-none"
      style={{ background: SCENE_BACKGROUND, opacity: shown ? 1 : 0, transition: 'opacity 180ms ease-out' }}
      tabIndex={0}
      role="application"
      aria-label="Level 3D view. Drag to orbit, right-drag to pan, wheel to zoom. W move, E rotate, R scale, Z pivot or centre, X local or world, Shift-drag selects several, F frame, Escape deselects."
      data-testid="level-3d-view"
      onKeyDown={onKeyDown}
      onPointerDownCapture={toolDown}
      onPointerMove={(e) => {
        if (!props.scatter || !editable) return;
        const r = ray.current?.(e.clientX, e.clientY);
        const g = castGround(r);
        brushMove.current?.(g ? [g[0], g[2]] : null);
      }}
      onPointerLeave={() => brushMove.current?.(null)}
      onDragOver={(e) => {
        if (!props.assetDrop || !isAssetDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const box = e.currentTarget.getBoundingClientRect();
        setGhost({ x: e.clientX - box.left, y: e.clientY - box.top });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGhost(null);
      }}
      onDrop={(e) => {
        if (!props.assetDrop || !isAssetDrag(e.dataTransfer)) return;
        e.preventDefault();
        setGhost(null);
        const payload = readDroppedAsset(e.dataTransfer);
        const at = dragPoint(e);
        if (payload && at) props.assetDrop.onDrop(payload, at);
      }}
      onPointerDown={startMarquee}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!props.onContextMenu) return;
        props.onContextMenu({ clientX: e.clientX, clientY: e.clientY, hit: pointerHit.current });
      }}
    >
      <Canvas frameloop={statsOn ? 'always' : 'demand'} dpr={Math.min(preset.pixelRatio, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)} gl={{ antialias: true, logarithmicDepthBuffer: true }}>
        <LevelScene
          items={items}
          grid={grid}
          bounds={bounds}
          extent={extent}
          packs={packs}
          ground={ground}
          drape={props.terrain?.preview ?? null}
          focus={focus}
          detail={props.terrain?.detail ?? null}
          relief={relief}
          selected={selectedIdx}
          pivot={pivot}
          pivotMode={pivotMode}
          space={space}
          orbit={!(shiftDown && marqueeOn)}
          gizmoDragging={gizmoDragging}
          ray={ray}
          capture={captureFn}
          setOrbit={setOrbit}
          draft={draft}
          extras={props.extras}
          project={project}
          gizmo={gizmo}
          snap={snap}
          preset={preset}
          placing={placing}
          brush={props.scatter ? { radius: brushRadius, move: brushMove } : undefined}
          cache={cache}
          initialPose={initialPose}
          move={move}
          poseOut={poseOut}
          dirtyTick={dirtyTick}
          onHover={(index) => {
            pointerHit.current = index === null ? null : (items[index]?.sel ?? null);
          }}
          onPick={(index, modifier) => {
            const sel = index === null ? null : (items[index]?.sel ?? null);
            if (sel && props.locked?.has(`${sel.layerId}:${sel.objectId}`)) return;
            update((s) => (sel && modifier === 'toggle' ? toggleSelected(s, sel) : sel && modifier === 'add' ? addSelected(s, [sel]) : select(s, sel)));
          }}
          onGroupEnd={(delta: GroupDelta, framePivot: GroupPivot) => {
            update((s) => gizmoEditGroup(s, selectedRefs, framePivot, delta));
          }}
          onPlace={(x, z) => {
            if (armedAsset) {
              props.assetDrop?.onDrop(armedAsset, snappedPlanPoint(level, x, z, levelSnap, false));
              return;
            }
            const layer = props.objectLayerId;
            if (layer === null) return;
            const at = worldToObjectPoint(level, x, z);
            // The ground here: on a relief an object with no elevation already sits on it, so only a surface above it is written.
            const under = heightAt(x, z);
            const drop = levelSnap.enabled && levelSnap.surface ? surfaceElevation(items, footprintBox([x, z], [POINT_SIZE, POINT_SIZE], 0), new Set(), under) : under;
            update((s) => {
              const added = addObject(setActiveLayer(s, layer), layer, { type: props.entityName, x: at.x, y: at.y });
              return drop !== under && added.selection ? setOptionalNumber(added, added.selection, 'elevation', String(drop)) : added;
            });
          }}
          onGizmoEnd={(change: GizmoChange, inverted: boolean) => {
            const sel = props.selection;
            if (!sel) return;
            const item = selected !== null ? items[selected] : undefined;
            let next = change;
            // Surface snap (Phase 137 Theme F) runs on release: the object drops onto the top under its new footprint.
            if (item && levelSnap.surface && levelSnap.enabled !== inverted && change.elevation === undefined && (change.centre || change.size)) {
              const size = change.size ?? item.size;
              const box = footprintBox(change.centre ?? [item.position[0], item.position[2]], [size[0], size[2]], change.yaw ?? item.yaw);
              const centre = change.centre ?? [item.position[0], item.position[2]];
              const under = heightAt(centre[0], centre[1]);
              const drop = surfaceElevation(items, box, new Set([sel.objectId]), under);
              // An object already resting there keeps its (absent) elevation property; so does one moved over bare relief.
              if (Math.abs(drop - item.position[1]) > 1e-3 && !(relief && item.grounded && drop === under)) next = { ...change, elevation: drop };
            }
            update((s) => gizmoEdit(s, sel, next));
          }}
          onStats={(s) => {
            if (statsOnRef.current) setStats(s);
          }}
        />
      </Canvas>
      {ghost && dragged ? (
        <div
          aria-hidden
          data-testid="level-asset-ghost"
          className="pointer-events-none absolute flex h-8 items-center rounded border border-dashed border-primary bg-primary/30 px-2 text-[11px]"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, -50%)' }}
        >
          {dragged.name}
        </div>
      ) : null}
      {marquee ? (
        <div
          aria-hidden
          data-testid="level-marquee"
          className="pointer-events-none absolute border border-dashed border-primary bg-primary/10"
          style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
        />
      ) : null}
      <ViewBar mode={mode} onMode={setMode} snap={snap} onSnap={setSnap} pivot={pivotMode} onPivot={setPivotMode} space={space} onSpace={setSpace} readOnly={props.readOnly} stats={statsOn ? stats : null} />
    </div>
  );
}

/** The floating bar: gizmo modes and snap (shared with the model editor), the Optimisation slider and the readout. */
export function ViewBar({ mode, onMode, snap, onSnap, pivot, onPivot, space, onSpace, readOnly, stats }: { mode: TransformMode; onMode: (m: TransformMode) => void; snap: SnapSettings; onSnap: (s: SnapSettings) => void; pivot: GizmoPivot; onPivot: (p: GizmoPivot) => void; space: GizmoSpace; onSpace: (s: GizmoSpace) => void; readOnly: boolean; stats: ViewStats | null }) {
  const step = useLevelViewStore((s) => s.optimisation);
  const statsOn = useLevelViewStore((s) => s.stats);
  const setOptimisation = useLevelViewStore((s) => s.setOptimisation);
  const toggleStats = useLevelViewStore((s) => s.toggleStats);
  return (
    <>
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/85 px-2 py-1 text-xs backdrop-blur" onKeyDown={(e) => e.stopPropagation()}>
        {readOnly ? null : <TransformModeBar mode={mode} onModeChange={onMode} snap={snap} onSnapChange={onSnap} />}
        {readOnly ? null : (
          <>
            <Radios label="Gizmo pivot" value={pivot} onChange={onPivot} options={[['pivot', 'Pivot', LuCrosshair, 'Pivot: the primary object (Z)'], ['centre', 'Centre', LuGroup, 'Centre: the middle of the selection (Z)']]} />
            <Radios label="Gizmo space" value={space} onChange={onSpace} options={[['local', 'Local', LuBox, 'Local: turn with the pivot (X)'], ['world', 'World', LuGlobe, 'World: axis-aligned (X)']]} />
          </>
        )}
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

/** A small icon radio group, as the 3D bar draws its Pivot / Centre and Local / World toggles. */
function Radios<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: ReadonlyArray<readonly [T, string, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>, string]> }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
      {options.map(([id, name, Icon, title]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={name}
          title={title}
          onClick={() => onChange(id)}
          className={`flex h-6 w-6 items-center justify-center rounded-md ${value === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
        >
          <Icon aria-hidden className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
