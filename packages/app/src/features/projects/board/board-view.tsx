import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuChevronRight } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { useDialogs } from '../../../components/dialog-host';
import type { MenuItem } from '../../../components/context-menu';
import { EmptyState } from '../../../components/empty-state';
import { VIEW_ICON } from '../../../components/nav-icons';
import { useWindowFocusGate } from '../../../lib/use-window-focus-gate';
import { useSetProjectItemField } from '../../../services/queries';
import { useUiStore } from '../../../store/ui-store';
import { useToastStore } from '../../../store/toast-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { applyOptimisticMove, type CardDragPayload, type ColumnDropPayload } from './board-dnd';
import { CardDetail } from './card-detail';
import { deriveColumns, NO_STATUS_COLUMN_ID, type BoardColumn } from './board-derive';
import { TaskCard } from './task-card';

/**
 * The `[ Table | Board ]` mode's board (Phase 41 Themes A–B) — the project's
 * `Status` single-select field turned on its side, one column per option.
 *
 * **No query of its own.** `items`/`fields` are exactly the query results the
 * Table mode already fetched — the phase doc's own rule ("one paged read for
 * the board's items … not one query per column"), so switching modes costs
 * nothing extra and a board never fetches per column.
 */
export function BoardView({
  projectId,
  fields,
  items,
}: {
  projectId: string;
  fields: readonly ForgeProjectField[];
  items: readonly ForgeProjectItem[];
}) {
  const statusField = useMemo(() => findStatusField(fields), [fields]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // Same gate the table's own `ProjectFieldCell` reads — a drag is a write
  // like any other, and "gated at the surface, not in the mutation" applies
  // to a gesture exactly as it does to a control: `useDraggable`'s own
  // `disabled` is that surface for a card.
  const writesEnabled = useUiStore((s) => s.forgeWritesEnabled);

  /*
    Without this, Theme F's glow is inert on a fresh boot: `useTerminalStore`
    only learns about restored (and live-reattached) sessions once something
    calls `hydrate()`, and today only `TerminalPanel` and the FAB do — the
    exact trap Phase 35's own retro already names ("a persisted loop never
    came back unless you opened the main terminal panel first"). This is
    `fab-panel.tsx`'s own `useHydrateOnOpen(true)`, not a duplicate of it: it
    costs nothing the second time (`hydrate()` returns immediately once
    `hydrated` is set) and is deliberately *not* Theme H's own reconciliation
    — no taskRef re-homing, no restart-attach UI, just the one call that lets
    `useCardStatus` see what is already running. Caught rather than left to
    reject unhandled: a real bridge's `terminal.list()` cannot throw for this
    reason, so a rejection here only ever means a test double lighter than
    the full preload contract, and Theme F's glow is cosmetic either way.
  */
  useEffect(() => {
    useTerminalStore
      .getState()
      .hydrate()
      .catch(() => {});
  }, []);

  // A board with several running cards is that many pulsing glows (Theme F)
  // — gated on window focus the same way the FAB and landing panels are.
  // The hook already supports concurrent hosts, so this is a third caller
  // rather than a hoist to `app.tsx`.
  useWindowFocusGate(true);

  /*
    Optimistic drag (Theme C), and the one deliberate exception to Phase 40's
    "nothing here is optimistic" house rule — argued, not inherited: a card
    that visibly snaps back on a rejected drop is a stronger case for
    optimism than a text field is, because the drop gesture itself already
    reads as complete the instant the pointer releases.

    Kept as a local overlay rather than an `onMutate` cache write: `items` is
    a prop this component does not own the query for, so `applyOptimisticMove`
    produces a full replacement array here, rendered in place of the prop
    until the invalidated refetch — fired by `useSetProjectItemField`'s own
    `onSuccess` — actually lands. `awaitingRefetch` is what makes that wait
    for the *next* `items` prop change rather than clearing immediately: a
    successful mutation's own refetch is async, and dropping the overlay
    before it resolves would flash the card back to its pre-drag column for
    one frame. This same overlay is what makes the doc's "pause invalidation
    while a drag is active" concern moot in practice — the rendered state
    never depends on a mid-drag refetch winning a race, because the overlay
    always wins until the mutation's own outcome says otherwise. (Separately,
    `keys.forgeProjectItems` sits outside every prefix the repo watcher
    invalidates today, so the collision the doc named is not even reachable
    yet — see `queries.ts`'s own note beside the key.)
  */
  const [optimisticItems, setOptimisticItems] = useState<ForgeProjectItem[] | null>(null);
  const awaitingRefetch = useRef(false);
  useEffect(() => {
    if (awaitingRefetch.current) {
      awaitingRefetch.current = false;
      setOptimisticItems(null);
    }
  }, [items]);

  const boardItems = optimisticItems ?? items;
  const columns = useMemo(() => deriveColumns(statusField, boardItems), [statusField, boardItems]);

  const setField = useSetProjectItemField(projectId);
  const addToast = useToastStore((s) => s.addToast);

  const [activeItem, setActiveItem] = useState<ForgeProjectItem | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Every field except Status — the column already says that one.
  const cardFields = useMemo(
    () => fields.filter((field) => field.id !== statusField?.id),
    [fields, statusField],
  );

  const selectedItem = selectedItemId ? (boardItems.find((i) => i.id === selectedItemId) ?? null) : null;

  if (!statusField) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="No Status field"
        body="This project has no Status field — the board groups by Status, so there are no columns to show."
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={VIEW_ICON.projects} title="No items" body="This project has no items yet." />;
  }

  const toggle = (columnId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent): void => {
    const payload = event.active.data.current as CardDragPayload | undefined;
    if (!payload) return;
    setActiveItem(boardItems.find((i) => i.id === payload.itemId) ?? null);
  };

  // Dragging over a collapsed column's rail auto-expands it — the doc's own
  // "allow drop, auto-expand" call — so a column never has to be opened by
  // hand before it can receive a card.
  const handleDragOver = (event: DragOverEvent): void => {
    const target = event.over?.data.current as ColumnDropPayload | undefined;
    if (!target) return;
    setCollapsed((prev) => (prev.has(target.optionId) ? without(prev, target.optionId) : prev));
  };

  /*
    Shared by the drag drop and the "Move to ▸" menu (Theme C's keyboard
    story — see `DraggableCard`): both end at the same mutation, so both go
    through one function rather than two copies of the optimistic-move +
    rollback dance drifting apart.
  */
  const moveItemToColumn = (itemId: string, toColumnId: string): void => {
    const item = boardItems.find((i) => i.id === itemId);
    const currentColumnId = item ? columnIdFor(statusField, item) : null;
    if (currentColumnId === toColumnId) return;

    const next = applyOptimisticMove(boardItems, itemId, statusField, toColumnId);
    const moved = next.find((i) => i.id === itemId);
    const value = moved?.fieldValues[statusField.id];
    if (!value) return;

    setOptimisticItems(next);
    setField.mutate(
      { itemId, fieldId: statusField.id, value },
      {
        onSuccess: (result) => {
          if (result.ok) {
            awaitingRefetch.current = true;
          } else {
            // Roll back: the drop is refused, so the card returns to its
            // original column, with GitHub's own error text — never a
            // generic "something went wrong".
            setOptimisticItems(null);
            addToast({
              status: 'error',
              message: result.kind === 'insufficient-scope' ? result.hint : result.message,
            });
          }
        },
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveItem(null);
    const source = event.active.data.current as CardDragPayload | undefined;
    const target = event.over?.data.current as ColumnDropPayload | undefined;
    if (!source || !target) return;
    moveItemToColumn(source.itemId, target.optionId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full min-h-0" data-testid="board-view">
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {columns.map((column) => (
            <BoardColumnView
              key={column.id}
              column={column}
              columns={columns}
              fields={cardFields}
              projectId={projectId}
              selectedItemId={selectedItemId}
              collapsed={collapsed.has(column.id)}
              writesEnabled={writesEnabled}
              onToggle={() => toggle(column.id)}
              onSelectItem={setSelectedItemId}
              onMoveToColumn={moveItemToColumn}
            />
          ))}
        </div>

        {selectedItem ? (
          <CardDetail
            projectId={projectId}
            item={selectedItem}
            fields={fields}
            onClose={() => setSelectedItemId(null)}
          />
        ) : null}
      </div>

      {/*
        A drag overlay rather than an in-place transform — every column is a
        candidate for `VirtualizedColumnItems` past 50 cards, and the dragged
        card would be unmounted the moment it scrolled out of view otherwise
        (the same reasoning `graph-dnd.tsx` already gives for its own badge).
      */}
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="w-72 opacity-90">
            <TaskCard item={activeItem} fields={cardFields} projectId={projectId} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function without<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

/** The column id an item currently belongs to, per `deriveColumns`'s own rule. */
function columnIdFor(field: ForgeProjectField, item: ForgeProjectItem): string {
  const value = item.fieldValues[field.id];
  return value?.dataType === 'single_select' ? value.optionId : NO_STATUS_COLUMN_ID;
}

/** `Status` by name — GitHub's own default board field, and the only one this phase groups by. */
function findStatusField(fields: readonly ForgeProjectField[]): ForgeProjectField | null {
  return fields.find((f) => f.dataType === 'single_select' && f.name === 'Status') ?? null;
}

const COLLAPSED_WIDTH = 'w-9';
const COLUMN_WIDTH = 'w-72';

/** Below this, a plain `.map()` costs less than the virtualizer's own machinery. */
const VIRTUALIZE_THRESHOLD = 50;
const CARD_HEIGHT_ESTIMATE = 84;

function BoardColumnView({
  column,
  columns,
  fields,
  projectId,
  selectedItemId,
  collapsed,
  writesEnabled,
  onToggle,
  onSelectItem,
  onMoveToColumn,
}: {
  column: BoardColumn;
  /** Every column, for the "Move to ▸" menu — never just this one's siblings. */
  columns: readonly BoardColumn[];
  fields: readonly ForgeProjectField[];
  projectId: string;
  selectedItemId: string | null;
  collapsed: boolean;
  writesEnabled: boolean;
  onToggle: () => void;
  onSelectItem: (itemId: string) => void;
  onMoveToColumn: (itemId: string, toColumnId: string) => void;
}) {
  /*
    "No status" is not a droppable target at all: clearing a field is
    `clearProjectV2ItemFieldValue`, a different GraphQL mutation Phase 40
    Theme E never built (it only shipped `updateProjectV2ItemFieldValue`,
    which requires a real option id) — see `board-dnd.ts`'s own note.
  */
  const droppable = useDroppable({
    id: `column:${column.id}`,
    data: { kind: 'column', optionId: column.id } satisfies ColumnDropPayload,
    disabled: column.id === NO_STATUS_COLUMN_ID,
  });

  if (collapsed) {
    return (
      <button
        ref={droppable.setNodeRef}
        type="button"
        onClick={onToggle}
        aria-label={`Expand ${column.name}`}
        className={`flex shrink-0 flex-col items-center gap-2 rounded-md border py-2 ${
          droppable.isOver ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'
        } ${COLLAPSED_WIDTH}`}
      >
        <LuChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">{column.items.length}</span>
        <span className="[writing-mode:vertical-rl] text-[11px] text-muted-foreground">{column.name}</span>
      </button>
    );
  }

  return (
    <div
      ref={droppable.setNodeRef}
      className={`flex h-full min-h-0 shrink-0 flex-col rounded-md border bg-muted/10 ${
        droppable.isOver ? 'border-primary' : 'border-border'
      } ${COLUMN_WIDTH}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Collapse ${column.name}`}
        className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2 text-left"
      >
        {column.id !== NO_STATUS_COLUMN_ID ? (
          <span className="h-2 w-2 shrink-0 rounded-full border border-border" style={optionAccent(column.color)} />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{column.name}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {column.items.length}
        </span>
      </button>

      {column.items.length === 0 ? (
        <div className="p-2">
          <div
            className={`flex h-16 items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground ${
              droppable.isOver ? 'border-primary' : 'border-border'
            }`}
          >
            Drop here
          </div>
        </div>
      ) : column.items.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualizedColumnItems
          column={column}
          columns={columns}
          fields={fields}
          projectId={projectId}
          selectedItemId={selectedItemId}
          writesEnabled={writesEnabled}
          onSelectItem={onSelectItem}
          onMoveToColumn={onMoveToColumn}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="flex flex-col gap-1.5">
            {column.items.map((item) => (
              <DraggableCard
                key={item.id}
                item={item}
                fields={fields}
                projectId={projectId}
                isOpen={item.id === selectedItemId}
                writesEnabled={writesEnabled}
                columns={columns}
                currentColumnId={column.id}
                onClick={() => onSelectItem(item.id)}
                onMoveToColumn={onMoveToColumn}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A card, made draggable (Theme C) — a wrapper rather than teaching
 * `useDraggable` to `TaskCard` itself, so the plain, no-`DndContext`-required
 * render `TaskCard`'s own tests already exercise stays exactly that. The
 * dragged card is hidden here at `opacity: 0` (not unmounted) while the
 * `DragOverlay` above shows the version actually following the pointer —
 * unmounting would lose `useSortable`-style layout continuity for nothing,
 * since this board does not reorder within a column.
 *
 * Also the keyboard story for column moves (Theme C's own Decision): **not**
 * a `KeyboardSensor` — there is no multi-container `coordinateGetter`
 * anywhere in this codebase, and one is the fiddliest part of dnd-kit for
 * what a menu does accessibly at a fraction of the code. Right-click (or the
 * OS's own context-menu key / Shift+F10, which fire the same `contextmenu`
 * DOM event) opens "Move to ▸", calling the identical `onMoveToColumn` a
 * drop does. Deliberately **not** bound to `Enter` as the doc first drafted:
 * `TaskCard`'s own root already answers `Enter`/`Space` by opening the card
 * detail pane (Theme B, tested) — doubling that key would silently break
 * one of the two meanings depending on which handler happened to run first.
 */
function DraggableCard({
  item,
  fields,
  projectId,
  isOpen,
  writesEnabled,
  columns,
  currentColumnId,
  onClick,
  onMoveToColumn,
}: {
  item: ForgeProjectItem;
  fields: readonly ForgeProjectField[];
  projectId: string;
  isOpen: boolean;
  writesEnabled: boolean;
  columns: readonly BoardColumn[];
  currentColumnId: string;
  onClick: () => void;
  onMoveToColumn: (itemId: string, toColumnId: string) => void;
}) {
  const draggable = useDraggable({
    id: `card:${item.id}`,
    data: { kind: 'card', itemId: item.id } satisfies CardDragPayload,
    disabled: !writesEnabled,
  });
  const dialogs = useDialogs();

  const openMoveMenu = (event: { clientX: number; clientY: number }): void => {
    if (!writesEnabled) return;
    const targets = columns.filter((c) => c.id !== currentColumnId && c.id !== NO_STATUS_COLUMN_ID);
    if (targets.length === 0) return;
    dialogs.openMenu(event, [
      {
        type: 'item',
        label: 'Move to',
        submenu: targets.map(
          (target): MenuItem => ({
            type: 'item',
            label: target.name,
            onSelect: () => onMoveToColumn(item.id, target.id),
          }),
        ),
      },
    ]);
  };

  return (
    <div
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      title={writesEnabled ? undefined : 'Enable review actions in Settings → Reviews to move cards'}
      style={draggable.isDragging ? { opacity: 0 } : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        openMoveMenu(event);
      }}
    >
      <TaskCard item={item} fields={fields} projectId={projectId} isOpen={isOpen} onClick={onClick} />
    </div>
  );
}

/**
 * A column past `VIRTUALIZE_THRESHOLD` cards (Phase 41 Theme B) — the app's
 * **first per-container virtualizer**: every other `useVirtualizer` call site
 * is one per view, not one per element in a loop, which is why this is its
 * own component rather than a branch inside `BoardColumnView`'s render.
 * Cards are variable-height, so this is `diff-view.tsx`'s
 * `estimateSize`/`measureElement` recipe, not the graph's fixed-row one.
 */
function VirtualizedColumnItems({
  column,
  columns,
  fields,
  projectId,
  selectedItemId,
  writesEnabled,
  onSelectItem,
  onMoveToColumn,
}: {
  column: BoardColumn;
  columns: readonly BoardColumn[];
  fields: readonly ForgeProjectField[];
  projectId: string;
  selectedItemId: string | null;
  writesEnabled: boolean;
  onSelectItem: (itemId: string) => void;
  onMoveToColumn: (itemId: string, toColumnId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: column.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT_ESTIMATE,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = column.items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full pb-1.5"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <DraggableCard
                item={item}
                fields={fields}
                projectId={projectId}
                isOpen={item.id === selectedItemId}
                writesEnabled={writesEnabled}
                columns={columns}
                currentColumnId={column.id}
                onClick={() => onSelectItem(item.id)}
                onMoveToColumn={onMoveToColumn}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * GitHub's option colours are its own enum names (`GRAY`, `YELLOW`, …), not
 * CSS — there is no promise here that every name maps to something visible in
 * both themes, so this degrades to the same neutral dot every other option
 * gets rather than guessing a hex value.
 */
function optionAccent(color: string): React.CSSProperties {
  const known: Record<string, string> = {
    GRAY: '#8b949e',
    BLUE: '#58a6ff',
    GREEN: '#3fb950',
    YELLOW: '#d29922',
    ORANGE: '#db6d28',
    RED: '#f85149',
    PINK: '#db61a2',
    PURPLE: '#a371f7',
  };
  const hex = known[color];
  return hex ? { backgroundColor: hex, borderColor: hex } : {};
}
