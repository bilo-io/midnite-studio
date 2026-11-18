import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { LuEye, LuEyeOff, LuLock, LuLockOpen, LuPanelLeftOpen, LuPlus } from 'react-icons/lu';

import { EmptyState, EmptyStateButton, ExplorerSearch, ResizeHandle, useResizable } from '@midnite/studio-frame';

import { IconButton } from '../chrome';
import { addLayer, addSelected, renameLayer, selectOnly, setActiveLayer, toggleSelected, toggleVisible, type EditLevel, type EditState, type ObjectRef } from './level-edit-model';
import type { LevelMenuTarget } from './level-context-menu';
import { buildLevelOutline, rangeRefs, type OutlineRow } from './level-outline';
import { hiddenKeys, lockedKeys, OUTLINER_WIDTH, useLevelOutlinerStore } from './level-outliner-store';
import { PLAN_COLOURS } from './level-plan-draw';
import { refKey } from './level-selection';

type Updater = (fn: (state: EditState) => EditState) => void;

const ROW_H = 24;
/** Past this many rows the list renders only the rows in view. */
export const VIRTUALISE_OVER = 2000;
const rowKey = (row: OutlineRow): string => (row.kind === 'layer' ? `L${row.layerId}` : refKey(row.ref));

export type LevelOutlinerProps = {
  gameId: string;
  scene: string;
  level: EditLevel;
  selected: readonly ObjectRef[];
  selection: ObjectRef | null;
  activeLayerId: number | null;
  readOnly: boolean;
  is3d: boolean;
  update: Updater;
  /** Double-click or F: select the object and bring it into view. */
  onFrame: (ref: ObjectRef) => void;
  onContextMenu: (event: ReactMouseEvent, target: LevelMenuTarget) => void;
};

/**
 * The left aside (Phase 137 Theme H): layers with their objects as a searchable tree, an editor-only hide and lock
 * per object, resizable and collapsible to a strip. Replaces the old layer list; its layer rows keep the saved
 * Tiled `visible` eye.
 */
export function LevelOutliner(props: LevelOutlinerProps) {
  const { gameId, scene, level, selected, selection, activeLayerId, readOnly, is3d, update } = props;
  const width = useLevelOutlinerStore((s) => s.width);
  const collapsedAside = useLevelOutlinerStore((s) => s.collapsed);
  const setWidth = useLevelOutlinerStore((s) => s.setWidth);
  const setCollapsed = useLevelOutlinerStore((s) => s.setCollapsed);
  const hiddenList = useLevelOutlinerStore((s) => hiddenKeys(s, gameId, scene));
  const lockedList = useLevelOutlinerStore((s) => lockedKeys(s, gameId, scene));
  const toggleHidden = useLevelOutlinerStore((s) => s.toggleHidden);
  const toggleLocked = useLevelOutlinerStore((s) => s.toggleLocked);

  const resizable = useResizable({
    size: width,
    onSize: setWidth,
    min: OUTLINER_WIDTH.min,
    max: OUTLINER_WIDTH.max,
    initial: OUTLINER_WIDTH.initial,
    axis: 'x',
    edge: 'start',
    onCollapse: () => setCollapsed(true),
  });

  const [query, setQuery] = useState('');
  const [collapsedLayers, setCollapsedLayers] = useState<ReadonlySet<number>>(new Set());
  const [renaming, setRenaming] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<ObjectRef | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 400 });
  const list = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const locked = useMemo(() => new Set(lockedList), [lockedList]);
  const rows = useMemo(() => buildLevelOutline(level, { query, collapsed: collapsedLayers, hidden, locked }), [level, query, collapsedLayers, hidden, locked]);
  const selectedKeys = useMemo(() => new Set(selected.map(refKey)), [selected]);
  const hasObjectLayer = level.layers.some((l) => l.type === 'objectgroup');
  const keys = rows.map(rowKey);
  const current = focusKey !== null && keys.includes(focusKey) ? focusKey : keys[0] ?? null;

  useEffect(() => {
    if (!moveFocus.current || current === null) return;
    moveFocus.current = false;
    Array.from(list.current?.querySelectorAll<HTMLElement>('[data-rowkey]') ?? []).find((el) => el.dataset.rowkey === current)?.focus();
  });

  if (collapsedAside) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-r border-border py-1" aria-label="Outliner" data-testid="level-outliner-strip">
        <IconButton icon={LuPanelLeftOpen} label="Show outliner" onClick={() => setCollapsed(false)} />
      </aside>
    );
  }

  const focusRow = (key: string) => {
    moveFocus.current = true;
    setFocusKey(key);
  };
  const toggleLayer = (layerId: number, open?: boolean) =>
    setCollapsedLayers((s) => {
      const next = new Set(s);
      const isOpen = !next.has(layerId);
      if ((open ?? !isOpen) === true) next.delete(layerId);
      else next.add(layerId);
      return next;
    });

  const clickObject = (row: Extract<OutlineRow, { kind: 'object' }>, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const ref = row.ref;
    setFocusKey(rowKey(row));
    if (e.metaKey || e.ctrlKey) {
      update((s) => toggleSelected(s, ref));
      setAnchor(ref);
    } else if (e.shiftKey && anchor) {
      update((s) => addSelected(s, rangeRefs(rows, anchor, ref)));
    } else {
      update((s) => selectOnly(s.activeLayerId === ref.layerId ? s : setActiveLayer(s, ref.layerId), ref));
      setAnchor(ref);
    }
  };

  const activate = (row: OutlineRow) => {
    if (row.kind === 'object') clickObject(row, { shiftKey: false, metaKey: false, ctrlKey: false });
    else update((s) => setActiveLayer(s, row.layerId));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return;
    const i = current === null ? -1 : keys.indexOf(current);
    const row = rows[i];
    if (!row) return;
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, i + step))];
      if (!next) return;
      focusRow(rowKey(next));
      if (e.shiftKey && next.kind === 'object') {
        const from = anchor ?? (row.kind === 'object' ? row.ref : next.ref);
        if (!anchor) setAnchor(from);
        update((s) => addSelected(s, rangeRefs(rows, from, next.ref)));
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(row);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (row.kind === 'layer') toggleLayer(row.layerId, false);
      else focusRow(`L${row.ref.layerId}`);
    } else if (e.key === 'ArrowRight' && row.kind === 'layer') {
      e.preventDefault();
      toggleLayer(row.layerId, true);
    } else if (row.kind === 'object' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'f') {
        e.preventDefault();
        props.onFrame(row.ref);
      } else if (k === 'h') {
        e.preventDefault();
        toggleHidden(`${gameId}/${scene}`, [refKey(row.ref)]);
      } else if (k === 'l') {
        e.preventDefault();
        toggleLocked(`${gameId}/${scene}`, [refKey(row.ref)]);
      }
    }
  };

  const virtual = rows.length > VIRTUALISE_OVER;
  const first = virtual ? Math.max(0, Math.floor(scroll.top / ROW_H) - 10) : 0;
  const last = virtual ? Math.min(rows.length, Math.ceil((scroll.top + scroll.height) / ROW_H) + 10) : rows.length;
  const sceneKey = `${gameId}/${scene}`;

  const renderRow = (row: OutlineRow) => {
    const key = rowKey(row);
    const tab = key === current ? 0 : -1;
    if (row.kind === 'layer') {
      const active = row.layerId === activeLayerId;
      const open = !collapsedLayers.has(row.layerId) || query !== '';
      return (
        <div
          key={key}
          role="treeitem"
          aria-level={1}
          aria-selected={active}
          aria-expanded={row.layerKind === 'object' ? open : undefined}
          data-rowkey={key}
          tabIndex={tab}
          style={{ height: ROW_H }}
          onFocus={() => setFocusKey(key)}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onContextMenu(e, { kind: 'layer', layerId: row.layerId });
          }}
          className={`group flex items-center gap-1 px-1.5 outline-none focus-visible:ring-1 focus-visible:ring-primary ${active ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
        >
          <button type="button" aria-label={`${row.visible ? 'Hide' : 'Show'} layer ${row.name}`} title="Hide layer (saved)" aria-pressed={row.visible} tabIndex={-1} onClick={() => update((s) => toggleVisible(s, row.layerId))} className="shrink-0 rounded p-0.5 hover:text-foreground">
            {row.visible ? <LuEye aria-hidden className="h-3.5 w-3.5" /> : <LuEyeOff aria-hidden className="h-3.5 w-3.5" />}
          </button>
          {renaming === row.layerId ? (
            <input
              autoFocus
              aria-label={`Rename layer ${row.name}`}
              defaultValue={row.name}
              className="min-w-0 flex-1 rounded border border-border bg-background px-1"
              onBlur={(e) => {
                update((s) => renameLayer(s, row.layerId, e.target.value));
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <button
              type="button"
              aria-label={`Layer ${row.name}`}
              aria-current={active ? 'true' : undefined}
              tabIndex={-1}
              onClick={() => {
                update((s) => setActiveLayer(s, row.layerId));
                if (row.layerKind === 'object') toggleLayer(row.layerId);
              }}
              onDoubleClick={() => !readOnly && setRenaming(row.layerId)}
              className="min-w-0 flex-1 truncate text-left"
            >
              {row.name}
              <span className="ml-1 opacity-60">{row.layerKind === 'object' ? `◆ ${row.count}` : '▦'}</span>
            </button>
          )}
        </div>
      );
    }
    const chosen = selectedKeys.has(key);
    const primary = selection !== null && refKey(selection) === key;
    return (
      <div
        key={key}
        role="treeitem"
        aria-level={2}
        aria-label={row.name}
        aria-selected={chosen}
        data-rowkey={key}
        tabIndex={tab}
        style={{ height: ROW_H }}
        onFocus={() => setFocusKey(key)}
        onClick={(e) => clickObject(row, e)}
        onDoubleClick={() => {
          update((s) => selectOnly(s, row.ref));
          props.onFrame(row.ref);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!chosen) update((s) => selectOnly(s, row.ref));
          props.onContextMenu(e, { kind: 'object', ref: row.ref });
        }}
        className={`group flex cursor-default items-center gap-1.5 pl-5 pr-1.5 outline-none focus-visible:ring-1 focus-visible:ring-primary ${chosen ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent/50'} ${primary ? 'font-medium' : ''} ${row.hidden ? 'opacity-50' : ''}`}
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: PLAN_COLOURS[row.type] ?? '#9ca3af' }} />
        <span className="min-w-0 flex-1 truncate">{row.name}</span>
        <span className={row.hidden ? '' : 'invisible group-hover:visible group-focus-within:visible'} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <IconButton icon={row.hidden ? LuEyeOff : LuEye} label={row.hidden ? 'Show in editor' : 'Hide in editor'} onClick={() => toggleHidden(sceneKey, [key])} />
        </span>
        <span className={row.locked ? '' : 'invisible group-hover:visible group-focus-within:visible'} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <IconButton icon={row.locked ? LuLock : LuLockOpen} label={row.locked ? 'Unlock' : 'Lock'} onClick={() => toggleLocked(sceneKey, [key])} />
        </span>
      </div>
    );
  };

  return (
    <>
      <aside className="relative flex shrink-0 flex-col border-r border-border text-xs" style={{ width: resizable.snap === 'collapse' ? 0 : resizable.current }} aria-label="Outliner" data-testid="level-outliner">
        <div className="shrink-0 p-1.5">
          <ExplorerSearch value={query} onChange={setQuery} placeholder="Search objects" ariaLabel="Search objects" clearLabel="Clear search" />
        </div>
        <div
          ref={list}
          role="tree"
          aria-label="Layers and objects"
          aria-multiselectable
          className="min-h-0 flex-1 overflow-y-auto py-1"
          onKeyDown={onKeyDown}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!hasObjectLayer && query === '' ? (
            <EmptyState
              icon={LuPlus}
              title="No object layers"
              body="Objects live on object layers."
              action={<EmptyStateButton label="Add object layer" disabled={readOnly} onClick={() => update((s) => addLayer(s, 'object', 'objects'))} />}
            />
          ) : null}
          {query !== '' && rows.length === 0 ? <p className="px-2 py-3 text-muted-foreground">No objects match “{query}”</p> : null}
          {virtual ? <div style={{ height: first * ROW_H }} aria-hidden /> : null}
          {rows.slice(first, last).map(renderRow)}
          {virtual ? <div style={{ height: (rows.length - last) * ROW_H }} aria-hidden /> : null}
        </div>
        <div className="flex gap-1 border-t border-border p-1.5">
          {is3d ? null : (
            <button type="button" disabled={readOnly} onClick={() => update((s) => addLayer(s, 'tile', 'tiles'))} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-1 py-0.5 hover:bg-accent disabled:opacity-40">
              <LuPlus aria-hidden className="h-3 w-3" />Tile layer
            </button>
          )}
          <button type="button" disabled={readOnly} onClick={() => update((s) => addLayer(s, 'object', 'objects'))} className="flex flex-1 items-center justify-center gap-1 rounded border border-border px-1 py-0.5 hover:bg-accent disabled:opacity-40">
            <LuPlus aria-hidden className="h-3 w-3" />Object layer
          </button>
        </div>
      </aside>
      <ResizeHandle resizable={resizable} axis="x" label="Resize outliner" />
    </>
  );
}
