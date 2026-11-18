import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  LuEraser,
  LuMap,
  LuStethoscope,
  LuMapPin,
  LuMousePointer2,
  LuPaintbrush,
  LuPipette,
  LuPencilRuler,
  LuPlus,
  LuRadio,
  LuRedo2,
  LuRotateCw,
  LuRoute,
  LuSave,
  LuBox,
  LuSquare,
  LuTrash2,
  LuTriangleAlert,
  LuBoxes,
  LuKeyboard,
  LuUndo2,
} from 'react-icons/lu';
import { useQueryClient } from '@tanstack/react-query';

import { GAME_LEVEL_ENTITY_TYPES_2D, GAME_LEVEL_ENTITY_TYPES_3D, levelEntityToWorld, levelProperties, metresPerTile, type GameLevelGetResult } from '@midnite/studio-shared';
import { EmptyState, EmptyStateButton, KitContextMenu, Skeleton, useFrameChrome, type FrameMenuEntry } from '@midnite/studio-frame';

import { IconButton, useNotify } from '../chrome';
import { isLive, useGameRunStore } from '../game-run-store';
import { fetchPrefab, useDeletePrefab, usePrefabs, useSavePrefab } from './use-prefabs';
import { useDoctorRequest } from '../game-doctor-store';
import { useDoctorFix, useGameDiagnosis } from '../use-games';
import { LevelAlignBar } from './level-align-bar';
import { alignObjects, distributeObjects, type AlignAxis, type AlignEdge } from './level-align';
import { useLevelEditorBridge } from './use-level-editor-bridge';
import { registerEditorControls } from './level-editor-controls';
import { frameView } from './level-frame';
import { capturePlan } from './level-plan-capture';
import { AgentChangeBanner } from './agent-change-banner';
import { decideReload } from './level-reload';
import { LevelCanvas, type CanvasPointer } from './level-canvas';
import { levelContextMenu, type LevelMenuTarget } from './level-context-menu';
import { LevelOutliner } from './level-outliner';
import { AssetBrowser, type AssetBrowserTab } from './assets/asset-browser';
import { PrefabInspectorRow } from './assets/prefab-inspector';
import { PrefabList } from './assets/prefab-list';
import { SavePrefabDialog } from './assets/save-prefab-dialog';
import { arm, dropToObject, placementRefusal, useArmedAsset, type AssetDragPayload } from './assets/asset-drag';
import { hiddenKeys, isSelectable, lockedKeys, sceneKey, useLevelOutlinerStore } from './level-outliner-store';
import { copySelection, duplicateSelection, pasteClipboard, readClipboard, writeClipboard } from './level-clipboard';
import {
  addLayer,
  addObject,
  addPathPoint,
  beginStroke,
  cellCentre,
  deleteObject,
  deleteObjects,
  endStroke,
  erase,
  fillRect,
  insertObjects,
  finishPath,
  findObject,
  applyPrefabUpdate,
  convertToInstance,
  countInstances,
  instanceRefs,
  isLevel3d,
  markSaved,
  overriddenFields,
  placePrefab,
  prefabFromSelection,
  prefabInstanceOf,
  revertOverride,
  selectInstancesOf,
  selectPrefabInstance,
  unpackInstance,
  layerById,
  moveObjects,
  nudgeObjects,
  paint,
  pick,
  redo,
  removeProperty,
  rotateObject,
  rotationToward,
  objectCentre,
  select,
  selectAllInLayer,
  selectInRect,
  selectOnly,
  setActiveLayer,
  setObjectField,
  setOptionalNumber,
  setOptionalText,
  setProperty,
  setVolume,
  toggleSelected,
  addSelected,
  undo,
  rectCells,
  type Cell,
  type EditLevel,
  type EditState,
  type LevelObject,
  type LevelProperty,
  type ObjectField,
  type PrefabInstanceInfo,
  type ObjectRef,
  type PlanPoint,
  type PlanRect,
  objectToMapPoint,
} from './level-edit-model';
import { refKey, sameRef } from './level-selection';
import { snapPlan } from './level-plan';
import { planSnapStep } from './level-snap';
import { LevelShortcutHelp } from './level-shortcut-help';
import { LevelViewPopover } from './level-view-popover';
import { levelExtras } from './live/level-extras-model';
import { LiveChip } from './live/live-chip';
import { copyLivePosition, liveTwin } from './live/live-model';
import { useLiveEntities } from './live/use-live-entities';
import { pushDebug, useNavMesh } from './live/use-nav-mesh';
import { isMac, matchShortcut } from './level-shortcuts';
import { LevelSnapPopover } from './level-snap-popover';
import { PlayFromHereButton, usePlayFromHere } from './play-from-here';
import { blockingIssues, useLevelStore, type OpenLevel } from './level-store';
import { lineCells, type View } from './level-view';
import { focusToPlanView, planViewToFocus } from './3d/camera-transition';
import type { Level3dHandle } from './3d/level-3d-view';
import { levelViewMode, useLevelViewStore, type LevelViewMode } from './3d/level-view-store';
import { groundY } from './3d/level-world';
import { fetchLevel, useGameManifest, useLevel, useLevels, useSaveOpenLevel } from './use-levels';

/**
 * Extra tabs for the asset browser panel (Phase 139 Theme C's extension point). Theme G adds a Prefabs tab by
 * returning it here, so it takes the editor's state without the browser knowing about prefabs.
 */
export function useAssetBrowserTabs({ gameId, is3d, onDeletePrefab }: { gameId: string; is3d: boolean; onDeletePrefab: (name: string) => void }): readonly AssetBrowserTab[] {
  const prefabs = usePrefabs(gameId);
  const data = prefabs.data;
  const loading = prefabs.isLoading;
  return useMemo(
    () => [{ id: 'prefabs', label: 'Prefabs', render: () => <PrefabList prefabs={data} loading={loading} is3d={is3d} onDelete={onDeletePrefab} /> }],
    [data, loading, is3d, onDeletePrefab],
  );
}

export type LevelTool = 'paint' | 'erase' | 'rect' | 'pick' | 'entity' | 'select' | 'volume' | 'path' | 'rotate';

const TOOLS: readonly { tool: LevelTool; label: string; key: string; icon: typeof LuPaintbrush }[] = [
  { tool: 'paint', label: 'Paint', key: 'b', icon: LuPaintbrush },
  { tool: 'erase', label: 'Erase', key: 'e', icon: LuEraser },
  { tool: 'rect', label: 'Rectangle', key: 'r', icon: LuSquare },
  { tool: 'pick', label: 'Pick', key: 'i', icon: LuPipette },
  { tool: 'entity', label: 'Entity', key: 'o', icon: LuMapPin },
  { tool: 'select', label: 'Select', key: 'v', icon: LuMousePointer2 },
];

/** A 3D level's tools (Theme E): the same V and O as 2D, plus a volume, a path and a yaw drag. */
const TOOLS_3D: readonly { tool: LevelTool; label: string; key: string; icon: typeof LuPaintbrush }[] = [
  { tool: 'select', label: 'Select / Move', key: 'v', icon: LuMousePointer2 },
  { tool: 'entity', label: 'Place', key: 'o', icon: LuMapPin },
  { tool: 'volume', label: 'Volume', key: 'r', icon: LuBox },
  { tool: 'path', label: 'Path', key: 'p', icon: LuRoute },
  { tool: 'rotate', label: 'Rotate', key: 'y', icon: LuRotateCw },
];

/** The properties the 3D inspector has its own field for; the generic list leaves them out. */
const MANAGED_3D = ['elevation', 'sizeY', 'pitch', 'roll', 'scale', 'model', 'collider', 'intensity', 'range', 'color'];
/** Plan placement snaps to half a metre; Shift snaps a rotation to 15 degrees. */
const ROTATE_STEP = 15;

const CUSTOM = '__custom__';

/** three and the scene load only when a 3D level's 3D view first opens. */
const Level3dView = lazy(() => import('./3d/level-3d-view'));
/** The plan-view tools the 3D view has (the rest draw in plan only). */
const TOOLS_IN_3D: ReadonlySet<LevelTool> = new Set(TOOLS_3D.map((t) => t.tool));

type Updater = (fn: (state: EditState) => EditState) => void;

/**
 * The Level editor tab's content (Phase 132 Theme D): a toolbar, the layer list, the canvas and a palette with
 * the entity inspector. The open level and its undo stack live in the per-game {@link useLevelStore}, so
 * switching tabs, scenes or games loses nothing. The letter keys and `Mod+z` act only while the canvas has
 * focus; they are deliberately not in the app's command registry.
 */
export function LevelEditor({ gameId, onPlayStarted }: { gameId: string | null; onPlayStarted?: (started: Promise<string | null>) => void }) {
  const client = useQueryClient();
  const levels = useLevels(gameId);
  const entry = useLevelStore((s) => (gameId ? s.byGame[gameId] : undefined));
  const openNewScene = useLevelStore((s) => s.openNewScene);
  const diagnosis = useGameDiagnosis(gameId);
  const requestDoctor = useDoctorRequest((s) => s.request);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tried = useRef<string | null>(null);
  useLevelEditorBridge(gameId);

  const list = levels.data;
  const first = list ? (list.start && list.scenes.some((s) => s.scene === list.start) ? list.start : list.scenes[0]?.scene) : undefined;

  const openScene = async (scene: string) => {
    if (!gameId) return;
    setLoadError(null);
    try {
      useLevelStore.getState().open(gameId, scene, await fetchLevel(client, gameId, scene));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  // A game with levels opens on its start scene. This only opens the file: the running game is not moved.
  useEffect(() => {
    if (!gameId || entry || !first || tried.current === `${gameId}:${first}`) return;
    tried.current = `${gameId}:${first}`;
    void openScene(first);
    // `openScene` closes over the client and game only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, entry, first]);

  if (!gameId) return <EmptyState icon={LuPencilRuler} title="No game selected" body="Pick a game from the list to edit its levels." />;
  if (levels.isLoading) return <div className="p-4" data-testid="level-loading"><Skeleton className="h-8 w-48" /><Skeleton className="mt-3 h-64 w-full" /></div>;
  if (levels.isError) return <LoadFailure message={levels.error instanceof Error ? levels.error.message : 'Levels could not be read.'} onRetry={() => void levels.refetch()} />;
  if (loadError) return <LoadFailure message={loadError} onRetry={() => void (first ? openScene(entry?.scene ?? first) : levels.refetch())} />;
  if (!entry) {
    if (list && list.scenes.length === 0) {
      // Phase 149 Theme G: say why. `kit.outdated` is the doctor's sign that the scenes are built in code.
      const found = diagnosis.data?.findings ?? [];
      if (found.some((f) => f.rule === 'levels.none') && found.some((f) => f.rule === 'kit.outdated')) {
        return (
          <EmptyState
            icon={LuPencilRuler}
            title="This game builds its levels in code"
            body="Move the layout into levels/ to edit it here."
            action={
              <div className="flex items-center gap-2">
                <EmptyStateButton icon={LuStethoscope} label="Open Doctor" onClick={() => requestDoctor(gameId)} />
                <EmptyStateButton icon={LuPlus} label="New scene" onClick={() => openNewScene(gameId)} />
              </div>
            }
          />
        );
      }
      return (
        <EmptyState
          icon={LuPencilRuler}
          title="No levels yet"
          body="A level is a Tiled map in levels/."
          action={<EmptyStateButton icon={LuPlus} label="New scene" onClick={() => openNewScene(gameId)} />}
        />
      );
    }
    return <div className="p-4" data-testid="level-loading"><Skeleton className="h-8 w-48" /><Skeleton className="mt-3 h-64 w-full" /></div>;
  }
  const editor = <OpenEditor key={`${gameId}:${entry.scene}`} gameId={gameId} entry={entry} readsLevels={list?.readsLevels ?? false} onPlayStarted={onPlayStarted} />;
  if (!(diagnosis.data?.findings ?? []).some((f) => f.rule === 'levels.not-declared')) return editor;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DeclareLevelsNotice gameId={gameId} />
      <div className="min-h-0 flex-1">{editor}</div>
    </div>
  );
}

/** Level files exist but the manifest has no `levels`: say so, with the doctor's one-click fix. */
function DeclareLevelsNotice({ gameId }: { gameId: string }) {
  const fix = useDoctorFix(gameId);
  const [error, setError] = useState<string | null>(null);
  return (
    <div role="status" data-testid="level-not-declared" className="flex shrink-0 items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-xs">
      <LuTriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1">{error ?? 'Levels found but not declared in the manifest, so the game does not read them.'}</span>
      <button
        type="button"
        disabled={fix.isPending}
        onClick={() => {
          setError(null);
          fix.mutate({ fixId: 'declare-levels' }, { onSuccess: (result) => { if (!result.ok) setError('message' in result ? result.message : 'The fix could not be applied.'); } });
        }}
        className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-60"
      >
        Declare levels
      </button>
    </div>
  );
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState icon={LuTriangleAlert} title="The level could not be opened" body={message} action={<EmptyStateButton label="Retry" onClick={onRetry} />} />
  );
}

function Banner({ children, testId }: { children: string; testId: string }) {
  return (
    <p role="status" data-testid={testId} className="flex shrink-0 items-start gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-xs text-foreground">
      <LuTriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      {children}
    </p>
  );
}

function OpenEditor({ gameId, entry, readsLevels, onPlayStarted }: { gameId: string; entry: OpenLevel; readsLevels: boolean; onPlayStarted?: ((started: Promise<string | null>) => void) | undefined }) {
  const { edit } = entry;
  const level = edit.level as EditLevel;
  const save = useSaveOpenLevel(gameId);
  const [saving, setSaving] = useState(false);
  const is3d = isLevel3d(level);
  const [tool, setTool] = useState<LevelTool>(is3d ? 'select' : 'paint');
  const [gid, setGid] = useState(1);
  const [entityType, setEntityType] = useState<string>('spawn');
  const [custom, setCustom] = useState('');
  const [preview, setPreview] = useState<Cell[] | null>(null);
  const drag = useRef<{ from: Cell; last: Cell } | null>(null);
  const planDrag = useRef<{ kind: 'rotate'; sel: NonNullable<typeof edit.selection>; centre: PlanPoint } | { kind: 'volume'; from: PlanPoint } | null>(null);
  // The Select tool's gesture (Phase 137 Theme C): a group drag of the selection, or a marquee from empty ground.
  const selectDrag = useRef<
    | { kind: 'group'; refs: readonly ObjectRef[]; start: PlanPoint; grab: PlanPoint; applied: PlanPoint }
    | { kind: 'marquee'; from: PlanPoint; mode: 'replace' | 'add' | 'toggle' }
    | null
  >(null);
  const [marquee, setMarquee] = useState<PlanRect | null>(null);
  /** Where the pointer last was over the canvas, in object coordinates: Mod+V pastes there. */
  const lastPointer = useRef<PlanPoint | null>(null);
  const notify = useNotify();
  const [helpOpen, setHelpOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeHelp = () => {
    setHelpOpen(false);
    rootRef.current?.querySelector<HTMLElement>('[role="application"]')?.focus();
  };
  const dialogs = useFrameChrome().useDialogs();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; items: FrameMenuEntry[] } | null>(null);
  /** The outliner's frame request: the plan view recentres on a point (map pixels). */
  const [centreOn, setCentreOn] = useState<{ x: number; y: number; n: number } | null>(null);
  const hiddenList = useLevelOutlinerStore((s) => hiddenKeys(s, gameId, entry.scene));
  const lockedList = useLevelOutlinerStore((s) => lockedKeys(s, gameId, entry.scene));
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const locked = useMemo(() => new Set(lockedList), [lockedList]);
  const [draft, setDraft] = useState<PlanPoint[]>([]);
  const [volumeDrag, setVolumeDrag] = useState<{ from: PlanPoint; to: PlanPoint } | null>(null);
  const manifestQuery = useGameManifest(gameId);
  const manifest = manifestQuery.data ?? null;
  const armedAsset = useArmedAsset();
  // Live ghosts and the View overlays (Phase 140 Themes E to G). Live needs a running game and turns itself off with it.
  const overlays = useLevelViewStore((s) => s.overlays);
  const runState = useGameRunStore((s) => s.runs[gameId]?.state);
  const gameRunning = isLive(runState) && runState !== 'starting';
  const [liveOn, setLiveOn] = useState(false);
  useEffect(() => {
    if (!gameRunning) setLiveOn(false);
  }, [gameRunning]);
  const liveFeed = useLiveEntities(gameId, liveOn && gameRunning).result;
  const ghosts = useMemo(() => liveFeed?.entities ?? [], [liveFeed]);
  const runId = useGameRunStore((s) => s.runs[gameId]?.runId);
  const navPolygons = useNavMesh(gameId, overlays.nav && gameRunning, runId, (message) => notify(message, { danger: true }));
  // A new run is a new page that knows nothing of the switches: hand it the ones that are on.
  useEffect(() => {
    if (gameRunning && (overlays.colliders || overlays.triggers || overlays.nav)) pushDebug(gameId, overlays);
    // Only a new run needs the full set; a toggle pushes its own switch below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameRunning, runId]);
  const extras = useMemo(() => levelExtras({ level, is3d, overlays, ghosts, nav: navPolygons }), [level, is3d, overlays, ghosts, navPolygons]);
  const kitNoticed = useRef(false);
  useEffect(() => {
    if (liveFeed?.unsupported && !kitNoticed.current) {
      kitNoticed.current = true;
      notify("Update the game's kit to see live entities", { danger: true });
    }
  }, [liveFeed?.unsupported, notify]);
  const models = useMemo(() => (manifest?.assets ?? []).filter((a) => a.kind === 'model').map((a) => a.name), [manifest]);

  const blocking = blockingIssues(entry);
  // A 3D level is a top-down orthogonal map; an isometric one has no plan to place on.
  const planBroken = is3d && level.orientation !== 'orthogonal';
  const readOnly = entry.unreadable || blocking.length > 0 || planBroken;
  // Floorplan | 3D (Phase 136 Theme E): persisted per game; the switch eases the camera between the two.
  const can3d = is3d && !planBroken;
  const storedMode = useLevelViewStore((s) => levelViewMode(s, gameId));
  const viewMode: LevelViewMode = can3d ? storedMode : 'plan';
  /** The 3D view is mounted: from the switch until its ease back to the plan has finished. */
  const [mounted3d, setMounted3d] = useState(viewMode === '3d');
  /** Bumped on every switch to 3D, so a switch back mid-way through the exit ease starts a fresh view. */
  const [enterKey, setEnterKey] = useState(0);
  const [enterFrom, setEnterFrom] = useState<{ target: [number, number, number]; span: number } | null>(null);
  const [planViewIn, setPlanViewIn] = useState<View | null>(null);
  const planViewOut = useRef<{ view: View; size: { width: number; height: number } } | null>(null);
  const handle3d = useRef<Level3dHandle | null>(null);
  const planScale = { tilewidth: level.tilewidth, tileheight: level.tileheight, mpt: metresPerTile(level) };
  const switchView = (next: LevelViewMode) => {
    if (next === viewMode || !can3d) return;
    useLevelViewStore.getState().setMode(gameId, next);
    if (next === '3d') {
      const plan = planViewOut.current;
      setEnterFrom(plan ? planViewToFocus(plan.view, plan.size, planScale, groundY(level)) : null);
      if (!TOOLS_IN_3D.has(tool)) chooseTool('select');
      setEnterKey((k) => k + 1);
      setMounted3d(true);
      return;
    }
    const finish = (pose: { target: [number, number, number]; span: number }) => {
      // The user switched back to 3D before the ease finished: that view stays.
      if (levelViewMode(useLevelViewStore.getState(), gameId) === '3d') return;
      const plan = planViewOut.current;
      if (plan) setPlanViewIn(focusToPlanView(pose.target, pose.span, plan.size, planScale));
      setMounted3d(false);
    };
    if (handle3d.current) handle3d.current.exit(finish);
    else setMounted3d(false);
  };
  const in3d = viewMode === '3d';
  const canvasBox = useRef<HTMLDivElement | null>(null);
  // What the agent bridge may do to this screen (Phase 138 Themes G, H). Registered afresh each render, and reading
  // the store at call time, so a request that follows an edit in the same tick still sees it.
  useEffect(
    () =>
      registerEditorControls(gameId, {
        mode: () => (can3d && levelViewMode(useLevelViewStore.getState(), gameId) === '3d' && handle3d.current ? '3d' : 'plan'),
        can3d: () => can3d,
        terrain: () => useLevelStore.getState().byGame[gameId]?.terrain ?? null,
        frame: (rect, refs) => {
          if (can3d && levelViewMode(useLevelViewStore.getState(), gameId) === '3d' && handle3d.current) {
            handle3d.current.frameTo?.(rect, refs);
            return;
          }
          const size = planViewOut.current?.size;
          const current = useLevelStore.getState().byGame[gameId]?.edit.level;
          if (!size || !current) return;
          // Object coordinates to map pixels (the two differ on an isometric map), then the box they span.
          const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]].map(([x, y]) => objectToMapPoint(current, x!, y!));
          const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
          const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
          setPlanViewIn(frameView(box, size));
        },
        show3d: async (timeoutMs) => {
          if (!can3d) return false;
          if (!handle3d.current) switchView('3d');
          const until = Date.now() + timeoutMs;
          while (!handle3d.current && Date.now() < until) await new Promise((r) => setTimeout(r, 50)); // allow-timeout: polling for the lazy 3D view to mount
          return handle3d.current !== null;
        },
        capture3d: async (req) => (handle3d.current?.capture ? handle3d.current.capture(req) : null),
        capturePlan: async (req) => {
          const now = useLevelStore.getState().byGame[gameId];
          if (!now) return null;
          const objects = now.edit.level.layers.reduce((n, l) => n + (l.type === 'objectgroup' ? (l.objects?.length ?? 0) : 0), 0);
          if (!is3d) {
            // A tile level draws on the canvas the user sees: its picture is that canvas as it is.
            const canvas = canvasBox.current?.querySelector('canvas');
            if (!canvas) return null;
            return { png: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''), camera: null, objects, width: canvas.width, height: canvas.height };
          }
          const png = await capturePlan({
            level: now.edit.level,
            overlay: { terrain: now.terrain, terrainImage: null, draft: [], cursor: null, volume: null },
            selection: now.edit.selection,
            selected: now.edit.selected,
            rect: req.rect,
            width: req.width,
            height: req.height,
          });
          return { png, camera: null, objects, width: req.width, height: req.height };
        },
      }),
  );
  const snapSettings = useLevelViewStore((st) => st.snap);
  const setSnapSettings = useLevelViewStore((st) => st.setSnap);
  const tools = is3d ? (in3d ? TOOLS_3D.filter((t) => TOOLS_IN_3D.has(t.tool)) : TOOLS_3D) : TOOLS;
  const chooseTool = (next: LevelTool) => {
    setDraft([]);
    setVolumeDrag(null);
    setTool(next);
  };
  const update: Updater = (fn) => useLevelStore.getState().update(gameId, fn);

  // Prefabs (Phase 139 Theme G).
  const client = useQueryClient();
  const savePrefab = useSavePrefab(gameId);
  const deletePrefab = useDeletePrefab(gameId);
  const prefabList = usePrefabs(gameId).data;
  const [savingPrefab, setSavingPrefab] = useState<{ error: string | null } | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const requestDeletePrefab = useCallback(
    (name: string) => {
      const n = countInstances(levelRef.current, name);
      dialogs.confirm({
        title: `Delete prefab “${name}”?`,
        body: n === 0 ? 'No instances in this level.' : `${n} ${n === 1 ? 'instance' : 'instances'} in this level stay as plain objects.`,
        confirmLabel: 'Delete prefab',
        danger: true,
        onConfirm: () => {
          void deletePrefab.mutateAsync(name).then((error) => {
            if (error) notify(error, { danger: true });
            else arm(null);
          });
        },
      });
    },
    [dialogs, deletePrefab, notify],
  );
  const browserTabs = useAssetBrowserTabs({ gameId, is3d, onDeletePrefab: requestDeletePrefab });
  const openSavePrefab = () => {
    if (readOnly || edit.selected.length === 0) return;
    setSavingPrefab({ error: null });
  };
  const doSavePrefab = async (name: string) => {
    const prefab = prefabFromSelection(edit, name, is3d ? '3d' : '2d');
    if (!prefab) return;
    const error = await savePrefab.mutateAsync(prefab);
    if (error) {
      setSavingPrefab({ error });
      return;
    }
    const instanceId = crypto.randomUUID().slice(0, 8);
    update((s) => convertToInstance(s, name, instanceId));
    setSavingPrefab(null);
    notify(`Saved prefab “${name}”.`);
  };
  /** Update from prefab: re-read the file, apply it to every instance in this level, one undo step. */
  const updateFromPrefab = async (name: string) => {
    try {
      const prefab = await fetchPrefab(client, gameId, name);
      let counts = { updated: 0, skippedFields: 0 };
      update((s) => {
        const r = applyPrefabUpdate(s, prefab);
        counts = r;
        return r.state;
      });
      notify(counts.updated === 0 ? `No instances of “${name}” to update.` : `Updated ${counts.updated} ${counts.updated === 1 ? 'instance' : 'instances'}, kept ${counts.skippedFields} ${counts.skippedFields === 1 ? 'override' : 'overrides'}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : `Prefab “${name}” could not be read.`, { danger: true });
    }
  };
  const revertField = async (sel: ObjectRef, name: string, field: string) => {
    try {
      const prefab = await fetchPrefab(client, gameId, name);
      update((s) => revertOverride(s, sel, field, prefab));
    } catch (e) {
      notify(e instanceof Error ? e.message : `Prefab “${name}” could not be read.`, { danger: true });
    }
  };

  // A scene changed on disk by someone else (an agent, Tiled) shows up when there is nothing of ours to lose.
  const fresh = useLevel(gameId, entry.scene);
  const [diskConflict, setDiskConflict] = useState<GameLevelGetResult | null>(null);
  useEffect(() => {
    const data = fresh.data;
    if (!data) return;
    const decision = decideReload(data.level, edit);
    if (decision === 'same') {
      // The agent saved what is on screen: nothing to reload, only the dirty mark to clear.
      setDiskConflict(null);
      if (edit.dirty) update(markSaved);
      return;
    }
    if (decision === 'conflict') {
      setDiskConflict(data);
      return;
    }
    setDiskConflict(null);
    useLevelStore.getState().open(gameId, entry.scene, data);
    // Only a new fetch can change what is on disk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.dataUpdatedAt]);

  const activeLayer = layerById(level, edit.activeLayerId);
  const objectLayerId = activeLayer?.type === 'objectgroup' ? activeLayer.id! : (level.layers.find((l) => l.type === 'objectgroup')?.id ?? null);
  const tileLayerId = activeLayer?.type === 'tilelayer' ? activeLayer.id! : null;
  const selected = findObject(level, edit.selection);
  const entityName = entityType === CUSTOM ? custom.trim() : entityType;

  const tilesets = level.tilesets;
  const tiles = useMemo(() => paletteTiles({ tilesets }), [tilesets]);

  /**
   * The Select tool, both views (Phase 137 Theme C). Down on an object: Mod toggles it (no drag), Shift adds it, a plain
   * click keeps an already-selected set (so a group drag works) or selects only it, and the drag moves every selected
   * object as one undo step. Down on empty ground starts a marquee, which selects what it fully encloses.
   */
  const selectPointer = (e: CanvasPointer) => {
    const grabbed = e.hit ? findObject(level, e.hit) : undefined;
    if (e.phase === 'down') {
      if (e.hit && grabbed) {
        const ref = e.hit;
        if (e.mod) {
          update((s) => toggleSelected(s, ref));
          return;
        }
        const held = edit.selected.some((r) => sameRef(r, ref));
        // A prefab instance selects as a whole; Alt picks one object of it (Phase 139 Theme G).
        const whole = !e.alt && prefabInstanceOf(grabbed) ? instanceRefs(level, ref) : [ref];
        const refs = e.shift ? [...edit.selected.filter((r) => !whole.some((w) => sameRef(w, r))), ...whole] : held ? edit.selected : whole;
        selectDrag.current = { kind: 'group', refs, start: { x: grabbed.x, y: grabbed.y }, grab: { x: e.object.x - grabbed.x, y: e.object.y - grabbed.y }, applied: { x: 0, y: 0 } };
        update((s) => beginStroke(e.shift ? addSelected(s, whole) : held ? s : e.alt ? selectOnly(s, ref) : selectPrefabInstance(s, ref)));
      } else {
        selectDrag.current = { kind: 'marquee', from: e.object, mode: e.shift ? 'add' : e.mod ? 'toggle' : 'replace' };
        setMarquee({ x: e.object.x, y: e.object.y, width: 0, height: 0 });
      }
      return;
    }
    const d = selectDrag.current;
    if (!d) return;
    if (d.kind === 'marquee') {
      const rect = { x: Math.min(d.from.x, e.object.x), y: Math.min(d.from.y, e.object.y), width: Math.abs(e.object.x - d.from.x), height: Math.abs(e.object.y - d.from.y) };
      if (e.phase === 'move') {
        setMarquee(rect);
        return;
      }
      selectDrag.current = null;
      setMarquee(null);
      const layerIds = level.layers.filter((l) => l.type === 'objectgroup' && l.visible !== false && typeof l.id === 'number').map((l) => l.id!);
      update((s) => selectInRect(s, layerIds, rect, d.mode, (ref) => isSelectable(gameId, entry.scene, ref)));
      return;
    }
    if (e.phase === 'move') {
      // A 3D level snaps the grabbed point to the half-metre grid; a tile level drops the object on the cell under the pointer.
      const to = is3d ? snapPlan(level, { x: e.object.x - d.grab.x, y: e.object.y - d.grab.y }, e.alt, planSnapStep(level, snapSettings)) : e.alt || !e.cell ? e.object : cellCentre(level, e.cell);
      const total = { x: to.x - d.start.x, y: to.y - d.start.y };
      const dx = total.x - d.applied.x, dy = total.y - d.applied.y;
      d.applied = total;
      update((s) => moveObjects(s, d.refs, dx, dy));
      return;
    }
    selectDrag.current = null;
    update(endStroke);
  };

  /** Phase 139 Theme G: read the prefab file, then place one instance at `at` (one undo step, the instance is selected). */
  const placePrefabByName = async (name: string, layerId: number, at: PlanPoint) => {
    try {
      const prefab = await fetchPrefab(client, gameId, name);
      if ((prefab.dimension === '3d') !== is3d) {
        notify(`“${name}” is a ${prefab.dimension.toUpperCase()} prefab.`);
        return;
      }
      const instanceId = crypto.randomUUID().slice(0, 8);
      update((s) => placePrefab(setActiveLayer(s, layerId), layerId, prefab, at, instanceId));
    } catch (e) {
      notify(e instanceof Error ? e.message : `Prefab “${name}” could not be read.`, { danger: true });
    }
  };
  /** Phase 139 Theme D: a dragged or armed asset lands at `at` (plan pixels, snapped); one undo step, becomes the selection. */
  const placeAsset = (payload: AssetDragPayload, at: PlanPoint) => {
    if (readOnly) return;
    const refusal = placementRefusal(payload, is3d);
    if (refusal) {
      notify(refusal);
      return;
    }
    if (objectLayerId === null) {
      notify('Add an object layer first.');
      return;
    }
    const layerId = objectLayerId;
    if (payload.kind === 'prefab') {
      void placePrefabByName(payload.name, layerId, at);
      return;
    }
    update((s) => insertObjects(setActiveLayer(s, layerId), [{ layerId, object: dropToObject(payload, at, level) }]));
  };
  /** Click-to-place: an armed tile takes the next canvas click, then disarms. */
  const placeArmed = (at: PlanPoint): boolean => {
    if (!armedAsset) return false;
    arm(null);
    placeAsset(armedAsset, at);
    return true;
  };
  const assetDrop = readOnly
    ? undefined
    : {
        snap: (p: PlanPoint, alt: boolean) => (is3d ? snapPlan(level, p, alt, planSnapStep(level, snapSettings)) : p),
        // A drop, or the 3D view's armed ground click, ends any arming: one placement per arm.
        onDrop: (payload: AssetDragPayload, at: PlanPoint) => {
          arm(null);
          placeAsset(payload, at);
        },
      };

  /** Plan-view input for a 3D level: the same canvas, a different set of tools. Map pixels are object coordinates here. */
  const onPlanPointer = (e: CanvasPointer) => {
    const planStep = planSnapStep(level, snapSettings);
    const at = snapPlan(level, e.object, e.alt, planStep);
    const sel = e.hit;
    if (e.phase === 'down' && placeArmed(at)) return;
    if (e.phase === 'down') {
      if (tool === 'rotate') {
        const found = sel ? findObject(level, sel) : undefined;
        if (!sel || !found) return;
        planDrag.current = { kind: 'rotate', sel, centre: objectCentre(found) };
        update((s) => beginStroke(select(s, sel)));
      } else if (tool === 'entity') {
        if (objectLayerId === null || !entityName) return;
        update((s) => addObject(setActiveLayer(s, objectLayerId), objectLayerId, { type: entityName, x: at.x, y: at.y }));
      } else if (tool === 'volume') {
        if (objectLayerId === null) return;
        planDrag.current = { kind: 'volume', from: at };
        setVolumeDrag({ from: at, to: at });
      } else if (tool === 'path') {
        if (objectLayerId === null) return;
        setDraft((d) => addPathPoint(d, at));
      }
    } else if (e.phase === 'move') {
      const d = planDrag.current;
      if (!d) return;
      if (d.kind === 'rotate') update((s) => rotateObject(s, d.sel, rotationToward(d.centre, e.object), e.shift ? ROTATE_STEP : 0));
      else setVolumeDrag({ from: d.from, to: at });
    } else {
      const d = planDrag.current;
      planDrag.current = null;
      if (!d) return;
      if (d.kind === 'volume') {
        setVolumeDrag(null);
        if (objectLayerId !== null) update((s) => setVolume(s, objectLayerId, d.from, at));
      } else update(endStroke);
    }
  };

  const onPointer = (e: CanvasPointer) => {
    lastPointer.current = e.object;
    if (readOnly) return;
    if (e.phase === 'down' && placeArmed(e.object)) return;
    if (tool === 'select') {
      selectPointer(e);
      return;
    }
    if (is3d) {
      onPlanPointer(e);
      return;
    }
    const snap = (p: CanvasPointer) => (p.alt || !p.cell ? p.object : cellCentre(level, p.cell));
    if (e.phase === 'down') {
      if (tool === 'paint' || tool === 'erase') {
        if (tileLayerId === null || !e.cell) return;
        drag.current = { from: e.cell, last: e.cell };
        update((s) => (tool === 'paint' ? paint(beginStroke(s), tileLayerId, [e.cell!], gid) : erase(beginStroke(s), tileLayerId, [e.cell!])));
      } else if (tool === 'rect') {
        if (!e.cell) return;
        drag.current = { from: e.cell, last: e.cell };
        setPreview([e.cell]);
      } else if (tool === 'pick') {
        if (tileLayerId === null || !e.cell) return;
        const found = pick(edit, tileLayerId, e.cell);
        if (found > 0) {
          setGid(found);
          chooseTool('paint');
        }
      } else if (tool === 'entity') {
        if (objectLayerId === null || !entityName) return;
        const at = snap(e);
        update((s) => addObject(setActiveLayer(s, objectLayerId), objectLayerId, { type: entityName, x: at.x, y: at.y }));
      }
    } else if (e.phase === 'move') {
      const d = drag.current;
      if (!d) return;
      if (e.cell) {
        if (tool === 'rect') setPreview(rectCells(level, d.from, e.cell));
        else if (tileLayerId !== null) {
          const cells = lineCells(d.last, e.cell);
          d.last = e.cell;
          update((s) => (tool === 'paint' ? paint(s, tileLayerId, cells, gid) : erase(s, tileLayerId, cells)));
        }
      }
    } else {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (tool === 'rect') {
        setPreview(null);
        if (tileLayerId !== null && e.cell) update((s) => endStroke(fillRect(beginStroke(s), tileLayerId, d.from, e.cell!, gid)));
      } else update(endStroke);
    }
  };

  /** Mod+V (Theme B): the clipboard lands at the pointer when it is over the plan or tile canvas, else one tile off the original. */
  const pasteFromClipboard = async (target?: PlanPoint) => {
    const clip = await readClipboard();
    if (!clip) return;
    const mine = is3d ? '3d' : '2d';
    if (clip.dimension !== mine) {
      const from = clip.dimension.toUpperCase();
      notify(`Copied from a ${from} level — paste it into a ${from} level`);
      return;
    }
    if (objectLayerId === null) return;
    const pointer = target ?? (in3d ? null : lastPointer.current);
    const at = pointer ? (is3d ? snapPlan(level, pointer) : pointer) : { x: clip.origin.x + level.tilewidth, y: clip.origin.y + level.tileheight };
    update((s) => pasteClipboard(s, clip, objectLayerId, at));
  };

  /** Bring `ref` into view: the 3D camera eases onto it, the plan recentres on it at the current zoom (Theme H). */
  const frameObject = (ref: ObjectRef) => {
    const o = findObject(level, ref);
    if (!o) return;
    if (in3d) {
      handle3d.current?.frame?.();
      return;
    }
    const at = is3d ? objectCentre(o) : objectToMapPoint(level, o.x, o.y);
    setCentreOn((c) => ({ x: at.x, y: at.y, n: (c?.n ?? 0) + 1 }));
  };

  /** Hide / lock the selection (the context menu's items); the outliner's own buttons act on one row. */
  const toggleOnSelection = (kind: 'hidden' | 'locked', refs: readonly ObjectRef[]) => {
    const store = useLevelOutlinerStore.getState();
    (kind === 'hidden' ? store.toggleHidden : store.toggleLocked)(sceneKey(gameId, entry.scene), refs.map(refKey));
  };

  const menuActions = (edit: EditState, at?: PlanPoint): Parameters<typeof levelContextMenu>[3] => ({
    cut: () => {
      const clip = copySelection(edit);
      if (!clip) return;
      void writeClipboard(clip);
      update((s) => deleteObjects(s, s.selected));
    },
    copy: () => {
      const clip = copySelection(edit);
      if (clip) void writeClipboard(clip);
    },
    paste: (p) => void pasteFromClipboard(p ?? at),
    duplicate: () => update(duplicateSelection),
    remove: () => update((s) => deleteObjects(s, s.selected)),
    frame: () => {
      const ref = edit.selection ?? edit.selected[edit.selected.length - 1];
      if (ref) frameObject(ref);
    },
    hide: () => toggleOnSelection('hidden', edit.selected),
    lock: () => toggleOnSelection('locked', edit.selected),
    selectAllOfType: (type) => {
      const refs: ObjectRef[] = [];
      for (const l of level.layers) {
        if (l.type !== 'objectgroup' || typeof l.id !== 'number') continue;
        for (const o of l.objects ?? []) if ((o.type || o.class || '') === type && !hidden.has(refKey({ layerId: l.id, objectId: o.id }))) refs.push({ layerId: l.id, objectId: o.id });
      }
      update((s) => addSelected(selectOnly(s, null), refs));
    },
    selectAll: (layerId) => {
      const id = layerId ?? objectLayerId;
      if (id !== null) update((s) => selectAllInLayer(setActiveLayer(s, id), id));
    },
    align: (axis, edge) => update((s) => alignObjects(s, s.selected, axis, edge)),
    addLayer: (kind) => update((s) => addLayer(s, kind, kind === 'tile' ? 'tiles' : 'objects')),
    copyLivePosition: () => copyLiveOf(edit.selection ?? edit.selected[edit.selected.length - 1] ?? null),
    saveAsPrefab: openSavePrefab,
    selectInstances: (prefab) => update((s) => selectInstancesOf(s, prefab)),
  });

  /** "Copy live position": the object takes its live twin's position, as one undo step. */
  const copyLiveOf = (ref: ObjectRef | null) => {
    const twin = ref ? liveTwin(ghosts, ref) : null;
    if (ref && twin) update((s) => copyLivePosition(s, ref, twin, is3d));
  };

  /** Open the right-click menu (Theme I). Right-clicking an unselected object selects it first, as every engine does. */
  const openLevelMenu = async (point: { clientX: number; clientY: number }, target: LevelMenuTarget, at?: PlanPoint) => {
    let state = edit;
    if (target.kind === 'object' && !edit.selected.some((r) => sameRef(r, target.ref))) {
      state = selectOnly(edit, target.ref);
      update((s) => selectOnly(s, target.ref));
    }
    const clip = await readClipboard();
    const canPaste = clip !== null && clip.dimension === (is3d ? '3d' : '2d');
    const items = levelContextMenu(state, target, { canPaste, readOnly, liveTwin: target.kind === 'object' && liveOn && liveTwin(ghosts, target.ref) !== null }, menuActions(state, at), is3d);
    if (items.length === 0) return;
    if (dialogs.openMenu) dialogs.openMenu(point, items);
    else setMenuAt({ x: point.clientX, y: point.clientY, items });
  };

  // Play from here (Phase 140 Theme B): the unsaved level, from the selection or the pointer, in the runner.
  const playHere = usePlayFromHere({
    gameId,
    scene: entry.scene,
    getState: () => useLevelStore.getState().byGame[gameId]?.edit ?? edit,
    getPointer: () => lastPointer.current,
    readOnly,
    onStarted: onPlayStarted,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && armedAsset) {
      event.preventDefault();
      arm(null);
      return;
    }
    const cmd = matchShortcut(event, { view: in3d ? '3d' : 'plan', dimension: is3d ? '3d' : '2d', mac: isMac() });
    if (cmd === null) return;
    const pathing = is3d && tool === 'path' && !readOnly;
    switch (cmd) {
      case 'edit.undo':
      case 'edit.redo':
        event.preventDefault();
        update(cmd === 'edit.redo' ? redo : undo);
        return;
      case 'play.here':
      case 'play.stop':
        event.preventDefault();
        if (cmd === 'play.here') void playHere.play();
        else playHere.stop();
        return;
      case 'select.all':
        if (!readOnly && objectLayerId !== null) {
          event.preventDefault();
          update((s) => selectAllInLayer(s, objectLayerId));
        }
        return;
      case 'edit.copy':
      case 'edit.cut': {
        const clip = copySelection(edit);
        if (!clip) return;
        event.preventDefault();
        void writeClipboard(clip);
        if (cmd === 'edit.cut' && !readOnly) update((s) => deleteObjects(s, s.selected));
        return;
      }
      case 'edit.paste':
        if (!readOnly) {
          event.preventDefault();
          void pasteFromClipboard();
        }
        return;
      case 'edit.duplicate':
        if (!readOnly && edit.selected.length > 0) {
          event.preventDefault();
          update(duplicateSelection);
        }
        return;
      case 'select.nudge': {
        if (readOnly || edit.selected.length === 0) return;
        event.preventDefault();
        // One snap step (Theme F's plan step on a 3D level; a tile otherwise or when snapping is off), ten with Shift. An isometric map's objects are measured in tile-height units.
        const step = event.shiftKey ? 10 : 1;
        const planStep = is3d ? planSnapStep(level, snapSettings) : null;
        const sx = (planStep?.x ?? (level.orientation === 'isometric' ? level.tileheight : level.tilewidth)) * step, sy = (planStep?.y ?? level.tileheight) * step;
        const dx = event.key === 'ArrowLeft' ? -sx : event.key === 'ArrowRight' ? sx : 0;
        const dy = event.key === 'ArrowUp' ? -sy : event.key === 'ArrowDown' ? sy : 0;
        update((s) => nudgeObjects(s, s.selected, dx, dy));
        return;
      }
      case 'select.none':
        if (pathing && draft.length > 0) setDraft([]);
        else update((s) => selectOnly(s, null));
        return;
      case 'path.finish':
        if (!pathing) return;
        event.preventDefault();
        if (objectLayerId !== null) update((s) => finishPath(s, objectLayerId, draft));
        setDraft([]);
        return;
      case 'edit.delete':
        if (pathing && event.key === 'Backspace' && draft.length > 0) {
          event.preventDefault();
          setDraft((d) => d.slice(0, -1));
        } else if (edit.selected.length > 0 && !readOnly) {
          event.preventDefault();
          update((s) => deleteObjects(s, s.selected));
        }
        return;
      case 'help.shortcuts':
        event.preventDefault();
        setHelpOpen(true);
        return;
      case 'tool.select':
      case 'tool.entity':
      case 'tool.paint':
      case 'tool.erase':
      case 'tool.rect':
      case 'tool.pick':
      case 'tool.volume':
      case 'tool.path':
      case 'tool.rotate':
        if (!readOnly) {
          event.preventDefault();
          chooseTool(cmd.slice('tool.'.length) as LevelTool);
        }
        return;
      default:
        // gizmo.* and view.frame belong to the 3D view, which handles them before this runs.
        return;
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await save();
    } finally {
      setSaving(false);
    }
  };

  const firstIssue = entry.unreadable || blocking.length > 0 ? (blocking[0] ?? entry.issues[0]) : null;

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col" data-testid="level-editor">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1">
        <div role="radiogroup" aria-label="Tool" className="flex items-center gap-0.5">
          {tools.map(({ tool: t, label, key, icon: Icon }) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tool === t}
              aria-label={label}
              title={`${label} (${key.toUpperCase()})`}
              disabled={readOnly}
              onClick={() => chooseTool(t)}
              className={`rounded p-1.5 disabled:opacity-40 ${tool === t ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        {can3d ? (
          <div role="radiogroup" aria-label="View" className="flex items-center rounded border border-border p-0.5" data-testid="level-view-switch">
            {(
              [
                ['plan', 'Floorplan', LuMap],
                ['3d', '3D', LuBox],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={viewMode === m}
                onClick={() => switchView(m)}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${viewMode === m ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {is3d ? <LevelSnapPopover snap={snapSettings} onChange={setSnapSettings} is3d={in3d} /> : null}
        <LevelViewPopover overlays={overlays} onChange={(key, on) => {
          useLevelViewStore.getState().setOverlay(key, on);
          if (gameRunning) pushDebug(gameId, { [key]: on });
        }} navNeedsGame={!gameRunning} />
        <IconButton
          icon={LuRadio}
          label={liveOn ? 'Hide live entities' : 'Show live entities'}
          aria-pressed={liveOn}
          tone={liveOn ? 'brand' : 'ghost'}
          size="sm"
          disabled={!gameRunning}
          {...(gameRunning ? {} : { disabledReason: 'Run the game to see its entities live' })}
          data-testid="level-live-toggle"
          onClick={() => setLiveOn((on) => !on)}
        />
        {liveOn && gameRunning ? <LiveChip count={liveFeed ? liveFeed.entities.length : null} truncated={liveFeed?.truncated ?? false} /> : null}
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Undo" title="Undo (Mod+Z)" disabled={edit.past.length === 0} onClick={() => update(undo)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <LuUndo2 aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Redo" title="Redo (Mod+Shift+Z)" disabled={edit.future.length === 0} onClick={() => update(redo)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <LuRedo2 aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <LuKeyboard aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
        {edit.selected.length >= 2 && !readOnly ? (
          <LevelAlignBar
            count={edit.selected.length}
            onAlign={(axis: AlignAxis, edge: AlignEdge) => update((s) => alignObjects(s, s.selected, axis, edge))}
            onDistribute={(axis: AlignAxis) => update((s) => distributeObjects(s, s.selected, axis))}
          />
        ) : null}
        {edit.selected.length >= 2 && !readOnly ? (
          <button type="button" onClick={openSavePrefab} className="flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-1 text-xs hover:bg-accent">
            <LuBoxes aria-hidden className="h-3.5 w-3.5" />Save as prefab…
          </button>
        ) : null}
        <span className="truncate text-xs text-muted-foreground" data-testid="level-scene-name">{entry.scene}{edit.dirty ? ' •' : ''}</span>
        <button
          type="button"
          disabled={!edit.dirty || saving || readOnly}
          onClick={() => void doSave()}
          className="ml-auto flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <LuSave aria-hidden className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
        <PlayFromHereButton pending={playHere.pending} disabled={readOnly} onClick={() => void playHere.play()} />
      </div>
      <AgentChangeBanner gameId={gameId} entry={entry} />
      {diskConflict && edit.dirty ? (
        <p role="status" data-testid="level-banner-disk-changed" className="flex shrink-0 items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-xs text-foreground">
          <LuTriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          The level changed on disk while you have unsaved edits — Save keeps yours, Reload takes the file.
          <button
            type="button"
            onClick={() => {
              useLevelStore.getState().open(gameId, entry.scene, diskConflict);
              setDiskConflict(null);
            }}
            className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-accent"
          >
            Reload
          </button>
        </p>
      ) : null}
      {!readsLevels ? (
        <Banner testId="level-banner-no-reads">
          This game does not read level files yet. Edits are saved, but Play will not show them until its scenes load levels/ — the game-build skill has the recipe.
        </Banner>
      ) : null}
      {planBroken ? <Banner testId="level-banner-readonly">This 3D level is not an orthogonal top-down map, so it opens read-only.</Banner> : null}
      {firstIssue ? <Banner testId="level-banner-readonly">{`This level opens read-only: ${firstIssue}`}</Banner> : null}
      {entry.issues.filter((i) => !blocking.includes(i)).length > 0 ? <Banner testId="level-banner-images">{entry.issues.find((i) => !blocking.includes(i))!}</Banner> : null}
      <div className="flex min-h-0 flex-1">
        <LevelOutliner
          gameId={gameId}
          scene={entry.scene}
          level={level}
          selected={edit.selected}
          selection={edit.selection}
          activeLayerId={edit.activeLayerId}
          readOnly={readOnly}
          is3d={is3d}
          update={update}
          onFrame={frameObject}
          onContextMenu={(e, target) => void openLevelMenu(e, target)}
        />
        <AssetBrowser gameId={gameId} assets={manifestQuery.isLoading ? undefined : (manifest?.assets ?? [])} tabs={browserTabs}>
        <div ref={canvasBox} className="relative h-full min-w-0">
          <LevelCanvas
            level={level}
            images={entry.images}
            selection={edit.selection}
            selected={edit.selected}
            highlight={entry.highlight}
            marquee={marquee}
            hidden={hidden}
            locked={locked}
            centreOn={centreOn}
            onContextMenu={(e) => void openLevelMenu(e, e.hit ? { kind: 'object', ref: e.hit } : { kind: 'empty', at: e.object }, e.object)}
            hoverEnabled={!readOnly && !is3d && tool !== 'select'}
            plan={is3d && !planBroken ? { terrain: entry.terrain, draft, volume: volumeDrag } : undefined}
            extras={extras.canvas}
            preview={preview}
            onPointer={onPointer}
            onKeyDown={onKeyDown}
            viewOut={planViewOut}
            viewIn={planViewIn}
            assetDrop={assetDrop}
            label={
              is3d
                ? 'Level plan view, seen from above. Tools: V select and move, O place, R volume, P path (Enter finishes), Y rotate (Shift snaps to 15 degrees).'
                : `Level canvas, ${level.width} × ${level.height} tiles. Tools: B paint, E erase, R rectangle, I pick, O entity, V select.`
            }
          />
          {can3d && mounted3d ? (
            <div className="absolute inset-0">
              <Suspense fallback={<div className="h-full w-full" data-testid="level-3d-loading" />}>
                <Level3dView
                  key={enterKey}
                  gameId={gameId}
                  level={level}
                  terrain={entry.terrain}
                  selection={edit.selection}
                  selected={edit.selected}
                  readOnly={readOnly}
                  tool={tool}
                  entityName={entityName}
                  objectLayerId={objectLayerId}
                  pathDraft={draft}
                  extras={extras.scene}
                  onPathPoint={(p) => setDraft((d) => addPathPoint(d, p))}
                  update={update}
                  enterFrom={enterFrom}
                  handle={handle3d}
                  onEditorKey={onKeyDown}
                  assetDrop={assetDrop}
                  armed={armedAsset}
                  hidden={hidden}
                  locked={locked}
                  onContextMenu={(e) => void openLevelMenu(e, e.hit ? { kind: 'object', ref: e.hit } : { kind: 'empty', at: lastPointer.current ?? { x: 0, y: 0 } })}
                />
              </Suspense>
            </div>
          ) : null}
        </div>
        </AssetBrowser>
        <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-2 text-xs" aria-label="Palette and inspector">
          {tool === 'entity' ? (
            <div role="radiogroup" aria-label="Entity type" className="flex flex-wrap gap-1">
              {[...(is3d ? GAME_LEVEL_ENTITY_TYPES_3D.filter((t) => t !== 'path') : GAME_LEVEL_ENTITY_TYPES_2D), CUSTOM].map((t) => (
                <button key={t} type="button" role="radio" aria-checked={entityType === t} onClick={() => setEntityType(t)} className={`rounded border px-1.5 py-0.5 ${entityType === t ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}>
                  {t === CUSTOM ? 'Custom…' : t}
                </button>
              ))}
              {entityType === CUSTOM ? <input aria-label="Custom entity type" value={custom} onChange={(e) => setCustom(e.target.value)} className="mt-1 w-full rounded border border-border bg-background px-1.5 py-0.5" /> : null}
            </div>
          ) : is3d ? (
            <PlanHint tool={tool} drafting={draft.length} />
          ) : (
            <TilePalette tiles={tiles} images={entry.images} gid={gid} onGid={(g) => { setGid(g); if (tool === 'erase') chooseTool('paint'); }} />
          )}
          {selected && edit.selection ? <Inspector object={selected} readOnly={readOnly} onField={(f, v) => update((s) => setObjectField(s, edit.selection!, f, v))} onProperty={(n, t, v) => update((s) => setProperty(s, edit.selection!, n, t, v))} onRemove={(n) => update((s) => removeProperty(s, edit.selection!, n))} onDelete={() => update((s) => deleteObject(s, edit.selection!))} properties={selected.properties ?? []} onCopyLive={liveOn && liveTwin(ghosts, edit.selection) ? () => copyLiveOf(edit.selection) : undefined} prefab={(() => { const info = prefabInstanceOf(selected); return info ? { info, overrides: overriddenFields(selected), onSelectInstances: () => update((s) => selectInstancesOf(s, info.prefab)), onUpdate: () => void updateFromPrefab(info.prefab), onUnpack: () => update((s) => unpackInstance(s, edit.selection!)), onRevert: (f: string) => void revertField(edit.selection!, info.prefab, f) } : undefined; })()} plan={is3d ? { level, models, onNumber: (n, raw) => update((s) => setOptionalNumber(s, edit.selection!, n, raw)), onText: (n, raw) => update((s) => setOptionalText(s, edit.selection!, n, raw)) } : undefined} /> : null}
        </aside>
      </div>
      {savingPrefab ? (
        <SavePrefabDialog
          initialName={suggestPrefabName(selected?.name ?? '')}
          existing={(prefabList ?? []).map((p) => p.name)}
          busy={savePrefab.isPending}
          error={savingPrefab.error}
          onSave={(name) => void doSavePrefab(name)}
          onClose={() => setSavingPrefab(null)}
        />
      ) : null}
      <LevelShortcutHelp open={helpOpen} onClose={closeHelp} view={in3d ? '3d' : 'plan'} dimension={is3d ? '3d' : '2d'} />
      {menuAt ? <KitContextMenu x={menuAt.x} y={menuAt.y} items={menuAt.items} onClose={() => setMenuAt(null)} /> : null}
    </div>
  );
}

type PaletteTile = { gid: number; image: string; x: number; y: number; w: number; h: number; sheetW: number; sheetH: number };
const PALETTE_CAP = 1024;

/** Every embedded tileset's tiles with where each sits in its image (columns × rows from `tilecount`). */
export function paletteTiles(level: Pick<EditLevel, 'tilesets'>): PaletteTile[] {
  const out: PaletteTile[] = [];
  for (const t of level.tilesets) {
    const image = t.image;
    const firstgid = Number(t.firstgid ?? 1), columns = Number(t.columns ?? 0), count = Number(t.tilecount ?? 0);
    const w = Number(t.tilewidth ?? 0), h = Number(t.tileheight ?? 0);
    const margin = Number(t.margin ?? 0), spacing = Number(t.spacing ?? 0);
    if (typeof image !== 'string' || columns < 1 || count < 1 || w < 1 || h < 1) continue;
    const rows = Math.ceil(count / columns);
    for (let i = 0; i < count && out.length < PALETTE_CAP; i += 1) {
      out.push({ gid: firstgid + i, image, x: margin + (i % columns) * (w + spacing), y: margin + Math.floor(i / columns) * (h + spacing), w, h, sheetW: margin * 2 + columns * w + (columns - 1) * spacing, sheetH: margin * 2 + rows * h + (rows - 1) * spacing });
    }
  }
  return out;
}

function TilePalette({ tiles, images, gid, onGid }: { tiles: PaletteTile[]; images: ReadonlyArray<{ path: string; dataUrl: string }>; gid: number; onGid: (gid: number) => void }) {
  if (tiles.length === 0) return <p className="text-muted-foreground">This level has no tileset to paint with.</p>;
  const url = new Map(images.map((i) => [i.path, i.dataUrl]));
  return (
    <div role="radiogroup" aria-label="Tiles" className="flex flex-wrap gap-0.5">
      {tiles.map((t) => {
        const scale = Math.min(2, 32 / Math.max(t.w, t.h));
        return (
          <button
            key={t.gid}
            type="button"
            role="radio"
            aria-checked={gid === t.gid}
            aria-label={`Tile ${t.gid}`}
            onClick={() => onGid(t.gid)}
            className={`shrink-0 rounded-sm ${gid === t.gid ? 'ring-2 ring-primary' : 'ring-1 ring-border'}`}
            style={{
              width: t.w * scale,
              height: t.h * scale,
              backgroundImage: url.has(t.image) ? `url("${url.get(t.image)}")` : undefined,
              backgroundSize: `${t.sheetW * scale}px ${t.sheetH * scale}px`,
              backgroundPosition: `${-t.x * scale}px ${-t.y * scale}px`,
              imageRendering: 'pixelated',
            }}
          />
        );
      })}
    </div>
  );
}

const FIELDS: readonly { field: ObjectField; label: string; numeric: boolean }[] = [
  { field: 'name', label: 'Name', numeric: false },
  { field: 'type', label: 'Type', numeric: false },
  { field: 'x', label: 'X', numeric: true },
  { field: 'y', label: 'Y', numeric: true },
  { field: 'width', label: 'Width', numeric: true },
  { field: 'height', label: 'Height', numeric: true },
  { field: 'rotation', label: 'Rotation', numeric: true },
];

function Inspector({
  object,
  properties,
  readOnly,
  onField,
  onProperty,
  onRemove,
  onDelete,
  plan,
  onCopyLive,
  prefab,
}: {
  object: LevelObject;
  properties: readonly LevelProperty[];
  readOnly: boolean;
  onField: (field: ObjectField, value: string | number) => void;
  onProperty: (name: string, type: 'string' | 'int' | 'float' | 'bool', value: string | number | boolean) => void;
  onRemove: (name: string) => void;
  onDelete: () => void;
  /** Set for a 3D level: the placement fields and the world position. */
  plan?: PlanInspector;
  /** Set while the object has a live twin in the running game (Phase 140 Theme E). */
  onCopyLive?: () => void;
  /** Set for an object that belongs to a prefab instance (Phase 139 Theme G). */
  prefab?: { info: PrefabInstanceInfo; overrides: readonly string[]; onSelectInstances: () => void; onUpdate: () => void; onUnpack: () => void; onRevert: (field: string) => void };
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'string' | 'int' | 'float' | 'bool'>('string');
  const [value, setValue] = useState('');
  return (
    <section aria-label="Entity inspector" className="flex flex-col gap-1.5 border-t border-border pt-2">
      {prefab ? <PrefabInspectorRow info={prefab.info} overrides={prefab.overrides} readOnly={readOnly} onSelectInstances={prefab.onSelectInstances} onUpdate={prefab.onUpdate} onUnpack={prefab.onUnpack} onRevert={prefab.onRevert} /> : null}
      {FIELDS.map(({ field, label, numeric }) => {
        const current = field === 'type' ? (object.type || object.class || '') : (object[field] ?? (numeric ? 0 : ''));
        return (
          <label key={`${object.id}-${field}-${String(current)}`} className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
            <input
              aria-label={label}
              type={numeric ? 'number' : 'text'}
              defaultValue={String(current)}
              disabled={readOnly}
              className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5"
              onBlur={(e) => onField(field, numeric ? Number(e.target.value) : e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                e.stopPropagation();
              }}
            />
          </label>
        );
      })}
      {onCopyLive ? (
        <div className="flex items-center gap-1.5" data-testid="inspector-live">
          <span className="w-14 shrink-0 text-muted-foreground">Live</span>
          <IconButton icon={LuRadio} label="Copy live position" size="sm" disabled={readOnly} onClick={onCopyLive} data-testid="inspector-copy-live" />
        </div>
      ) : null}
      {plan ? <PlanFields object={object} readOnly={readOnly} plan={plan} /> : null}
      <ul aria-label="Custom properties" className="flex flex-col gap-0.5">
        {properties.filter((p) => !plan || !MANAGED_3D.includes(p.name)).map((p) => (
          <li key={p.name} className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate" title={`${p.name} (${p.type})`}>{p.name}: {String(p.value)}</span>
            <button type="button" aria-label={`Remove property ${p.name}`} disabled={readOnly} onClick={() => onRemove(p.name)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40">
              <LuTrash2 aria-hidden className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <input aria-label="Property name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5" />
        <select aria-label="Property type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded border border-border bg-background px-1 py-0.5">
          {['string', 'int', 'float', 'bool'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1">
        <input aria-label="Property value" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5" />
        <button
          type="button"
          disabled={readOnly || name.trim() === ''}
          onClick={() => {
            onProperty(name.trim(), type, value);
            setName('');
            setValue('');
          }}
          className="rounded border border-border px-1.5 py-0.5 hover:bg-accent disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <button type="button" disabled={readOnly} onClick={onDelete} className="flex items-center justify-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent disabled:opacity-40">
        <LuTrash2 aria-hidden className="h-3 w-3" />Delete entity
      </button>
    </section>
  );
}

type PlanInspector = {
  level: EditLevel;
  /** This game's `model` assets, by name. */
  models: readonly string[];
  onNumber: (name: string, raw: string) => void;
  onText: (name: string, raw: string) => void;
};

function PlanHint({ tool, drafting }: { tool: LevelTool; drafting: number }) {
  const text: Partial<Record<LevelTool, string>> = {
    select: 'Click an object to select it; drag to move it (half-metre snap, Alt for free).',
    volume: 'Drag a rectangle to make a box prop, 3 m tall by default.',
    path: drafting > 0 ? `${drafting} point${drafting === 1 ? '' : 's'}. Enter finishes, Backspace removes the last, Escape cancels.` : 'Click points along the route; Enter finishes the path.',
    rotate: 'Drag around an object to turn it. Shift snaps to 15 degrees.',
  };
  return <p className="text-muted-foreground" data-testid="plan-hint">{text[tool] ?? ''}</p>;
}

const trim = (n: number): string => String(Number(n.toFixed(3)));

/** Placement fields of a 3D object. The world position is read-only and comes from `levelEntityToWorld`, so it is what the kit builds. */
function PlanFields({ object, readOnly, plan }: { object: LevelObject; readOnly: boolean; plan: PlanInspector }) {
  const props = levelProperties(object);
  const world = levelEntityToWorld(object, plan.level);
  const text = (name: string): string => (typeof props[name] === 'string' ? (props[name] as string) : '');
  const number = (name: string, label: string, placeholder: string) => {
    const v = props[name];
    const current = typeof v === 'number' ? String(v) : '';
    return (
      <label key={`${object.id}-${name}-${current}`} className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
        <input
          aria-label={label}
          type="number"
          step="any"
          placeholder={placeholder}
          defaultValue={current}
          disabled={readOnly}
          className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5"
          onBlur={(e) => plan.onNumber(name, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            e.stopPropagation();
          }}
        />
      </label>
    );
  };
  const model = text('model');
  const models = model && !plan.models.includes(model) ? [model, ...plan.models] : plan.models;
  const isLight = (object.type || object.class) === 'light';
  return (
    <div className="flex flex-col gap-1.5" data-testid="plan-fields">
      <p className="text-muted-foreground" data-testid="inspector-world">
        World: {trim(world.position[0])}, {world.position[1] === null ? 'ground' : trim(world.position[1])}, {trim(world.position[2])} m
      </p>
      {number('elevation', 'Elevation (m)', 'ground')}
      {number('sizeY', 'Size Y (m)', '3')}
      {number('pitch', 'Pitch (°)', '0')}
      {number('roll', 'Roll (°)', '0')}
      {number('scale', 'Scale', '1')}
      <label className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted-foreground">Model</span>
        <select aria-label="Model" value={model} disabled={readOnly} onChange={(e) => plan.onText('model', e.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5">
          <option value="">Box</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted-foreground">Collider</span>
        <select aria-label="Collider" value={text('collider') || 'box'} disabled={readOnly} onChange={(e) => plan.onText('collider', e.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5">
          <option value="box">box</option>
          <option value="none">none</option>
        </select>
      </label>
      {isLight ? (
        <>
          {number('intensity', 'Intensity', '10')}
          {number('range', 'Range (m)', '0')}
          <label className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-muted-foreground">Colour</span>
            <input aria-label="Colour" type="color" value={/^#[0-9a-f]{6}$/i.test(text('color')) ? text('color') : '#ffffff'} disabled={readOnly} onChange={(e) => plan.onText('color', e.target.value)} className="h-6 w-full rounded border border-border bg-background" />
          </label>
        </>
      ) : null}
    </div>
  );
}

/** A prefab name from an object's name: lower-case, dashes for anything the name schema would refuse. */
function suggestPrefabName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 64);
}
