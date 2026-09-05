import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronRight, LuGlobe, LuPlus, LuSquareArrowOutUpRight, LuX } from 'react-icons/lu';

import { ContextMenu, type MenuItem, type MenuPosition } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import {
  usePopoutHeaderActions,
  usePopoutHeaderLeading,
} from '../../components/detached-window-frame';
import { IconButton } from '../../components/icon-button';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { Tooltip } from '../../components/tooltip';
import { useSortableRow } from '../../components/sortable-list';
import { bridge } from '../../services/bridge';
import { useRepos } from '../../services/queries';
import {
  effectiveGroupId,
  useBrowserStore,
  type BrowserTab,
  type BrowserTabGroup,
} from '../../store/browser-store';
import {
  DEFAULT_TAB_GROUP_COLOR,
  TAB_GROUP_COLORS,
  colorForRepoId,
  tabGroupColorValue,
} from './tab-group-colors';

/**
 * Above this many tabs, closing a whole group asks first — the same
 * blast-radius discipline the git ops use, at the scale a tab strip
 * deserves (losing two tabs is an undo away via Mod+Shift+T; losing nine is
 * not something to discover after the fact).
 */
const CLOSE_GROUP_CONFIRM_THRESHOLD = 3;

/**
 * The browser's own tab bar, modelled on
 * `features/workbench/tab-strip.tsx` — same `role="tablist"`, same
 * `overflow-x-auto` overflow decision, same always-visible-on-active close
 * affordance. A second copy rather than a shared component: the workbench
 * strip has a permanent unclosable first tab (the working tree) that the
 * browser has no equivalent of, and forcing the two to share props would
 * make that difference a conditional rather than the workbench file's own
 * settled shape.
 *
 * Groups render as a coloured, collapsible wrapper around a contiguous run
 * of tabs — `moveTabToGroup` keeps a group's members adjacent by
 * relocating a tab into place on assignment, so a group is a run in
 * practice; a plain drag-reorder can still interrupt one, which reads as
 * the same group appearing twice rather than corrupting anything.
 */
export function BrowserTabStrip() {
  // This exact strip renders inside the Browser popout too (`DetachedRoot`
  // reuses `<BrowserPane>` verbatim) — the detach button would otherwise
  // advertise "detach me into a window" while already being one.
  const isPopout = (bridge()?.windowRole ?? 'main') !== 'main';
  // Set only once popped out AND the window has a frameless title bar to
  // merge into (`DetachedWindowFrame`) — leadingTarget aligns tabs to the left
  // beside the window controls and dock mark; actionsTarget stays as fallback.
  const leadingTarget = usePopoutHeaderLeading();
  const actionsTarget = usePopoutHeaderActions();
  const portalTarget = leadingTarget ?? actionsTarget;
  const tabs = useBrowserStore((s) => s.tabs);
  const groups = useBrowserStore((s) => s.groups);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  // A derived group is labelled with its repo's own name, so the chip reads
  // the same as the sidebar entry the tab was opened from.
  const { data: repos } = useRepos();
  const repoNameById = new Map((repos ?? []).map((repo) => [repo.id, repo.name]));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const manualIds = new Set(groups.map((g) => g.id));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);

    if (overId.startsWith('group-drop:')) {
      useBrowserStore
        .getState()
        .moveTabToGroup(String(active.id), overId.slice('group-drop:'.length));
      return;
    }
    if (overId === 'ungrouped-drop') {
      useBrowserStore.getState().moveTabToGroup(String(active.id), null);
      return;
    }
    if (active.id === over.id) return;
    const ids = tabs.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) next.splice(to, 0, moved);
    useBrowserStore.getState().reorderTabs(next);
  };

  // Segment the ordered tabs into ungrouped singles and contiguous group runs.
  const segments: { groupId: string | null; tabs: BrowserTab[] }[] = [];
  for (const tab of tabs) {
    const id = effectiveGroupId(tab, manualIds);
    const last = segments[segments.length - 1];
    if (last && last.groupId === id) last.tabs.push(tab);
    else segments.push({ groupId: id, tabs: [tab] });
  }

  const tabList = (
    <>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        {segments.map((segment, index) =>
          segment.groupId === null ? (
            segment.tabs.map((tab) => (
              <BrowserTabButton key={tab.id} tab={tab} active={tab.id === activeTabId} />
            ))
          ) : (
            <GroupChip
              key={`${segment.groupId}:${index}`}
              groupId={segment.groupId}
              group={groups.find((g) => g.id === segment.groupId)}
              repoName={
                segment.groupId.startsWith('repo:')
                  ? repoNameById.get(segment.groupId.slice('repo:'.length))
                  : undefined
              }
              tabs={segment.tabs}
              activeTabId={activeTabId}
            />
          ),
        )}
      </SortableContext>

      <Tooltip label="New tab (Mod+T)">
        <button
          type="button"
          aria-label="New tab"
          onClick={() => useBrowserStore.getState().openTab()}
          className="flex shrink-0 items-center px-2 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          <LuPlus aria-hidden className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </>
  );

  if (isPopout && portalTarget) {
    // Merged into the window's own title bar (`DetachedWindowFrame`'s `left`
    // already carries the hover-mark and "Browser") — the whole strip moves
    // here verbatim, minus the detach button (replaced by hovering that
    // mark), and drops the full-width border/background that made sense as
    // a header row but not inside the bar's own action slot.
    return createPortal(
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <div role="tablist" aria-label="Browser tabs" className="flex items-stretch gap-0.5">
          {tabList}
        </div>
      </DndContext>,
      portalTarget,
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <div
        role="tablist"
        aria-label="Browser tabs"
        className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card/40"
      >
        {!isPopout && (
          <IconButton
            icon={LuSquareArrowOutUpRight}
            label="Detach Browser into its own window"
            size="sm"
            className="my-auto ml-1 shrink-0"
            onClick={() => bridge()?.window.detach({ role: 'browser' })}
          />
        )}
        {tabList}
      </div>
    </DndContext>
  );
}

function GroupChip({
  groupId,
  group,
  repoName,
  tabs,
  activeTabId,
}: {
  groupId: string;
  /** Absent for a derived (repo) group — it has no persisted record. */
  group?: BrowserTabGroup;
  repoName?: string;
  tabs: BrowserTab[];
  activeTabId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-drop:${groupId}` });
  const dialogs = useDialogs();
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [renaming, setRenaming] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  const color = group?.color ?? colorForRepoId(groupId.slice('repo:'.length));
  const name = group?.name ?? repoName ?? 'Repository';
  const collapsed = group?.collapsed ?? false;

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  const commitRename = (value: string) => {
    setRenaming(false);
    const trimmed = value.trim();
    if (group && trimmed.length > 0 && trimmed !== group.name) {
      useBrowserStore.getState().renameGroup(group.id, trimmed);
    }
  };

  const closeGroup = () => {
    const close = () => useBrowserStore.getState().closeTabsInGroup(groupId);
    // Below the threshold this is a single undoable gesture; above it, the
    // same confirm-with-blast-radius discipline the destructive git ops use.
    if (tabs.length <= CLOSE_GROUP_CONFIRM_THRESHOLD) {
      close();
      return;
    }
    dialogs.confirm({
      title: `Close ${tabs.length} tabs?`,
      body: `Every tab in "${name}" closes. Mod+Shift+T reopens them one at a time.`,
      confirmLabel: `Close ${tabs.length} tabs`,
      danger: true,
      blastRadius: null,
      onConfirm: close,
    });
  };

  /**
   * A derived (repo) group has no persisted record to rename, recolour or
   * delete — it exists only as long as its tabs do, so the only thing that
   * can be done TO one is close it. Dragging a tab out is how you leave it.
   */
  const menuItems: MenuItem[] = group
    ? [
        { label: 'Rename group', onSelect: () => setRenaming(true) },
        {
          label: 'Group colour',
          submenu: TAB_GROUP_COLORS.map((swatch, index) => ({
            label: `Colour ${index + 1}`,
            icon: SwatchIcon,
            iconStyle: { color: tabGroupColorValue(swatch) },
            onSelect: () => useBrowserStore.getState().setGroupColor(group.id, swatch),
          })),
        },
        {
          label: collapsed ? 'Expand group' : 'Collapse group',
          onSelect: () => useBrowserStore.getState().toggleGroupCollapsed(group.id),
        },
        { type: 'separator' },
        {
          label: 'Ungroup (keep tabs)',
          onSelect: () => useBrowserStore.getState().ungroupKeepTabs(group.id),
        },
        { label: `Close group (${tabs.length})`, danger: true, onSelect: closeGroup },
      ]
    : [{ label: `Close group (${tabs.length})`, danger: true, onSelect: closeGroup }];

  return (
    <div
      ref={setNodeRef}
      className={`flex shrink-0 items-stretch border-r border-border ${isOver ? 'bg-accent/40' : ''}`}
      style={{ boxShadow: `inset 0 2px 0 0 ${tabGroupColorValue(color)}` }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {renaming && group ? (
        <input
          ref={renameRef}
          defaultValue={group.name}
          aria-label="Group name"
          onBlur={(event) => commitRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename(event.currentTarget.value);
            if (event.key === 'Escape') setRenaming(false);
            event.stopPropagation();
          }}
          className="w-24 shrink-0 self-center rounded border border-border bg-card px-1 py-0.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${name} tab group`}
          onClick={() => group && useBrowserStore.getState().toggleGroupCollapsed(group.id)}
          // Double-click renames in place — the same gesture every browser
          // uses for a group chip, with the context menu as its discoverable twin.
          onDoubleClick={() => group && setRenaming(true)}
          className="flex shrink-0 items-center gap-1 px-2 text-xs font-medium"
          style={{ color: tabGroupColorValue(color) }}
        >
          <LuChevronRight
            aria-hidden
            className={`h-3 w-3 transition-transform duration-150 ease-in-out ${collapsed ? '' : 'rotate-90'}`}
          />
          <span className="max-w-[8rem] truncate">{name}</span>
          <span className="text-muted-foreground/70">{tabs.length}</span>
        </button>
      )}
      {collapsed
        ? null
        : tabs.map((tab) => (
            <BrowserTabButton key={tab.id} tab={tab} active={tab.id === activeTabId} />
          ))}
      {menu ? (
        <ContextMenu position={menu} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}

/** A filled dot standing in for a colour, tinted by the menu row's `iconStyle`. */
function SwatchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" aria-hidden className={className}>
      <circle cx="4" cy="4" r="3.5" fill="currentColor" />
    </svg>
  );
}

function BrowserTabButton({ tab, active }: { tab: BrowserTab; active: boolean }) {
  const { setNodeRef, style, attributes, listeners } = useSortableRow(tab.id);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const dialogs = useDialogs();

  const close = () => useBrowserStore.getState().closeTab(tab.id);
  const label = tab.title || hostOf(tab.url) || 'New Tab';

  const menuItems: MenuItem[] = [
    { label: 'Reload', onSelect: () => bridge()?.browser.reload({ tabId: tab.id }) },
    { label: 'Duplicate', onSelect: () => useBrowserStore.getState().duplicateTab(tab.id) },
    {
      label: 'Copy URL',
      onSelect: () => void bridge()?.clipboard.writeText({ text: tab.url }),
    },
    {
      label: 'Move to group',
      submenu: [
        {
          label: 'New group…',
          onSelect: () =>
            dialogs.prompt({
              title: 'New tab group',
              label: 'Group name',
              initialValue: tab.title || hostOf(tab.url) || 'Group',
              confirmLabel: 'Create group',
              onConfirm: (value) => {
                const store = useBrowserStore.getState();
                // The next unused colour, so two groups made back to back
                // never come out the same shade.
                const used = new Set(store.groups.map((g) => g.color));
                const color = TAB_GROUP_COLORS.find((c) => !used.has(c)) ?? DEFAULT_TAB_GROUP_COLOR;
                store.moveTabToGroup(tab.id, store.createGroup(value.trim(), color));
              },
            }),
        },
        ...(useBrowserStore.getState().groups.length > 0 ? [{ type: 'separator' as const }] : []),
        ...useBrowserStore.getState().groups.map((g) => ({
          label: g.name,
          icon: SwatchIcon,
          iconStyle: { color: tabGroupColorValue(g.color) },
          onSelect: () => useBrowserStore.getState().moveTabToGroup(tab.id, g.id),
        })),
        { type: 'separator' as const },
        {
          label: 'Remove from group',
          onSelect: () => useBrowserStore.getState().moveTabToGroup(tab.id, null),
        },
      ],
    },
    { type: 'separator' },
    { label: 'Close', onSelect: close },
    { label: 'Close others', onSelect: () => useBrowserStore.getState().closeOthers(tab.id) },
    {
      label: 'Close to the right',
      onSelect: () => useBrowserStore.getState().closeToRight(tab.id),
    },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={(event) => {
        event.preventDefault();
        // A grouped tab sits inside the chip, which has its own menu — without
        // this, right-clicking a tab opens both, stacked on top of each other.
        event.stopPropagation();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
      className={`group flex shrink-0 items-center gap-1.5 border-r border-border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-background text-foreground shadow-[inset_0_-2px_0_0_hsl(var(--primary))]'
          : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground'
      }`}
    >
      <Tooltip label={tab.url || label}>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => useBrowserStore.getState().activateTab(tab.id)}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault();
              close();
            }
          }}
          className="flex min-w-0 max-w-[14rem] items-center gap-1.5"
        >
          <TabFavicon tab={tab} />
          <span className="truncate">{label}</span>
        </button>
      </Tooltip>

      <button
        type="button"
        onClick={close}
        aria-label={`Close ${label}`}
        className={`shrink-0 rounded p-0.5 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${
          active ? '' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <LuX aria-hidden className="h-3 w-3" />
      </button>

      {menu ? (
        <ContextMenu position={menu} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}

/**
 * Spinner while loading, then the page's own favicon; a blank new tab wears
 * the traced monochrome `MidniteIcon` (the PNG `BrandMark` is a hero asset
 * and unreadable at 16px), and a loaded page with no favicon of its own
 * falls back to a generic globe.
 */
function TabFavicon({ tab }: { tab: BrowserTab }): ReactNode {
  if (tab.loading) {
    return (
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground"
      />
    );
  }
  if (tab.faviconUrl) {
    return (
      <img src={tab.faviconUrl} alt="" aria-hidden className="h-3 w-3 shrink-0 rounded-[2px]" />
    );
  }
  if (tab.kind === 'newtab') return <MidniteIcon className="h-3 w-3 shrink-0" />;
  return <LuGlobe aria-hidden className="h-3 w-3 shrink-0" />;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
