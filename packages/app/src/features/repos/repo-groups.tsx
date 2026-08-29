import { type CSSProperties, type ReactNode } from 'react';

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
import { ChevronRight, FolderPlus, GripVertical, MoreVertical, Palette, Pencil, Trash2 } from 'lucide-react';

import { Collapse } from '@bilo-io/ui';
import type { RepoDescriptor } from '@midnite/git-shared';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { useSortableRow } from '../../components/sortable-list';
import type { RepoGroup } from '../../store/ui-store';
import { useUiStore } from '../../store/ui-store';

export type RepoGroupColorDef = {
  id: string;
  label: string;
  swatch: string;
  pillClass: string;
};

export const REPO_GROUP_COLORS: readonly RepoGroupColorDef[] = [
  {
    id: 'red',
    label: 'Red',
    swatch: '#ef4444',
    pillClass: 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30',
  },
  {
    id: 'orange',
    label: 'Orange',
    swatch: '#f97316',
    pillClass: 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30',
  },
  {
    id: 'yellow',
    label: 'Yellow',
    swatch: '#eab308',
    pillClass: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
  },
  {
    id: 'green',
    label: 'Green',
    swatch: '#10b981',
    pillClass: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    swatch: '#06b6d4',
    pillClass: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30',
  },
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#3b82f6',
    pillClass: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  },
  {
    id: 'purple',
    label: 'Purple',
    swatch: '#a855f7',
    pillClass: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30',
  },
  {
    id: 'pink',
    label: 'Pink',
    swatch: '#ec4899',
    pillClass: 'bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30',
  },
];

function ColorGlyph({ style }: { style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className="h-3 w-3 rounded-full shrink-0 border border-black/10 dark:border-white/10"
      style={{ backgroundColor: 'currentColor', ...style }}
    />
  );
}

function NoneGlyph() {
  return (
    <span
      aria-hidden
      className="h-3 w-3 rounded-full shrink-0 border border-dashed border-muted-foreground/60 bg-transparent"
    />
  );
}

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
  const setRepoGroupColor = useUiStore((s) => s.setRepoGroupColor);
  const deleteGroup = useUiStore((s) => s.deleteRepoGroup);
  const dialogs = useDialogs();

  const colorDef = REPO_GROUP_COLORS.find((c) => c.id === group.color);

  const openMenu = (at: { clientX: number; clientY: number }) => {
    dialogs.openMenu(at, [
      {
        label: 'Rename group…',
        icon: Pencil,
        onSelect: () => {
          dialogs.prompt({
            title: 'Rename group',
            label: 'Group name',
            initialValue: group.name,
            confirmLabel: 'Rename',
            onConfirm: (name) => renameGroup(group.id, name),
          });
        },
      },
      {
        label: 'Group Color',
        icon: Palette,
        submenu: [
          {
            label: 'None',
            icon: NoneGlyph,
            onSelect: () => setRepoGroupColor(group.id, undefined),
          },
          ...REPO_GROUP_COLORS.map((c) => ({
            label: c.label,
            icon: ColorGlyph,
            iconStyle: { color: c.swatch },
            onSelect: () => setRepoGroupColor(group.id, c.id),
          })),
        ],
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
        {colorDef ? (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colorDef.pillClass}`}
          >
            {group.name}
          </span>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.name}
          </span>
        )}
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
  const dialogs = useDialogs();

  return (
    <IconButton
      icon={FolderPlus}
      label="New repo group"
      size="sm"
      onClick={() => {
        dialogs.prompt({
          title: 'New repo group',
          label: 'Group name',
          confirmLabel: 'Create',
          onConfirm: (name) => createGroup(name),
        });
      }}
    />
  );
}
