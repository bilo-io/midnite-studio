import { useEffect, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LuPin, LuPlus, LuX } from 'react-icons/lu';

import {
  GIT_DASHBOARD_ID,
  MAX_DASHBOARDS,
  useDashboardStore,
  type DashboardTab,
} from '../../store/dashboard-store';

/**
 * The strip of dashboards above the board — midnite's `DashboardTabs`, ported.
 *
 * Git is the permanent first anchor (never pinnable, draggable or closable).
 * The rest can be pinned (locked into a zone behind Git, no close button) and
 * dragged to reorder, within their zone only. Double-click renames; `+` adds,
 * up to {@link MAX_DASHBOARDS}.
 *
 * Real browser behaviour needed for the drag itself (pointer sensors), which is
 * covered by the store's `reorderDashboards` test plus the screenshot pass; the
 * rest is exercised under jsdom.
 */
const chip = (active: boolean): string =>
  [
    'flex h-7 shrink-0 items-center gap-1 rounded-md text-xs transition-colors',
    active
      ? 'bg-primary font-medium text-primary-foreground'
      : 'border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  ].join(' ');

export function DashboardTabs() {
  const tabs = useDashboardStore((s) => s.tabs);
  const activeId = useDashboardStore((s) => s.activeId);
  const setActive = useDashboardStore((s) => s.setActive);
  const addDashboard = useDashboardStore((s) => s.addDashboard);
  const closeDashboard = useDashboardStore((s) => s.closeDashboard);
  const renameDashboard = useDashboardStore((s) => s.renameDashboard);
  const togglePin = useDashboardStore((s) => s.togglePin);
  const reorderDashboards = useDashboardStore((s) => s.reorderDashboards);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  const git = tabs.find((t) => t.id === GIT_DASHBOARD_ID);
  const rest = tabs.filter((t) => t.id !== GIT_DASHBOARD_ID);
  const pinned = rest.filter((t) => t.pinned);
  const unpinned = rest.filter((t) => !t.pinned);
  const pinnedById = new Map(rest.map((t) => [t.id, !!t.pinned]));

  // A drag may only land among tabs of its own zone.
  const collisionDetection: CollisionDetection = (args) => {
    const activePinned = pinnedById.get(String(args.active.id));
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => pinnedById.get(String(c.id)) === activePinned,
      ),
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return;
    const ids = rest.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorderDashboards(arrayMove(ids, from, to));
  };

  const startRename = (tab: DashboardTab): void => {
    setEditingId(tab.id);
    setDraft(tab.name);
  };
  const commitRename = (): void => {
    if (editingId) renameDashboard(editingId, draft);
    setEditingId(null);
  };

  const renameInput = (tab: DashboardTab) => (
    <input
      key={tab.id}
      ref={inputRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitRename}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commitRename();
        if (event.key === 'Escape') setEditingId(null);
      }}
      aria-label={`Rename dashboard ${tab.name}`}
      className="h-7 w-32 shrink-0 rounded-md border border-primary bg-background px-2 text-xs focus-visible:outline-none"
    />
  );

  const sortable = (tab: DashboardTab) =>
    editingId === tab.id ? (
      renameInput(tab)
    ) : (
      <SortableTab
        key={tab.id}
        tab={tab}
        active={tab.id === activeId}
        onActivate={() => setActive(tab.id)}
        onRename={() => startRename(tab)}
        onTogglePin={() => togglePin(tab.id)}
        onClose={() => closeDashboard(tab.id)}
      />
    );

  return (
    <div
      role="tablist"
      aria-label="Dashboards"
      className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto"
    >
      {git &&
        (editingId === git.id ? (
          renameInput(git)
        ) : (
          <div className={`${chip(git.id === activeId)} px-3`}>
            <button
              type="button"
              role="tab"
              aria-selected={git.id === activeId}
              onClick={() => setActive(git.id)}
              onDoubleClick={() => startRename(git)}
              className="max-w-[12rem] truncate focus-visible:outline-none"
              title={`${git.name} — double-click to rename`}
            >
              {git.name}
            </button>
          </div>
        ))}

      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}>
        <SortableContext items={rest.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          {pinned.map(sortable)}
          {pinned.length > 0 && unpinned.length > 0 ? (
            <div aria-hidden className="mx-0.5 h-4 w-px shrink-0 self-center bg-border" />
          ) : null}
          {unpinned.map(sortable)}
        </SortableContext>
      </DndContext>

      {tabs.length < MAX_DASHBOARDS ? (
        <button
          type="button"
          onClick={() => addDashboard(`Dashboard ${tabs.length + 1}`)}
          aria-label="Add dashboard"
          title="Add dashboard"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LuPlus aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** A draggable non-Git tab: pin toggle, name (the drag activator), close (unless pinned). */
function SortableTab({
  tab,
  active,
  onActivate,
  onRename,
  onTogglePin,
  onClose,
}: {
  tab: DashboardTab;
  active: boolean;
  onActivate: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'group/tab px-1.5',
        chip(active),
        tab.pinned && !active ? 'border-primary/40' : '',
        isDragging ? 'z-10 shadow-lg' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={tab.pinned ? `Unpin ${tab.name}` : `Pin ${tab.name}`}
        aria-pressed={!!tab.pinned}
        title={tab.pinned ? 'Unpin' : 'Pin'}
        className={[
          'flex size-4 shrink-0 items-center justify-center rounded-sm transition-opacity',
          tab.pinned
            ? active
              ? 'text-primary-foreground'
              : 'text-primary'
            : 'opacity-0 hover:text-foreground group-hover/tab:opacity-60 focus-visible:opacity-100',
        ].join(' ')}
      >
        <LuPin aria-hidden className={`size-3 ${tab.pinned ? 'fill-current' : ''}`} />
      </button>

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        role="tab"
        aria-selected={active}
        onClick={onActivate}
        onDoubleClick={onRename}
        className="max-w-[12rem] cursor-grab truncate px-0.5 focus-visible:outline-none active:cursor-grabbing"
        title={`${tab.name} — drag to reorder, double-click to rename`}
      >
        {tab.name}
      </button>

      {!tab.pinned ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${tab.name}`}
          className={`flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors ${
            active
              ? 'hover:bg-primary-foreground/20'
              : 'hover:bg-destructive/15 hover:text-destructive'
          }`}
        >
          <LuX aria-hidden className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
