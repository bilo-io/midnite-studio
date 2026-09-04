import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuChevronsUpDown,
  LuCircleDot,
  LuCopy,
  LuGitPullRequest,
  LuKanban,
  LuLayers,
  LuNotebookPen,
  LuTable,
} from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import { IconButton, type IconComponent } from '../../components/icon-button';
import { ItemFilterToolbar } from '../../components/item-filter-toolbar';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { VIEW_ICON } from '../../components/nav-icons';
import { ExternalLink } from '../markdown/external-link';
import { bridge } from '../../services/bridge';
import { BoardView } from './board/board-view';
import { groupableFields, resolveGroupField } from './board/resolve-group-field';
import { ProjectFieldCell } from './field-editor';
import {
  filterProjectItems,
  isProjectItemFilterEmpty,
  selectProjectItem,
  type ItemFilterState,
  type ProjectItemFilterState,
} from './filter';
import { nextSortState, sortItems, type SortState } from './sort';
import { useForgeProjectFields, useForgeProjectItems, useForgeProjects } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { DEFAULT_PROJECT_VIEW, useUiStore } from '../../store/ui-store';

/**
 * The Projects view (Phase 40 Theme D): a board picker above the picked
 * board's items, rendered as a table.
 *
 * `EmptyWorkspace` and the "no GitHub remote" redirect both happen one layer
 * up, in `app.tsx` — by the time this component ever mounts, a repo is
 * selected and its remote resolved a `Forge`, exactly like every other
 * forge-gated view (`ActionsView`, `ReviewsView`). What is left here is the
 * five states the phase doc names: no boards for this owner, no board
 * picked, the picked board has no items, a missing `read:project` scope, and
 * — the steady state — the table.
 *
 * The board mode (Phase 41 Theme A) lives inside this same view rather than
 * as its own nav item — one board picker, one gating path, one data source
 * turned sideways rather than duplicated.
 *
 * **Phase 52** adds one filter toolbar shared by both modes (Theme A), a
 * group-by picker for Board mode (Theme B), sortable Table columns (Theme C)
 * and per-project persistence of all three plus column collapse (Theme D) —
 * every value already client-side on `ForgeProjectItem`, so none of this
 * needs a new IPC channel.
 */
export function ProjectsView() {
  const { repoId, worktreePath } = useActiveWorktree();
  const boardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const setProjectBoard = useUiStore((s) => s.setProjectBoard);
  const modeByRepo = useUiStore((s) => s.projectsMode);
  const setProjectsMode = useUiStore((s) => s.setProjectsMode);
  const mode = repoId !== null ? (modeByRepo[repoId] ?? 'table') : 'table';

  // Fetching starts only once this view is mounted, matching every other
  // forge read's `enabled` gate — see the phase doc's own acceptance test.
  const projects = useForgeProjects(repoId, true);
  const boards = projects.data?.projects ?? [];

  const selectedProjectId = repoId !== null ? (boardByRepo[repoId] ?? null) : null;
  const boardStillExists =
    selectedProjectId !== null && boards.some((b) => b.id === selectedProjectId);

  const fieldsQuery = useForgeProjectFields(selectedProjectId, selectedProjectId !== null);
  const itemsQuery = useForgeProjectItems(selectedProjectId, selectedProjectId !== null);

  const view =
    useUiStore((s) => (selectedProjectId ? s.projectViewByProject[selectedProjectId] : undefined)) ??
    DEFAULT_PROJECT_VIEW;
  const setProjectView = useUiStore((s) => s.setProjectView);
  // Hoisted above every conditional return — a hook cannot be called only on
  // the branch that happens to render Board mode.
  const collapsedColumns = useMemo(() => new Set(view.collapsedColumns), [view.collapsedColumns]);
  // Same reasoning, now that `ItemFilterToolbar`'s lift (Theme E) moved this
  // out of the old private `ProjectsToolbar`, which mounted only once
  // `dataReady` — a component, unlike a plain expression, cannot skip its
  // own hook call on the renders before that.
  const groupableColumns = useMemo(
    () => groupableFields(fieldsQuery.data?.fields ?? []),
    [fieldsQuery.data?.fields],
  );

  const scopeMissing =
    projects.data?.kind === 'insufficient-scope' || itemsQuery.data?.kind === 'insufficient-scope';

  if (scopeMissing) return <MissingScopeState />;

  if (projects.isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading projects…</p>;
  }

  if (projects.data?.error) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="Could not load projects"
        body={projects.data.error}
      />
    );
  }

  if (boards.length === 0) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="No projects"
        body="This owner has no projects, or none this token can see."
      />
    );
  }

  const allFields = fieldsQuery.data?.fields ?? [];
  const allItems = itemsQuery.data?.items ?? [];
  const filteredItems = filterProjectItems(allItems, view.filter);
  const filterActive = !isProjectItemFilterEmpty(view.filter);
  const dataReady = selectedProjectId !== null && !itemsQuery.isLoading && !fieldsQuery.isLoading && !itemsQuery.data?.error;

  const setFilter = (filter: ProjectItemFilterState): void => {
    if (selectedProjectId) setProjectView(selectedProjectId, { filter });
  };
  /**
   * `ItemFilterToolbar`'s own `onFilterChange` hands back the shared facets
   * only — `types` is not its concern (see the component's own doc comment)
   * — so this merges the update onto the current `types` rather than
   * dropping it, the way the sibling `types` menu below merges onto the
   * shared facets it does not own either.
   */
  const setSharedFilter = (shared: ItemFilterState): void => {
    setFilter({ ...shared, types: view.filter.types });
  };
  const setGroupFieldId = (groupFieldId: string | null): void => {
    if (selectedProjectId) setProjectView(selectedProjectId, { groupFieldId });
  };
  const setSort = (sort: SortState): void => {
    if (selectedProjectId) setProjectView(selectedProjectId, { sort });
  };
  const toggleColumn = (columnId: string): void => {
    if (!selectedProjectId) return;
    const collapsed = view.collapsedColumns.includes(columnId)
      ? view.collapsedColumns.filter((id) => id !== columnId)
      : [...view.collapsedColumns, columnId];
    setProjectView(selectedProjectId, { collapsedColumns: collapsed });
  };
  const expandColumn = (columnId: string): void => {
    if (!selectedProjectId || !view.collapsedColumns.includes(columnId)) return;
    setProjectView(selectedProjectId, { collapsedColumns: view.collapsedColumns.filter((id) => id !== columnId) });
  };

  const groupField = mode === 'board' ? resolveGroupField(allFields, view.groupFieldId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="projects-view">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="mr-auto text-sm font-semibold tracking-tight">Projects</h2>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Board</span>
          <select
            aria-label="Project board"
            value={boardStillExists ? (selectedProjectId ?? '') : ''}
            onChange={(event) => {
              if (repoId && event.target.value) setProjectBoard(repoId, event.target.value);
            }}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
          >
            <option value="" disabled>
              Pick a board…
            </option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.title}
                {board.closed ? ' (closed)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="View mode"
          data-testid="projects-view-mode-slot"
          className="flex items-center gap-0.5"
        >
          {(
            [
              { id: 'table', label: 'Table view', icon: LuTable },
              { id: 'board', label: 'Board view', icon: LuKanban },
            ] as const
          ).map((option) => (
            <IconButton
              key={option.id}
              icon={option.icon}
              label={option.label}
              aria-pressed={mode === option.id}
              size="sm"
              className={mode === option.id ? 'bg-primary/10 text-foreground' : ''}
              onClick={() => repoId && setProjectsMode(repoId, option.id)}
            />
          ))}
        </div>
      </header>

      {dataReady ? (
        <ItemFilterToolbar
          items={allItems}
          select={selectProjectItem}
          filter={view.filter}
          onFilterChange={setSharedFilter}
          stateOptions={STATE_OPTIONS}
        >
          <MultiSelectMenu
            options={TYPE_OPTIONS}
            selected={view.filter.types}
            onChange={(types) => setFilter({ ...view.filter, types: types as ProjectItemFilterState['types'] })}
            icon={<LuLayers aria-hidden className="h-3.5 w-3.5 shrink-0" />}
            allLabel="All types"
            searchPlaceholder="Filter type…"
            emptyLabel="No type matches."
            label="Filter by item type"
            summarise={(n) => `${n} types`}
          />

          {/*
            Board-only, but lives here rather than beside the board
            `<select>`: grouping is how you are looking at the board, like
            the filters, and that `<select>` chooses *which* board — a
            different kind of choice. Same reasoning `ProjectsToolbar`
            carried before Theme E lifted it.
          */}
          {mode === 'board' && groupableColumns.length > 0 ? (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Group by</span>
              <select
                aria-label="Group by"
                value={groupField?.id ?? ''}
                onChange={(event) => setGroupFieldId(event.target.value || null)}
                className="rounded border border-border bg-background px-1.5 py-1 text-xs"
              >
                {groupableColumns.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </ItemFilterToolbar>
      ) : null}

      {selectedProjectId === null ? (
        <EmptyState
          icon={VIEW_ICON.projects}
          title="Pick a board"
          body="Choose a project board above to see its items."
        />
      ) : itemsQuery.isLoading || fieldsQuery.isLoading ? (
        <p className="p-4 text-xs text-muted-foreground">Loading items…</p>
      ) : itemsQuery.data?.error ? (
        <EmptyState icon={VIEW_ICON.projects} title="Could not load items" body={itemsQuery.data.error} />
      ) : mode === 'board' ? (
        <BoardView
          projectId={selectedProjectId}
          repoId={repoId}
          worktreePath={worktreePath}
          items={filteredItems}
          fields={allFields}
          groupField={groupField}
          collapsedColumns={collapsedColumns}
          onToggleColumn={toggleColumn}
          onExpandColumn={expandColumn}
        />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={VIEW_ICON.projects}
          title="No items"
          body="This board has no items yet."
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={VIEW_ICON.projects}
          title="No items match"
          body="No items match the current filter."
        />
      ) : (
        <ProjectItemsTable
          projectId={selectedProjectId}
          items={sortItems(filteredItems, allFields, view.sort)}
          fields={allFields}
          truncated={itemsQuery.data?.truncated ?? false}
          filterActive={filterActive}
          sort={view.sort}
          onSortChange={(fieldId) => setSort(nextSortState(view.sort, fieldId))}
        />
      )}
    </div>
  );
}

const TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'issue', label: 'Issues' },
  { value: 'pull', label: 'Pull requests' },
  { value: 'draft', label: 'Drafts' },
];

const STATE_OPTIONS: MultiSelectOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'merged', label: 'Merged' },
];


const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};

const ROW_HEIGHT = 32;

function SortableHeader({
  field,
  sort,
  onSortChange,
}: {
  field: ForgeProjectField;
  sort: SortState;
  onSortChange: (fieldId: string) => void;
}) {
  const active = sort?.fieldId === field.id;
  const direction = active ? sort.direction : undefined;
  const Icon = direction === 'asc' ? LuArrowUp : direction === 'desc' ? LuArrowDown : LuChevronsUpDown;
  const directionLabel = direction === 'asc' ? ', ascending' : direction === 'desc' ? ', descending' : '';

  return (
    <button
      type="button"
      onClick={() => onSortChange(field.id)}
      aria-label={`Sort by ${field.name}${directionLabel}`}
      className="flex min-w-0 items-center gap-1 truncate hover:text-foreground"
    >
      <span className="min-w-0 truncate">{field.name}</span>
      <Icon aria-hidden className={`h-3 w-3 shrink-0 ${active ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  );
}

/**
 * The item table: title, type glyph, assignees, one column per field.
 *
 * Virtualised with the `estimateSize`/`measureElement` recipe from
 * `diff-view.tsx` — the house pattern for a variable-height virtualised list
 * in this app — with the house `overscan` of 24. Rows are a fixed height here
 * (no wrapped multi-line cells), so `estimateSize` is a constant, but
 * `measureElement` is still wired so a future wrapped-text column does not
 * need the virtualizer rebuilt.
 *
 * `items` arrives already filtered and sorted (Phase 52 Themes A/C) — this
 * component renders whatever order it is handed, composing the two exactly
 * the way the phase doc calls for: sorting runs after filtering, over the
 * already-virtualized rows, so the row count changes and the virtualizer
 * does not.
 */
function ProjectItemsTable({
  projectId,
  items,
  fields,
  truncated,
  filterActive,
  sort,
  onSortChange,
}: {
  projectId: string;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  truncated: boolean;
  filterActive: boolean;
  sort: SortState;
  onSortChange: (fieldId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="w-6 shrink-0" />
        <span className="min-w-0 flex-1">Title</span>
        <span className="w-40 shrink-0">Assignees</span>
        {fields.map((field) => (
          <span key={field.id} className="w-32 shrink-0 px-2">
            <SortableHeader field={field} sort={sort} onSortChange={onSortChange} />
          </span>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            const Icon = CONTENT_ICON[item.content.type];
            const title = item.content.title;
            const href = item.content.type === 'draft' ? null : item.content.url;

            return (
              <div
                key={item.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 flex w-full items-center border-b border-border/60 px-3 text-xs"
                style={{ transform: `translateY(${virtualRow.start}px)`, height: ROW_HEIGHT }}
              >
                <span className="w-6 shrink-0">
                  <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {href ? <ExternalLink href={href}>{title}</ExternalLink> : title}
                </span>
                <span className="w-40 shrink-0 truncate text-muted-foreground">
                  {item.content.assignees.join(', ')}
                </span>
                {fields.map((field) => (
                  <span key={field.id} className="w-32 shrink-0 px-2">
                    <ProjectFieldCell
                      projectId={projectId}
                      itemId={item.id}
                      field={field}
                      value={item.fieldValues[field.id]}
                    />
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {truncated ? (
        <p className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {filterActive
            ? 'Showing the first 1,000 items, filtered — this board has more than this view will load.'
            : 'Showing the first 1,000 items — this board has more than this view will load.'}
        </p>
      ) : null}
    </div>
  );
}


/** How the fix is spelled — shown verbatim, per the phase doc's own rule. */
const SCOPE_FIX_COMMAND = 'gh auth refresh -s project';

/**
 * The missing-`read:project`-scope state.
 *
 * `gh auth login`'s own hint (what `ForgeCliStatus.hint` would say for every
 * other forge surface) does not add a scope to an existing token, which is
 * why this names the actual fix rather than reusing that generic copy.
 */
function MissingScopeState() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <VIEW_ICON.projects aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-medium">GitHub Projects needs one more permission</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your GitHub CLI token is missing the <code>project</code> scope. Run this in a terminal,
        then reopen this view:
      </p>
      <div className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1.5">
        <code className="text-xs">{SCOPE_FIX_COMMAND}</code>
        <button
          type="button"
          aria-label="Copy command"
          onClick={() => {
            void bridge()
              ?.clipboard.writeText({ text: SCOPE_FIX_COMMAND })
              .then((result) => {
                if (result?.ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              });
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <LuCheck aria-hidden className="h-3.5 w-3.5" /> : <LuCopy aria-hidden className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
