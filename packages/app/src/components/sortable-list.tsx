import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, ReactNode } from 'react';

/**
 * A vertical list whose rows can be dragged into a new order.
 *
 * One wrapper for both the terminal session list and the repos sidebar, so the
 * sensor threshold and the keyboard story are decided once. The alternative —
 * two `DndContext`s configured independently — is how the two lists end up
 * feeling different for no reason anyone chose.
 *
 * The 6px activation distance matches the graph's ref-badge dragging, and here
 * it is doing real work: a repo row carries three overlapping click targets
 * (expand, select, close), and a drag that activated on pointer-down would
 * swallow every one of them.
 */
export function SortableList({
  ids,
  onReorder,
  children,
}: {
  /** Current order. Row keys must match these exactly. */
  ids: string[];
  /** The full new order, not a from/to pair — idempotent, and easy to persist. */
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) next.splice(to, 0, moved);
    onReorder(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // A list row has no business being dragged sideways or out of its panel;
      // without these the row follows the pointer across the whole window.
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Make one row draggable.
 *
 * Returns the props to spread rather than a wrapper component, because both
 * call sites need them on an element they already own — and because `Tooltip`
 * clones its child instead of wrapping it, a wrapper here would put a div
 * between the two and sever the ref dnd-kit tracks the row by.
 */
export function useSortableRow(id: string): {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown>;
  isDragging: boolean;
} {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return {
    setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      // Lift the dragged row above its neighbours; without it the rows below
      // paint over it as they slide.
      ...(isDragging ? { zIndex: 10, position: 'relative' as const } : {}),
    },
    attributes: attributes as unknown as Record<string, unknown>,
    listeners: (listeners ?? {}) as unknown as Record<string, unknown>,
    isDragging,
  };
}
