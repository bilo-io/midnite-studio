import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  LuEraser,
  LuEye,
  LuEyeOff,
  LuMap,
  LuMapPin,
  LuMousePointer2,
  LuPaintbrush,
  LuPipette,
  LuPencilRuler,
  LuPlus,
  LuRedo2,
  LuRotateCw,
  LuRoute,
  LuSave,
  LuBox,
  LuSquare,
  LuTrash2,
  LuTriangleAlert,
  LuUndo2,
} from 'react-icons/lu';
import { useQueryClient } from '@tanstack/react-query';

import { GAME_LEVEL_ENTITY_TYPES_2D, GAME_LEVEL_ENTITY_TYPES_3D, levelEntityToWorld, levelProperties, metresPerTile } from '@midnite/studio-shared';
import { EmptyState, EmptyStateButton, Skeleton } from '@midnite/studio-frame';

import { LevelCanvas, type CanvasPointer } from './level-canvas';
import {
  addLayer,
  addObject,
  addPathPoint,
  beginStroke,
  cellCentre,
  deleteObject,
  endStroke,
  erase,
  fillRect,
  finishPath,
  findObject,
  isLevel3d,
  layerById,
  moveObject,
  paint,
  pick,
  redo,
  removeProperty,
  renameLayer,
  rotateObject,
  rotationToward,
  objectCentre,
  select,
  setActiveLayer,
  setObjectField,
  setOptionalNumber,
  setOptionalText,
  setProperty,
  setVolume,
  toggleVisible,
  undo,
  rectCells,
  type Cell,
  type EditLevel,
  type EditState,
  type LevelObject,
  type LevelProperty,
  type ObjectField,
  type PlanPoint,
} from './level-edit-model';
import { snapPlan } from './level-plan';
import { blockingIssues, useLevelStore, type OpenLevel } from './level-store';
import { lineCells, type View } from './level-view';
import { focusToPlanView, planViewToFocus } from './3d/camera-transition';
import type { Level3dHandle } from './3d/level-3d-view';
import { levelViewMode, useLevelViewStore, type LevelViewMode } from './3d/level-view-store';
import { groundY } from './3d/level-world';
import { fetchLevel, useGameManifest, useLevel, useLevels, useSaveOpenLevel } from './use-levels';

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
const TOOLS_IN_3D: ReadonlySet<LevelTool> = new Set(['select', 'entity']);

type Updater = (fn: (state: EditState) => EditState) => void;

/**
 * The Level editor tab's content (Phase 132 Theme D): a toolbar, the layer list, the canvas and a palette with
 * the entity inspector. The open level and its undo stack live in the per-game {@link useLevelStore}, so
 * switching tabs, scenes or games loses nothing. The letter keys and `Mod+z` act only while the canvas has
 * focus; they are deliberately not in the app's command registry.
 */
export function LevelEditor({ gameId }: { gameId: string | null }) {
  const client = useQueryClient();
  const levels = useLevels(gameId);
  const entry = useLevelStore((s) => (gameId ? s.byGame[gameId] : undefined));
  const openNewScene = useLevelStore((s) => s.openNewScene);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tried = useRef<string | null>(null);

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
  return <OpenEditor key={`${gameId}:${entry.scene}`} gameId={gameId} entry={entry} readsLevels={list?.readsLevels ?? false} />;
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

function OpenEditor({ gameId, entry, readsLevels }: { gameId: string; entry: OpenLevel; readsLevels: boolean }) {
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
  const drag = useRef<{ from: Cell; last: Cell } | { move: NonNullable<typeof edit.selection> } | null>(null);
  const planDrag = useRef<
    { kind: 'move'; sel: NonNullable<typeof edit.selection>; grab: PlanPoint } | { kind: 'rotate'; sel: NonNullable<typeof edit.selection>; centre: PlanPoint } | { kind: 'volume'; from: PlanPoint } | null
  >(null);
  const [draft, setDraft] = useState<PlanPoint[]>([]);
  const [volumeDrag, setVolumeDrag] = useState<{ from: PlanPoint; to: PlanPoint } | null>(null);
  const manifest = useGameManifest(gameId).data ?? null;
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
      setMounted3d(true);
      return;
    }
    const finish = (pose: { target: [number, number, number]; span: number }) => {
      const plan = planViewOut.current;
      if (plan) setPlanViewIn(focusToPlanView(pose.target, pose.span, plan.size, planScale));
      setMounted3d(false);
    };
    if (handle3d.current) handle3d.current.exit(finish);
    else setMounted3d(false);
  };
  const in3d = viewMode === '3d';
  const tools = is3d ? (in3d ? TOOLS_3D.filter((t) => TOOLS_IN_3D.has(t.tool)) : TOOLS_3D) : TOOLS;
  const chooseTool = (next: LevelTool) => {
    setDraft([]);
    setVolumeDrag(null);
    setTool(next);
  };
  const update: Updater = (fn) => useLevelStore.getState().update(gameId, fn);

  // A scene changed on disk by someone else (an agent, Tiled) shows up when there is nothing of ours to lose.
  const fresh = useLevel(gameId, entry.scene);
  useEffect(() => {
    const data = fresh.data;
    if (!data || edit.dirty) return;
    if (JSON.stringify(data.level) === JSON.stringify(edit.level)) return;
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

  /** Plan-view input for a 3D level: the same canvas, a different set of tools. Map pixels are object coordinates here. */
  const onPlanPointer = (e: CanvasPointer) => {
    const at = snapPlan(level, e.object, e.alt);
    const sel = e.hit;
    if (e.phase === 'down') {
      if (tool === 'select' || tool === 'rotate') {
        const found = sel ? findObject(level, sel) : undefined;
        if (!sel || !found) {
          if (tool === 'select') update((s) => select(s, null));
          return;
        }
        planDrag.current = tool === 'select' ? { kind: 'move', sel, grab: { x: e.object.x - found.x, y: e.object.y - found.y } } : { kind: 'rotate', sel, centre: objectCentre(found) };
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
      if (d.kind === 'move') {
        const to = snapPlan(level, { x: e.object.x - d.grab.x, y: e.object.y - d.grab.y }, e.alt);
        update((s) => moveObject(s, d.sel, to.x, to.y));
      } else if (d.kind === 'rotate') update((s) => rotateObject(s, d.sel, rotationToward(d.centre, e.object), e.shift ? ROTATE_STEP : 0));
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
    if (readOnly) return;
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
      } else if (tool === 'select') {
        if (e.hit) {
          drag.current = { move: e.hit };
          update((s) => beginStroke(select(s, e.hit)));
        } else update((s) => select(s, null));
      }
    } else if (e.phase === 'move') {
      const d = drag.current;
      if (!d) return;
      if ('move' in d) {
        const at = snap(e);
        update((s) => moveObject(s, d.move, at.x, at.y));
      } else if (e.cell) {
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
      if ('move' in d) update(endStroke);
      else if (tool === 'rect') {
        setPreview(null);
        if (tileLayerId !== null && e.cell) update((s) => endStroke(fillRect(beginStroke(s), tileLayerId, d.from, e.cell!, gid)));
      } else update(endStroke);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      update(event.shiftKey ? redo : undo);
      return;
    }
    if (mod || event.altKey) return;
    if (is3d && tool === 'path' && !readOnly) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (objectLayerId !== null) update((s) => finishPath(s, objectLayerId, draft));
        setDraft([]);
        return;
      }
      if (event.key === 'Escape') {
        setDraft([]);
        return;
      }
      if (event.key === 'Backspace' && draft.length > 0) {
        event.preventDefault();
        setDraft((d) => d.slice(0, -1));
        return;
      }
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && edit.selection && !readOnly) {
      event.preventDefault();
      const sel = edit.selection;
      update((s) => deleteObject(s, sel));
      return;
    }
    const hit = tools.find((t) => t.key === event.key.toLowerCase());
    if (hit && !readOnly) {
      event.preventDefault();
      chooseTool(hit.tool);
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
    <div className="flex h-full min-h-0 flex-col" data-testid="level-editor">
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
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Undo" title="Undo (Mod+Z)" disabled={edit.past.length === 0} onClick={() => update(undo)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <LuUndo2 aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Redo" title="Redo (Mod+Shift+Z)" disabled={edit.future.length === 0} onClick={() => update(redo)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
            <LuRedo2 aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
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
      </div>
      {!readsLevels ? (
        <Banner testId="level-banner-no-reads">
          This game does not read level files yet. Edits are saved, but Play will not show them until its scenes load levels/ — the game-build skill has the recipe.
        </Banner>
      ) : null}
      {planBroken ? <Banner testId="level-banner-readonly">This 3D level is not an orthogonal top-down map, so it opens read-only.</Banner> : null}
      {firstIssue ? <Banner testId="level-banner-readonly">{`This level opens read-only: ${firstIssue}`}</Banner> : null}
      {entry.issues.filter((i) => !blocking.includes(i)).length > 0 ? <Banner testId="level-banner-images">{entry.issues.find((i) => !blocking.includes(i))!}</Banner> : null}
      <div className="flex min-h-0 flex-1">
        <LayerList level={level} activeLayerId={edit.activeLayerId} readOnly={readOnly} update={update} is3d={is3d} />
        <div className="relative min-w-0 flex-1">
          <LevelCanvas
            level={level}
            images={entry.images}
            selection={edit.selection}
            hoverEnabled={!readOnly && !is3d && tool !== 'select'}
            plan={is3d && !planBroken ? { terrain: entry.terrain, draft, volume: volumeDrag } : undefined}
            preview={preview}
            onPointer={onPointer}
            onKeyDown={onKeyDown}
            viewOut={planViewOut}
            viewIn={planViewIn}
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
                  gameId={gameId}
                  level={level}
                  terrain={entry.terrain}
                  selection={edit.selection}
                  readOnly={readOnly}
                  tool={tool}
                  entityName={entityName}
                  objectLayerId={objectLayerId}
                  update={update}
                  enterFrom={enterFrom}
                  handle={handle3d}
                  onEditorKey={onKeyDown}
                />
              </Suspense>
            </div>
          ) : null}
        </div>
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
          {selected && edit.selection ? <Inspector object={selected} readOnly={readOnly} onField={(f, v) => update((s) => setObjectField(s, edit.selection!, f, v))} onProperty={(n, t, v) => update((s) => setProperty(s, edit.selection!, n, t, v))} onRemove={(n) => update((s) => removeProperty(s, edit.selection!, n))} onDelete={() => update((s) => deleteObject(s, edit.selection!))} properties={selected.properties ?? []} plan={is3d ? { level, models, onNumber: (n, raw) => update((s) => setOptionalNumber(s, edit.selection!, n, raw)), onText: (n, raw) => update((s) => setOptionalText(s, edit.selection!, n, raw)) } : undefined} /> : null}
        </aside>
      </div>
    </div>
  );
}

function LayerList({ level, activeLayerId, readOnly, update, is3d }: { level: EditLevel; activeLayerId: number | null; readOnly: boolean; update: Updater; is3d: boolean }) {
  const [renaming, setRenaming] = useState<number | null>(null);
  // The top layer first, as Tiled lists them.
  const layers = [...level.layers].reverse();
  return (
    <aside className="flex w-44 shrink-0 flex-col border-r border-border text-xs" aria-label="Layers">
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {layers.map((layer) => {
          const id = layer.id!;
          const active = id === activeLayerId;
          return (
            <li key={id} className={`group flex items-center gap-1 px-1.5 py-1 ${active ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
              <button type="button" aria-label={`${layer.visible === false ? 'Show' : 'Hide'} layer ${layer.name}`} aria-pressed={layer.visible !== false} onClick={() => update((s) => toggleVisible(s, id))} className="shrink-0 rounded p-0.5 hover:text-foreground">
                {layer.visible === false ? <LuEyeOff aria-hidden className="h-3.5 w-3.5" /> : <LuEye aria-hidden className="h-3.5 w-3.5" />}
              </button>
              {renaming === id ? (
                <input
                  autoFocus
                  aria-label={`Rename layer ${layer.name}`}
                  defaultValue={layer.name}
                  className="min-w-0 flex-1 rounded border border-border bg-background px-1"
                  onBlur={(e) => {
                    update((s) => renameLayer(s, id, e.target.value));
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button type="button" aria-label={`Layer ${layer.name}`} aria-current={active ? 'true' : undefined} onClick={() => update((s) => setActiveLayer(s, id))} onDoubleClick={() => !readOnly && setRenaming(id)} className="min-w-0 flex-1 truncate text-left">
                  {layer.name}
                  <span className="ml-1 opacity-60">{layer.type === 'objectgroup' ? '◆' : '▦'}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-1 border-t border-border p-1.5">
        {is3d ? null : <button type="button" disabled={readOnly} onClick={() => update((s) => addLayer(s, 'tile', 'tiles'))} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-1 py-0.5 hover:bg-accent disabled:opacity-40">
          <LuPlus aria-hidden className="h-3 w-3" />Tile layer
        </button>}
        <button type="button" disabled={readOnly} onClick={() => update((s) => addLayer(s, 'object', 'objects'))} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-1 py-0.5 hover:bg-accent disabled:opacity-40">
          <LuPlus aria-hidden className="h-3 w-3" />Object layer
        </button>
      </div>
    </aside>
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
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'string' | 'int' | 'float' | 'bool'>('string');
  const [value, setValue] = useState('');
  return (
    <section aria-label="Entity inspector" className="flex flex-col gap-1.5 border-t border-border pt-2">
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
