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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { LuChevronRight } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem, ForgeProjectWriteResult } from '@midnite/studio-shared';

import { useDialogs } from '../../../components/dialog-host';
import type { MenuItem } from '../../../components/context-menu';
import { EmptyState } from '../../../components/empty-state';
import { VIEW_ICON } from '../../../components/nav-icons';
import { useWindowFocusGate } from '../../../lib/use-window-focus-gate';
import { useClearProjectItemField, useSetProjectItemField } from '../../../services/queries';
import { useUiStore } from '../../../store/ui-store';
import { useToastStore } from '../../../store/toast-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import {
  findCardPosition,
  flattenCardIds,
  moveHorizontal,
  moveVertical,
  nearestCardId,
  positionToItemId,
} from './board-keyboard';
import { applyOptimisticMove, type CardDragPayload, type ColumnDropPayload } from './board-dnd';
import { CardPanelStack } from './card-panel-stack';
import { deriveColumns, NO_STATUS_COLUMN_ID, sessionsToRehome, type BoardColumn } from './board-derive';
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
  repoId,
  worktreePath,
  fields,
  items,
  groupField,
  collapsedColumns,
  onToggleColumn,
  onExpandColumn,
}: {
  projectId: string;
  repoId: string | null;
  /** Absent when no worktree is selected — passed through to the card composer. */
  worktreePath: string | undefined;
  fields: readonly ForgeProjectField[];
  items: readonly ForgeProjectItem[];
  /** Resolved by the caller via `resolveGroupField` (Phase 52 Theme B) — this
   *  component groups by whatever it is handed, `Status` included. */
  groupField: ForgeProjectField | null;
  /** Lifted to the caller (Phase 52 Theme D) so it can persist per project. */
  collapsedColumns: ReadonlySet<string>;
  onToggleColumn: (columnId: string) => void;
  /** Idempotent "ensure expanded" — distinct from the toggle: a drag hovering
   *  a collapsed column's rail must only ever open it, never close it. */
  onExpandColumn: (columnId: string) => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  /**
   * Grouping by an iteration field is read-only (Phase 52 Theme B): its
   * columns are discovered from the items themselves rather than a fixed
   * option set (see `board-derive.ts`), so there is nothing a drop could
   * target that isn't itself a consequence of who is already in it. Folded
   * into the same `writesEnabled` gate every draggable/droppable surface
   * already reads, rather than a second disabled path, so this reuses the
   * existing tested "disabled with a reason" rendering wholesale.
   */
  const readOnlyGrouping = groupField?.dataType === 'iteration';
  // Same gate the table's own `ProjectFieldCell` reads — a drag is a write
  // like any other, and "gated at the surface, not in the mutation" applies
  // to a gesture exactly as it does to a control: `useDraggable`'s own
  // `disabled` is that surface for a card.
  const forgeWritesEnabled = useUiStore((s) => s.forgeWritesEnabled);
  const writesEnabled = forgeWritesEnabled && !readOnlyGrouping;
  const disabledReason = readOnlyGrouping
    ? `Grouping by "${groupField?.name}" is read-only — an iteration field's write payload differs and iteration writes are out of scope.`
    : !forgeWritesEnabled
      ? 'Enable review actions in Settings → Reviews to move cards'
      : undefined;

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

  /*
    Theme H: a `kanban` session whose card is gone from THIS board — moved to
    another status the caller filtered out is not the case (this board still
    holds every item regardless of column), so "gone" means removed from the
    project entirely — re-homes to the main surface rather than staying
    orphaned and invisible. `sessions` is read live from the store (not
    `items`, which is this component's own prop) so a session opened after
    this render still gets reconciled once the store updates.
  */
  const sessions = useTerminalStore((s) => s.sessions);
  const itemIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  useEffect(() => {
    for (const id of sessionsToRehome(sessions, { projectId, itemIds })) {
      useTerminalStore.getState().rehomeSession(id);
    }
  }, [sessions, projectId, itemIds]);

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
  const columns = useMemo(() => deriveColumns(groupField, boardItems), [groupField, boardItems]);

  const setField = useSetProjectItemField(projectId);
  const clearField = useClearProjectItemField(projectId);
  const addToast = useToastStore((s) => s.addToast);

  const [activeItem, setActiveItem] = useState<ForgeProjectItem | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Every field except the one grouping the board — the column already says that one.
  const cardFields = useMemo(
    () => fields.filter((field) => field.id !== groupField?.id),
    [fields, groupField],
  );

  /*
    Roving tabindex (Phase 52 Theme G): one card on the board is `0` — this
    one — every other card is `-1`, reachable only by arrow keys. A board
    with 200 cards costs one Tab press to enter, not two hundred to
    traverse.

    Reconciled (not imperatively focused) whenever `columns` or
    `collapsedColumns` changes — a filter, a regroup, a card moving off the
    board entirely, *or* the focused card's own column collapsing out from
    under it (its DOM node is gone the instant that happens — `collapsed`
    is a render branch in `BoardColumnView`, not a CSS hide). If the focused
    card is still somewhere in `columns` AND its column is expanded, it
    stays focused; otherwise focus moves to the item at the same flattened
    index as before, skipping any collapsed column, clamped to the new,
    possibly-shorter end — never to `document.body`, which is what would
    silently end keyboard navigation mid-task. "Before" prefers the *current*
    `columns` read without collapse applied (the common case: nothing
    moved, a column merely (dis)appeared), falling back to `prevColumnsRef`
    only when the card is gone from `columns` outright. This effect only
    ever updates state; only `moveFocusTo` below ever calls a real DOM
    `.focus()`, which is what keeps a passive filter from stealing focus off
    whatever else the user was doing.
  */
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const prevColumnsRef = useRef(columns);
  useEffect(() => {
    const position = focusedItemId !== null ? findCardPosition(columns, focusedItemId) : null;
    const usable = position !== null && !collapsedColumns.has(columns[position.columnIndex]!.id);
    if (!usable) {
      const rawIndex = focusedItemId !== null ? flattenCardIds(columns).indexOf(focusedItemId) : -1;
      const previousFlatIndex =
        rawIndex !== -1
          ? rawIndex
          : focusedItemId !== null
            ? Math.max(0, flattenCardIds(prevColumnsRef.current).indexOf(focusedItemId))
            : 0;
      setFocusedItemId(nearestCardId(columns, previousFlatIndex, collapsedColumns));
    }
    prevColumnsRef.current = columns;
    // `focusedItemId` deliberately excluded — this only ever reacts to
    // `columns`/`collapsedColumns` changing, never to a focus move it just
    // made itself, or every arrow-key press would re-run this reconciliation
    // against a now-stale `prevColumnsRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, collapsedColumns]);

  /**
   * Sets the roving target *and* moves real DOM focus there — the only path
   * that does both; the reconciliation effect above only ever does the
   * former. Synchronous, not deferred to a frame: every card is already in
   * the DOM (only its `tabIndex` changes), and `.focus()` works on a
   * `tabIndex={-1}` element regardless of whether React has re-rendered its
   * new `0` yet — a negative `tabIndex` blocks reaching an element by
   * pressing Tab, never a direct `.focus()` call.
   */
  const moveFocusTo = (itemId: string | null): void => {
    if (itemId === null) return;
    setFocusedItemId(itemId);
    boardRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(itemId)}"]`)?.focus();
  };

  const handleBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      if (selectedItemId === null) return;
      event.preventDefault();
      const origin = focusedItemId;
      setSelectedItemId(null);
      moveFocusTo(origin);
      return;
    }

    if (focusedItemId === null) return;
    const position = findCardPosition(columns, focusedItemId);
    if (!position) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocusTo(positionToItemId(columns, moveVertical(columns, position, event.key === 'ArrowDown' ? 1 : -1)));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocusTo(
        positionToItemId(
          columns,
          moveHorizontal(columns, collapsedColumns, position, event.key === 'ArrowRight' ? 1 : -1),
        ),
      );
    }
  };

  if (!groupField) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="No groupable field"
        body="This project has no single-select or iteration field for the board to group by."
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={VIEW_ICON.projects} title="No items" body="This project has no items yet." />;
  }

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
    onExpandColumn(target.optionId);
  };

  /*
    Shared by the drag drop and the "Move to ▸" menu (Theme C's keyboard
    story — see `DraggableCard`): both end at the same mutation, so both go
    through one function rather than two copies of the optimistic-move +
    rollback dance drifting apart.
  */
  const moveItemToColumn = (itemId: string, toColumnId: string): void => {
    const item = boardItems.find((i) => i.id === itemId);
    const currentColumnId = item ? columnIdFor(groupField, item) : null;
    if (currentColumnId === toColumnId) return;

    const next = applyOptimisticMove(boardItems, itemId, groupField, toColumnId);

    const onSettled = (result: ForgeProjectWriteResult): void => {
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
    };

    /*
      "No status" (Phase 50 Theme C) clears the field rather than setting it
      — `applyOptimisticMove` already deletes the entry, which is exactly why
      this branch cannot read a `value` off the moved item to send: there is
      none, by design, and `clearProjectV2ItemFieldValue` takes none either.
    */
    if (toColumnId === NO_STATUS_COLUMN_ID) {
      setOptimisticItems(next);
      clearField.mutate({ itemId, fieldId: groupField.id }, { onSuccess: onSettled });
      return;
    }

    const moved = next.find((i) => i.id === itemId);
    const value = moved?.fieldValues[groupField.id];
    // Bail *before* touching optimistic state — setting it here and then
    // returning with no mutation fired would freeze the board on a stale
    // snapshot forever, since nothing would ever call `onSettled` to clear
    // it (a real regression this comment's neighbouring fix caught).
    if (!value) return;

    setOptimisticItems(next);
    setField.mutate({ itemId, fieldId: groupField.id, value }, { onSuccess: onSettled });
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
      <div ref={boardRef} className="flex h-full min-h-0" data-testid="board-view" onKeyDown={handleBoardKeyDown}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {columns.map((column) => (
            <BoardColumnView
              key={column.id}
              column={column}
              columns={columns}
              fields={cardFields}
              projectId={projectId}
              selectedItemId={selectedItemId}
              focusedItemId={focusedItemId}
              collapsed={collapsedColumns.has(column.id)}
              writesEnabled={writesEnabled}
              disabledReason={disabledReason}
              onToggle={() => onToggleColumn(column.id)}
              onSelectItem={(itemId) => {
                setFocusedItemId(itemId);
                setSelectedItemId(itemId);
              }}
              onMoveToColumn={moveItemToColumn}
            />
          ))}
        </div>

        {selectedItemId ? (
          <CardPanelStack
            projectId={projectId}
            repoId={repoId}
            worktreePath={worktreePath}
            items={boardItems}
            fields={fields}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
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

/**
 * The column id an item currently belongs to — used only for the drag/menu
 * "already in this column, no-op" check, so it does not need
 * `deriveColumns`'s own orphaned-option-id fallback to `NO_STATUS_COLUMN_ID`:
 * a stale option id can never equal a real target column's id, so the no-op
 * guard below still fires correctly either way. Iteration grouping never
 * reaches this at all in practice — the move is read-only — but resolves the
 * same "no value" fallback if it ever did.
 */
function columnIdFor(field: ForgeProjectField, item: ForgeProjectItem): string {
  const value = item.fieldValues[field.id];
  if (value?.dataType === 'single_select') return value.optionId;
  if (value?.dataType === 'iteration') return value.iterationId;
  return NO_STATUS_COLUMN_ID;
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
  focusedItemId,
  collapsed,
  writesEnabled,
  disabledReason,
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
  /** The roving-tabindex target (Phase 52 Theme G) — the one card on the
   *  whole board that renders `tabIndex={0}`. */
  focusedItemId: string | null;
  collapsed: boolean;
  writesEnabled: boolean;
  /** Why dragging is off, shown as the card's `title` — absent when it is on. */
  disabledReason: string | undefined;
  onToggle: () => void;
  onSelectItem: (itemId: string) => void;
  onMoveToColumn: (itemId: string, toColumnId: string) => void;
}) {
  const droppable = useDroppable({
    id: `column:${column.id}`,
    data: { kind: 'column', optionId: column.id } satisfies ColumnDropPayload,
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
          focusedItemId={focusedItemId}
          writesEnabled={writesEnabled}
          disabledReason={disabledReason}
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
                tabIndex={item.id === focusedItemId ? 0 : -1}
                writesEnabled={writesEnabled}
                disabledReason={disabledReason}
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
  tabIndex,
  writesEnabled,
  disabledReason,
  columns,
  currentColumnId,
  onClick,
  onMoveToColumn,
}: {
  item: ForgeProjectItem;
  fields: readonly ForgeProjectField[];
  projectId: string;
  isOpen: boolean;
  /** Roving tabindex (Phase 52 Theme G) — forwarded to `TaskCard`, the
   *  element that actually owns the board's one Tab stop. */
  tabIndex: number;
  writesEnabled: boolean;
  disabledReason: string | undefined;
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
    // "No status" is a real target now (Phase 50 Theme C) — the keyboard
    // story gets the same destination the drag gesture does, not a smaller
    // one.
    const targets = columns.filter((c) => c.id !== currentColumnId);
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
      /*
        The a11y attributes go on ONLY while the drag is actually available.
        `useDraggable`'s `attributes` bundle carries `aria-disabled` set from
        its own `disabled` flag, and `aria-disabled` on a container makes
        every descendant read as disabled — to a screen reader and to
        Playwright's actionability check alike. With forge writes off (the
        default) that covered the card's own `role="button"` open-the-pane
        click and, once it existed, `TaskCard`'s `>_` reveal button: two
        controls that work fine with writes disabled, announced as dead.

        Spreading nothing is the right answer rather than deleting one key:
        a card that cannot be dragged needs no `aria-roledescription
        ="draggable"` and no second nested `role="button"` describing a
        gesture that is not on offer. `listeners` still spread — dnd-kit
        makes them no-ops when disabled, and dropping them would mean
        re-adding them on the way back.

        `tabIndex` is overridden to `-1` regardless: `draggable.attributes`
        defaults it to `0` for a keyboard sensor this app deliberately does
        not wire (see this component's own docblock), and left as `attributes`
        hands it, every card's wrapper would be an independent Tab stop
        alongside `TaskCard`'s own roving one below (Phase 52 Theme G) —
        two stops per card, not the board's promised one.
      */
      {...(writesEnabled ? { ...draggable.attributes, tabIndex: -1 } : {})}
      title={writesEnabled ? undefined : disabledReason}
      style={draggable.isDragging ? { opacity: 0 } : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        openMoveMenu(event);
      }}
    >
      <TaskCard
        item={item}
        fields={fields}
        projectId={projectId}
        isOpen={isOpen}
        tabIndex={tabIndex}
        onClick={onClick}
      />
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
  focusedItemId,
  writesEnabled,
  disabledReason,
  onSelectItem,
  onMoveToColumn,
}: {
  column: BoardColumn;
  columns: readonly BoardColumn[];
  fields: readonly ForgeProjectField[];
  projectId: string;
  selectedItemId: string | null;
  /** See `BoardColumnView`'s own note. **Known gap:** a focused card past the
   *  virtualizer's own render window has no DOM node for `moveFocusTo` to
   *  find — arrow-key nav can move `focusedItemId` here correctly while the
   *  browser's actual focus stays behind, on a >50-card column. Scrolling
   *  the virtualizer to the new index first is the fix, and is not this
   *  theme's — card *movement* is explicitly deferred, and this is the same
   *  shape of "scroll to make it real" gap, just for focus rather than drag. */
  focusedItemId: string | null;
  writesEnabled: boolean;
  disabledReason: string | undefined;
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
                tabIndex={item.id === focusedItemId ? 0 : -1}
                writesEnabled={writesEnabled}
                disabledReason={disabledReason}
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
