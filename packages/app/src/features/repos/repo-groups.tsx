import { type ReactNode } from 'react';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronRight, GripVertical, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';

import { Collapse } from '@bilo-io/ui';
import type { RepoDescriptor } from '@midnite/git-shared';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { useSortableRow } from '../../components/sortable-list';
import type { RepoGroup } from '../../store/ui-store';
import { useUiStore } from '../../store/ui-store';

// ── Group accordion header ────────────────────────────────────────────────────

export function RepoGroupHeader({
  group,
  repoCount,
  open,
  onToggle,
}: {
  group: RepoGroup;
  repoCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  const drag = useSortableRow(group.id);
  const renameGroup = useUiStore((s) => s.renameRepoGroup);
  const deleteGroup = useUiStore((s) => s.deleteRepoGroup);
  const dialogs = useDialogs();

  const openMenu = (at: { clientX: number; clientY: number }) => {
    dialogs.openMenu(at, [
      {
        label: 'Rename group…',
        icon: Pencil,
        onSelect: () => {
          const name = window.prompt('Group name', group.name)?.trim();
          if (name) renameGroup(group.id, name);
        },
      },
      {
        label: 'Delete group',
        icon: Trash2,
        danger: true,
        onSelect: () => deleteGroup(group.id),
      },
    ]);
  };

  return (
    <div
      ref={drag.setNodeRef}
      style={drag.style}
      className={`group flex h-7 items-center gap-1 border-t border-border/60 bg-background px-1 pr-2 ${
        drag.isDragging ? 'opacity-80' : ''
      }`}
    >
      {/* Drag handle */}
      <span
        {...drag.attributes}
        {...drag.listeners}
        aria-label={`Reorder group ${group.name}`}
        title="Drag to reorder"
        className="shrink-0 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="h-3.5 w-3.5" />
      </span>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left transition-colors hover:text-foreground"
      >
        <ChevronRight
          aria-hidden
          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {group.name}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">{repoCount}</span>
      </button>

      {/* Context menu ellipsis */}
      <IconButton
        icon={MoreVertical}
        label={`Actions for group ${group.name}`}
        size="sm"
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu({
            clientX: event.clientX || rect.left,
            clientY: event.clientY || rect.bottom,
          });
        }}
      />
    </div>
  );
}

// ── Sortable group list wrapper ───────────────────────────────────────────────

export function SortableGroupList({
  groups,
  onReorder,
  children,
}: {
  groups: RepoGroup[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const ids = groups.map((g) => g.id);

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
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

// ── Group accordion item ──────────────────────────────────────────────────────

export function RepoGroupItem({
  group,
  repos,
  children,
}: {
  group: RepoGroup;
  repos: RepoDescriptor[];
  children: ReactNode;
}) {
  const collapsed = useUiStore((s) => s.collapsedRepoGroups.includes(group.id));
  const toggleRepoGroup = useUiStore((s) => s.toggleRepoGroup);
  const open = !collapsed;

  const bodyId = `group-body-${group.id}`;

  return (
    <section>
      <RepoGroupHeader
        group={group}
        repoCount={repos.length}
        open={open}
        onToggle={() => toggleRepoGroup(group.id)}
      />
      <Collapse open={open} id={bodyId} aria-label={group.name}>
        {children}
      </Collapse>
    </section>
  );
}

// ── "New group" button ────────────────────────────────────────────────────────

export function NewGroupButton() {
  const createGroup = useUiStore((s) => s.createRepoGroup);

  return (
    <IconButton
      icon={Plus}
      label="New repo group"
      size="sm"
      onClick={() => {
        const name = window.prompt('Group name')?.trim();
        if (name) createGroup(name);
      }}
    />
  );
}
