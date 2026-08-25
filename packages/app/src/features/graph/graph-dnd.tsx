import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Ref } from '@midnite-git/shared';

/**
 * Drag gestures on the graph: branch → branch, and commit → branch.
 *
 * The payloads are modelled as a union rather than loose ids because the drop
 * handler has to know *what* was dropped on *what* to offer the right actions —
 * a branch landing on a branch offers merge and rebase, a commit landing on a
 * branch offers cherry-pick, and everything else is not a drop at all.
 */
export type DragPayload =
  | { kind: 'ref'; ref: Ref }
  | { kind: 'commit'; sha: string; subject: string };

export type DropPayload = { kind: 'ref'; ref: Ref };

export type DropEvent = { source: DragPayload; target: Ref };

type DndState = { active: DragPayload | null };

const DndStateContext = createContext<DndState>({ active: null });

/** True while something is being dragged — drop targets light up. */
export const useDragActive = (): DragPayload | null => useContext(DndStateContext).active;

export function GraphDndProvider({
  children,
  onDrop,
}: {
  children: ReactNode;
  onDrop: (event: DropEvent) => void;
}) {
  const [active, setActive] = useState<DragPayload | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a distance threshold every click on a badge starts a drag, and
      // the click handlers (select, double-click to checkout) stop firing.
      activationConstraint: { distance: 6 },
    }),
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => {
        setActive((event.active.data.current as DragPayload | undefined) ?? null);
      }}
      onDragCancel={() => setActive(null)}
      onDragEnd={(event: DragEndEvent) => {
        setActive(null);
        const source = event.active.data.current as DragPayload | undefined;
        const target = event.over?.data.current as DropPayload | undefined;
        if (!source || !target) return;

        // Dropping a branch on itself is a no-op, not an error dialog.
        if (source.kind === 'ref' && source.ref.fullName === target.ref.fullName) return;

        onDrop({ source, target: target.ref });
      }}
    >
      <DndStateContext.Provider value={useMemo(() => ({ active }), [active])}>
        {children}
      </DndStateContext.Provider>

      {/*
        A drag overlay rather than transforming the badge in place: graph rows
        are virtualized, so the dragged element is unmounted the moment it
        scrolls out of view and the drag would visibly die mid-gesture.
      */}
      <DragOverlay dropAnimation={null}>
        {active ? (
          <span className="pointer-events-none rounded border border-primary bg-popover px-1.5 py-px text-[11px] shadow-lg">
            {active.kind === 'ref' ? active.ref.name : active.subject.slice(0, 40)}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Make a ref badge draggable and a drop target at once. */
export function useRefDnd(ref: Ref, rowId: string) {
  const dragId = `ref:${rowId}:${ref.fullName}`;

  const draggable = useDraggable({
    id: dragId,
    data: { kind: 'ref', ref } satisfies DragPayload,
    // A remote branch cannot be merged *into* from here in any meaningful way
    // the MVP supports, and a tag is not a branch — only local branches drag.
    disabled: ref.kind !== 'localBranch',
  });

  const droppable = useDroppable({
    id: `drop:${dragId}`,
    data: { kind: 'ref', ref } satisfies DropPayload,
    disabled: ref.kind === 'tag',
  });

  return { draggable, droppable };
}

/** Make a commit row draggable (for cherry-pick onto a branch). */
export function useCommitDnd(sha: string, subject: string) {
  return useDraggable({
    id: `commit:${sha}`,
    data: { kind: 'commit', sha, subject } satisfies DragPayload,
  });
}
