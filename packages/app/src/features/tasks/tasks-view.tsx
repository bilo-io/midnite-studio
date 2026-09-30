import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuChevronsUpDown,
  LuCircleDot,
  LuCopy,
  LuFilePlus2,
  LuGitPullRequest,
  LuKanban,
  LuLayers,
  LuNotebookPen,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuTable,
  LuWorkflow,
} from 'react-icons/lu';

import {
  pickForgeRemote,
  resolveForgeGraph,
  type ForgeIssue,
  type ForgeProjectField,
  type ForgeProjectItem,
} from '@midnite/studio-shared';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { EmptyState } from '../../components/empty-state';
import { IconButton, type IconComponent } from '../../components/icon-button';
import { ItemFilterToolbar } from '../../components/item-filter-toolbar';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { UserAvatar } from '../../components/user-avatar';
import { ActivityBadgeStack } from '../activity/activity-badge';
import { VIEW_ICON } from '../../components/nav-icons';
import { ExternalLink } from '../markdown/external-link';
import { bridge } from '../../services/bridge';
import { CASCADE_MAX_STEPS } from '../../lib/cascade';
import { useCascadeReveal } from '../../lib/use-cascade-reveal';
import { BoardView } from './board/board-view';
import { taskGlowClass } from './board/glow-state';
import { StatusRule } from './board/status-border';
import { CardPanelStack } from './board/card-panel-stack';
import { groupableFields, resolveGroupField } from './board/resolve-group-field';
import { ProjectFieldCell } from './field-editor';
import {
  filterProjectItems,
  isProjectItemFilterEmpty,
  selectProjectItem,
  type ItemFilterState,
  type ProjectItemFilterState,
} from './filter';
import { apiFieldBlockersFor, blockedItemIds } from './graph/graph-blockers';
import { DEFAULT_GRAPH_FACETS, isDefaultGraphFacets, type ProjectGraphFacets } from './graph/graph-filter';
import { useGraphAgentStates, type GraphNodeActivity } from './graph/use-graph-agent-states';
import { ProjectGraphView } from './graph/project-graph-view';
import { nextSortState, sortItems, type SortState } from './sort';
import { findStatusField, itemStatusStroke } from './status-stroke';
import {
  useActiveForgeCapability,
  useAddProjectItem,
  useForgeIssues,
  useForgeProjectFields,
  useForgeProjectItems,
  useForgeProjects,
  useRemotes,
} from '../../services/queries';
import { useForgeSubscription } from '../../services/use-forge-subscription';
import { useActiveWorktree } from '../../services/use-status';
import { DEFAULT_PROJECT_VIEW, useUiStore } from '../../store/ui-store';
import { PageDetachMark } from '../../components/page-detach-mark';
import { submitCommand } from '../terminal/submit-command';
import { ProjectDialog, type ProjectDialogMode } from './project-dialog';
import { PlanWithAiBar } from './plan/plan-with-ai-bar';
import { IssueDialog } from './issue/issue-dialog';
import { IssuePills, TaskIssueProvider, useOpenIssue } from './issue-pills';
import {
  isRepoIssuesSource,
  REPO_ISSUES_FIELDS,
  REPO_ISSUES_SOURCE_ID,
  repoIssuesAsItems,
} from './repo-issues-source';
import { useToastStore } from '../../store/toast-store';

const PROJECTS_MODES = ['table', 'board', 'graph'] as const;
type ProjectsMode = (typeof PROJECTS_MODES)[number];

/** A persisted value from an older build, or plain corruption, must not pass
 *  through — see the phase doc's own rule for `projectsMode`. */
function coerceProjectsMode(value: string | undefined): ProjectsMode {
  return value !== undefined && (PROJECTS_MODES as readonly string[]).includes(value) ? (value as ProjectsMode) : 'table';
}

/**
 * The Tasks view — Projects renamed, with the Issues view folded in. A picker
 * above the picked source's items, rendered as a table, a board or a graph.
 * The sources are the forge's own Project boards (still "boards" to the forge
 * contract — `ForgeProject*`) plus one built-in, always-present **Repo
 * issues** source (`repo-issues-source.ts`): the repo's issue list, state
 * `all`, so an issue on no board is still reachable. A repo with no board
 * picked opens on it. Every issue row, card and node wears the old Issues
 * list's extra pills (`IssuePills`), and its `#number` opens the app-wide
 * issue modal (`IssueModalHost`) instead of the forge page.
 *
 * Originally the Projects view (Phase 40 Theme D): a board picker above the
 * picked board's items, rendered as a table.
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
export function TasksView() {
  const { repoId, worktreePath } = useActiveWorktree();
  const boardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const setProjectBoard = useUiStore((s) => s.setProjectBoard);
  const modeByRepo = useUiStore((s) => s.projectsMode);
  const setProjectsMode = useUiStore((s) => s.setProjectsMode);
  const mode = coerceProjectsMode(repoId !== null ? modeByRepo[repoId] : undefined);

  /**
   * One selection for the whole view (Phase 75 Theme G) — lifted out of
   * `BoardView`'s own local `useState` (Theme D left graph mode's copy here
   * already; this consolidates both into the one piece of state). A card
   * opened in board mode and a node opened in graph mode are the same
   * panel, so switching modes keeps it open on the same item.
   */
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // Local state, not the persisted `layout` store its sibling panels use
  // (`filesTreeWidth` etc.) — deliberately: this width is shared between two
  // mount sites in the SAME component (Board mode's own and Graph mode's,
  // below), so one `useResizable` instance handed down as a prop already
  // keeps them in lockstep without a store round-trip. See `board-view.tsx`'s
  // own `cardPanelResizable` prop doc for the other half of this.
  const [cardPanelWidth, setCardPanelWidth] = useState(320);
  const cardPanelResizable = useResizable({
    size: cardPanelWidth,
    onSize: setCardPanelWidth,
    initial: 320,
    min: 260,
    max: 640,
    axis: 'x',
    edge: 'end',
    onCollapse: () => setSelectedItemId(null),
  });

  // Fetching starts only once this view is mounted, matching every other
  // forge read's `enabled` gate — see the phase doc's own acceptance test.
  const projects = useForgeProjects(repoId, true);
  const boards = projects.data?.projects ?? [];
  // Phase 84 Theme C: main's forge poller pings the board list — items/fields
  // are per-board rather than per-repo (see `queries.ts`'s own key comment)
  // and are not narrowed by this subscription.
  useForgeSubscription(repoId, 'projects');

  // The board picker groups boards linked to the open repo separately from
  // the rest of the owner's boards (org-wide or unrelated) — `linkedToRepo`
  // comes pre-computed off a second, narrower GraphQL read in `gh-project.ts`.
  // `useRemotes` is already the renderer's one source for a repo's forge
  // (`use-repo-actions.ts` reads it the same way) — no new IPC channel, and
  // react-query dedupes the fetch against any other consumer already open.
  const remotes = useRemotes(repoId);
  const forge = pickForgeRemote(remotes.data ?? [])?.forge ?? null;
  const forgeOwner = forge?.owner ?? null;
  /** For the wand's prompt only (`ProjectDialog`) — "owner/name", never a `repoId`. */
  const repoName = forge ? `${forge.owner}/${forge.repo}` : '';
  /*
    Phase 90 Theme H's own deferred item, unblocked now that a real adapter
    can report `projects: 'partial'` — GitLab's Issue Boards, mapped through
    one synthetic label-backed field rather than ProjectV2's typed custom
    fields (`forge-account.ts`'s own `GITLAB_CAPABILITY` docblock). Shown once
    in the header, not per-column: the limit is a property of the board's
    data model, not of any one item in it.
  */
  const { capability } = useActiveForgeCapability(repoId);

  // The Repo issues source, and the issue pills on every other source's
  // items — the Issues view's own read (`state: 'all'`, 50) and its Phase 84
  // forge subscription, which moved here with it.
  const repoIssues = useForgeIssues(repoId, repoId !== null && capability?.issues !== 'none', 50, 'all');
  useForgeSubscription(repoId, 'issues');
  const repoIssueRows = repoIssues.data?.issues ?? NO_ISSUES;
  const issuesByNumber = useMemo(
    () => new Map<number, ForgeIssue>(repoIssueRows.map((issue) => [issue.number, issue])),
    [repoIssueRows],
  );
  const repoIssueItems = useMemo(() => repoIssuesAsItems(repoIssueRows, repoName), [repoIssueRows, repoName]);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const addProjectItem = useAddProjectItem();
  const addToast = useToastStore((s) => s.addToast);

  const repoBoards = boards.filter((b) => b.linkedToRepo);
  const ownerBoards = boards.filter((b) => !b.linkedToRepo);

  // Phase 95 Theme E — create/edit/delete, sharing one dialog mount rather
  // than two: `null` is closed, the mode carries which of the two it is.
  const [projectDialogMode, setProjectDialogMode] = useState<ProjectDialogMode | null>(null);

  // No board picked yet opens on Repo issues — the one source every repo has.
  const selectedProjectId = repoId !== null ? (boardByRepo[repoId] ?? REPO_ISSUES_SOURCE_ID) : null;
  const onRepoIssues = isRepoIssuesSource(selectedProjectId);
  /** The picked forge board, or `null` on Repo issues — what every board read and write keys on. */
  const boardId = onRepoIssues ? null : selectedProjectId;
  const cascade = useCascadeReveal({
    revealKey: `${repoId}:${selectedProjectId ?? ''}`,
  });
  // One subscription for the whole canvas (Theme F) — a hook, so it is
  // called unconditionally here rather than only while `mode === 'graph'`.
  const graphAgentStates = useGraphAgentStates(selectedProjectId ?? '');
  const boardStillExists = boardId !== null && boards.some((b) => b.id === boardId);

  const fieldsQuery = useForgeProjectFields(boardId, boardId !== null);
  const itemsQuery = useForgeProjectItems(boardId, boardId !== null);

  const view =
    useUiStore((s) => (selectedProjectId ? s.projectViewByProject[selectedProjectId] : undefined)) ??
    DEFAULT_PROJECT_VIEW;
  const setProjectView = useUiStore((s) => s.setProjectView);
  // A rehydrated `ProjectViewState` from before this theme has no `graph` at
  // all (Theme H's own `ui-store.ts` note) — defaulted here, at the point of
  // use, rather than relying on `DEFAULT_PROJECT_VIEW`'s own shape, since
  // `projectViewByProject`'s persisted merge is per-project-id, not per-field.
  const graphFacets: ProjectGraphFacets = view.graph ?? DEFAULT_GRAPH_FACETS;
  // The dependency graph's `field` layer (Phase 75 Theme H) — a global
  // preference, not per-project, so it lives on its own top-level slice.
  const blockedByFieldName = useUiStore((s) => s.blockedByFieldName);
  // One dependency graph for every mode, hoisted above the conditional
  // returns so it can be memoised. Read by `ProjectGraphView` (its own
  // `graph`), by the selected item's Start-blocking `blockers` (Theme G), and
  // — through `blockedItemIds` — by all three views' blocked status stroke,
  // so Board, Graph and List agree on which task is waiting. Reads the
  // *whole* board (`allItems`, not `filteredItems` — Theme H): a blocker the
  // shared toolbar filter hid vanishes with the item that named it instead of
  // resolving as an indistinguishable foreign node, and `graph.truncated`
  // reflects the real board size rather than whatever the filter left.
  // `ProjectGraphView` narrows the result to what the filter and this
  // graph's own facets allow through, via `filterForgeGraph`.
  const graphItems = onRepoIssues ? repoIssueItems : (itemsQuery.data?.items ?? NO_ITEMS);
  const graphFields = onRepoIssues ? REPO_ISSUES_FIELDS : (fieldsQuery.data?.fields ?? NO_FIELDS);
  const graph = useMemo(
    () =>
      resolveForgeGraph(graphItems, graphFields, {
        // The renderer has no owner/repo string to hand this (adding one
        // is a new IPC channel, which the phase's own guardrails rule
        // out); the only effect is that an explicit same-repo
        // self-reference in a field/body value won't collapse with the
        // local item it actually names.
        boardRepo: '',
        blockedByFieldName,
      }),
    [graphItems, graphFields, blockedByFieldName],
  );
  const blockedIds = useMemo(() => blockedItemIds(graph), [graph]);
  // Hoisted above every conditional return — a hook cannot be called only on
  // the branch that happens to render Board mode.
  const collapsedColumns = useMemo(() => new Set(view.collapsedColumns), [view.collapsedColumns]);
  // Same reasoning, now that `ItemFilterToolbar`'s lift (Theme E) moved this
  // out of the old private `ProjectsToolbar`, which mounted only once
  // `dataReady` — a component, unlike a plain expression, cannot skip its
  // own hook call on the renders before that.
  const groupableColumns = useMemo(() => groupableFields(graphFields), [graphFields]);
  const scopeMissing =
    !onRepoIssues &&
    (projects.data?.kind === 'insufficient-scope' || itemsQuery.data?.kind === 'insufficient-scope');
  const [now] = useState(() => Date.now());
  const issueContext = useMemo(
    () => ({ issuesByNumber, repoId, repoName, showState: !onRepoIssues, now }),
    [issuesByNumber, repoId, repoName, onRepoIssues, now],
  );

  /*
    The board-list states below only ever describe the forge's boards, so
    they replace the body — never the header — and never while Repo issues is
    showing: the picker must stay reachable, or a missing `project` scope
    would strand an issue list that needs no such scope at all.
  */
  const boardProblem = onRepoIssues ? null : boardListProblem();
  function boardListProblem(): ReactNode {
    if (scopeMissing) return <MissingScopeState />;

    /*
      Error → empty → skeleton → content (`components/skeleton.tsx`), with the
      transport rung added in Phase 60 Theme C: `projects.data.error` is the
      envelope's own "gh said no", while `projects.isError` is the call never
      returning — which fell through to "No projects" and asserted something
      about the owner's account that this pane had not established.
    */
    if (projects.isError && projects.data === undefined) {
      return (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title="Could not reach the GitHub CLI"
          body={projects.error instanceof Error ? projects.error.message : String(projects.error)}
          action={
            <ReloadProjectsButton
              command={GH_DIAGNOSE_COMMAND}
              busy={projects.isFetching}
              onReload={() => void projects.refetch()}
            />
          }
        />
      );
    }

    if (projects.isLoading) return <BoardPickerSkeleton />;

    if (projects.data?.error) {
      return (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title="Could not load task boards"
          body={projects.data.error}
          action={
            <ReloadProjectsButton
              command={SCOPE_FIX_COMMAND}
              busy={projects.isFetching}
              onReload={() => void projects.refetch()}
            />
          }
        />
      );
    }

    if (boards.length === 0) {
      return (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title="No task boards"
          body="This owner has no task boards, or none this token can see. Repo issues, in the picker above, lists this repository's issues."
          action={
            <ReloadProjectsButton
              command={SCOPE_FIX_COMMAND}
              busy={projects.isFetching}
              onReload={() => void projects.refetch()}
            />
          }
        />
      );
    }
    return null;
  }

  const allFields = graphFields;
  const allItems = graphItems;
  const filteredItems = filterProjectItems(allItems, view.filter);
  // Extended (Theme H): a graph facet left non-default is exactly as much a
  // filter as the shared toolbar's own, so it feeds the same indicator.
  const filterActive = !isProjectItemFilterEmpty(view.filter) || !isDefaultGraphFacets(graphFacets);
  const repoIssuesProblem = onRepoIssues ? repoIssuesProblemText(repoIssues.data, repoIssues.error) : null;
  const itemsLoading = onRepoIssues ? repoIssues.isLoading : itemsQuery.isLoading || fieldsQuery.isLoading;
  const itemsError = onRepoIssues ? repoIssuesProblem : (itemsQuery.data?.error ?? null);
  const dataReady = selectedProjectId !== null && boardProblem === null && !itemsLoading && !itemsError;

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
  /**
   * `setProjectView` shallow-merges (`ui-store.ts`) — a patch must carry the
   * whole `graph` object or the other three facets silently drop. Every
   * facet control below goes through this rather than building its own
   * partial patch.
   */
  const setGraphFacets = (patch: Partial<ProjectGraphFacets>): void => {
    if (selectedProjectId) setProjectView(selectedProjectId, { graph: { ...graphFacets, ...patch } });
  };

  const groupField = mode === 'board' ? resolveGroupField(allFields, view.groupFieldId) : null;

  /** A new issue lands on the open board too, when one is picked — the whole reason to make it from here. */
  const onIssueCreated = (issue: ForgeIssue): void => {
    if (boardId === null || issue.id === '') return;
    addProjectItem.mutate(
      { projectId: boardId, contentId: issue.id },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            addToast({
              status: 'error',
              message: `Created #${issue.number}, but could not add it to the board: ${
                result.kind === 'insufficient-scope' ? result.hint : result.message
              }`,
            });
          }
        },
      },
    );
  };

  return (
    <TaskIssueProvider value={issueContext}>
    <div className="flex h-full min-h-0 flex-col" data-testid="projects-view">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <PageDetachMark role="tasks" />
        <h2 className="mr-auto text-sm font-semibold tracking-tight">Tasks</h2>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Source</span>
          <select
            aria-label="Task source"
            value={onRepoIssues ? REPO_ISSUES_SOURCE_ID : boardStillExists ? (selectedProjectId ?? '') : ''}
            onChange={(event) => {
              if (repoId && event.target.value) setProjectBoard(repoId, event.target.value);
            }}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
          >
            <option value="" disabled>
              Pick a task board…
            </option>
            {/* Always offered, whatever the forge's boards say — see `repo-issues-source.ts`. */}
            <optgroup label="Built in">
              <option value={REPO_ISSUES_SOURCE_ID}>Repo issues</option>
            </optgroup>
            {repoBoards.length > 0 && (
              <optgroup label="This repo">
                {repoBoards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title}
                    {board.closed ? ' (closed)' : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {ownerBoards.length > 0 && (
              <optgroup label={forgeOwner ? `Organization: ${forgeOwner}` : 'Organization'}>
                {ownerBoards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title}
                    {board.closed ? ' (closed)' : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {repoId !== null && capability?.ops.createIssue ? (
          <PlanWithAiBar
            repoId={repoId}
            repoName={repoName}
            worktreePath={worktreePath}
            origin={{ kind: 'project', capability, defaultProjectId: boardId }}
          />
        ) : null}

        {repoId !== null && capability?.ops.createIssue ? (
          <IconButton
            icon={LuFilePlus2}
            label={boardId !== null ? 'New issue on this board' : 'New issue'}
            size="sm"
            onClick={() => setCreatingIssue(true)}
          />
        ) : null}

        {capability?.ops.createProject ? (
          <IconButton
            icon={LuPlus}
            label="New task board"
            size="sm"
            onClick={() => setProjectDialogMode({ kind: 'create' })}
          />
        ) : null}
        {boardStillExists && (capability?.ops.editProject || capability?.ops.deleteProject) ? (
          <IconButton
            icon={LuPencil}
            label="Edit task board"
            size="sm"
            onClick={() => {
              const board = boards.find((b) => b.id === boardId);
              if (!board) return;
              setProjectDialogMode({
                kind: 'edit',
                projectId: board.id,
                title: board.title,
                closed: board.closed,
                itemCount: allItems.length,
              });
            }}
          />
        ) : null}

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
              { id: 'graph', label: 'Graph view', icon: LuWorkflow },
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

      {!onRepoIssues && capability?.projects === 'partial' ? (
        <p
          data-testid="projects-partial-capability-note"
          className="shrink-0 border-b border-border bg-muted/30 px-4 py-1.5 text-[11px] leading-relaxed text-muted-foreground"
        >
          This board mirrors GitLab Issue Boards through one synthetic label-backed field, not
          ProjectV2&rsquo;s typed custom fields — grouping works, but per-field types and Epics
          (GitLab Premium) aren&rsquo;t available.
        </p>
      ) : null}

      {dataReady ? (
        <ItemFilterToolbar
          items={allItems}
          select={selectProjectItem}
          filter={view.filter}
          onFilterChange={setSharedFilter}
          stateOptions={onRepoIssues ? ISSUE_STATE_OPTIONS : STATE_OPTIONS}
        >
          {/* Repo issues holds nothing but issues — a type facet would have one answer. */}
          {onRepoIssues ? null : (
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
          )}

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

          {/*
            Graph-only facets (Theme H) — same reasoning as the Group-by
            picker above: how you are looking at the graph, not which board.
            `ItemFilterToolbar` itself stays untouched; every mode-specific
            addition renders as its own `children`.
          */}
          {mode === 'graph' ? (
            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={graphFacets.showContains}
                  onChange={(event) => setGraphFacets({ showContains: event.target.checked })}
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                />
                Show sub-issues
              </label>

              <label className="flex items-center gap-1.5">
                <span>Show</span>
                <select
                  aria-label="Show"
                  value={graphFacets.only}
                  onChange={(event) => setGraphFacets({ only: event.target.value as ProjectGraphFacets['only'] })}
                  className="rounded border border-border bg-background px-1.5 py-1 text-xs"
                >
                  <option value="all">All</option>
                  <option value="blocked">Blocked only</option>
                  <option value="ready">Ready only</option>
                </select>
              </label>

              <label
                className="flex items-center gap-1.5"
                title={selectedItemId === null ? 'Select a node first' : undefined}
              >
                <span>Depth</span>
                <select
                  aria-label="Depth from selection"
                  value={graphFacets.depth}
                  disabled={selectedItemId === null}
                  onChange={(event) =>
                    setGraphFacets({ depth: Number(event.target.value) as ProjectGraphFacets['depth'] })
                  }
                  className="rounded border border-border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
                >
                  <option value={0}>Off</option>
                  <option value={1}>1 hop</option>
                  <option value={2}>2 hops</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={graphFacets.hideIsolated}
                  onChange={(event) => setGraphFacets({ hideIsolated: event.target.checked })}
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                />
                Hide isolated
              </label>
            </div>
          ) : null}

          {filterActive ? (
            <span
              data-testid="projects-filter-active-indicator"
              className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              Filtered
            </span>
          ) : null}
        </ItemFilterToolbar>
      ) : null}

      {boardProblem !== null ? (
        boardProblem
      ) : selectedProjectId === null ? (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title="Pick a task board"
          body="Choose a source above to see its tasks."
        />
      ) : itemsLoading ? (
        <ItemsSkeleton />
      ) : itemsError ? (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title={onRepoIssues ? 'Could not load issues' : 'Could not load tasks'}
          body={itemsError}
        />
      ) : mode === 'board' ? (
        <BoardView
          readOnlyReason={onRepoIssues ? REPO_ISSUES_READ_ONLY : undefined}
          projectId={selectedProjectId}
          repoId={repoId}
          worktreePath={worktreePath}
          items={filteredItems}
          allItems={allItems}
          blockedByFieldName={blockedByFieldName}
          blockedItemIds={blockedIds}
          fields={allFields}
          groupField={groupField}
          collapsedColumns={collapsedColumns}
          onToggleColumn={toggleColumn}
          onExpandColumn={expandColumn}
          selectedItemId={selectedItemId}
          onSelectItem={setSelectedItemId}
          cardPanelResizable={cardPanelResizable}
        />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title={onRepoIssues ? 'No issues' : 'No tasks'}
          body={onRepoIssues ? 'This repository has no issues yet.' : 'This board has no tasks yet.'}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={VIEW_ICON.tasks}
          title="Nothing matches"
          body="No tasks match the current filter."
        />
      ) : mode === 'graph' ? (
        <div className="flex min-h-0 flex-1">
          <ProjectGraphView
            // The whole-board graph, computed above — `items={filteredItems}`
            // is what tells `ProjectGraphView` which of its nodes survived
            // the shared toolbar filter; the component itself narrows
            // `graph` down to that plus its own facets (Theme H).
            graph={graph}
            items={filteredItems}
            fields={allFields}
            projectId={selectedProjectId}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            agentStates={graphAgentStates}
            facets={graphFacets}
          />
          {/*
            The graph mounts `CardPanelStack` on the same terms
            `board-view.tsx` does — same `projectId`/`repoId`/`worktreePath`/
            `items`/`fields`, same sibling position — one panel component, two mount
            sites, never two panels that could disagree (Phase 75 Theme G). Both
            mounts share this same `cardPanelResizable` instance (Ad hoc), so the
            width dragged in one mode is exactly the width the other opens with.
          */}
          {selectedItemId ? (
            <>
              <ResizeHandle resizable={cardPanelResizable} axis="x" label="Resize task details" />
              <CardPanelStack
                projectId={selectedProjectId}
                repoId={repoId}
                worktreePath={worktreePath}
                items={filteredItems}
                fields={allFields}
                selectedItemId={selectedItemId}
                onSelectItem={setSelectedItemId}
                onClose={() => setSelectedItemId(null)}
                blockers={apiFieldBlockersFor(graph, selectedItemId)}
                style={{ width: cardPanelResizable.current }}
                className={cardPanelResizable.dragging ? '' : 'transition-[width] duration-150 ease-in-out'}
              />
            </>
          ) : null}
        </div>
      ) : (
        <ProjectItemsTable
          projectId={selectedProjectId}
          items={sortItems(filteredItems, allFields, view.sort)}
          fields={allFields}
          truncated={onRepoIssues ? false : (itemsQuery.data?.truncated ?? false)}
          filterActive={filterActive}
          sort={view.sort}
          onSortChange={(fieldId) => setSort(nextSortState(view.sort, fieldId))}
          cascading={cascade.active}
          cascadeStyleFor={cascade.styleFor}
          blockedItemIds={blockedIds}
          agentStates={graphAgentStates}
        />
      )}

      {repoId !== null && projectDialogMode ? (
        <ProjectDialog
          open
          onClose={() => setProjectDialogMode(null)}
          repoId={repoId}
          repoName={repoName}
          worktreePath={worktreePath}
          mode={projectDialogMode}
          onCreated={(projectId) => setProjectBoard(repoId, projectId)}
        />
      ) : null}

      {repoId !== null && creatingIssue ? (
        <IssueDialog
          open
          onClose={() => setCreatingIssue(false)}
          repoId={repoId}
          worktreePath={worktreePath}
          mode={{ kind: 'create' }}
          onCreated={onIssueCreated}
        />
      ) : null}
    </div>
    </TaskIssueProvider>
  );
}

const REPO_ISSUES_READ_ONLY =
  "Repo issues are grouped by their state — open an issue's #number to close or reopen it.";

/**
 * Why the Repo issues source has nothing to show, in the words the Issues
 * view used for the same three outcomes — or `null` when it has rows.
 */
function repoIssuesProblemText(
  data: { cli?: { reason: string; hint?: string }; disabled?: boolean; error?: string | null } | undefined,
  error: unknown,
): string | null {
  if (data === undefined) return error ? (error instanceof Error ? error.message : String(error)) : null;
  if (data.cli !== undefined && data.cli.reason !== 'ready') return data.cli.hint || 'The GitHub CLI is unavailable.';
  if (data.disabled) return 'Issues are turned off for this repository.';
  return data.error ?? null;
}

const TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'issue', label: 'Issues' },
  { value: 'pull', label: 'Pull requests' },
  { value: 'draft', label: 'Drafts' },
];

const ISSUE_STATE_OPTIONS: MultiSelectOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
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

const NO_ITEMS: ForgeProjectItem[] = [];
const NO_ISSUES: ForgeIssue[] = [];
const NO_BLOCKED_ITEMS: ReadonlySet<string> = new Set();
const NO_AGENT_STATES: ReadonlyMap<string, GraphNodeActivity> = new Map();
const NO_FIELDS: ForgeProjectField[] = [];

/**
 * A table row's title cell: the title — opening the issue modal for an issue
 * Tasks can resolve, the forge page otherwise — then the item's issue pills,
 * clipped by the cell before the title is, since the title is the row's name.
 * Its own component so `useOpenIssue` is not a hook called inside the
 * virtualizer's map.
 */
function RowTitle({ item, title, href }: { item: ForgeProjectItem; title: string; href: string | null }) {
  const openIssue = useOpenIssue(item);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pr-2">
      <span className="min-w-0 shrink truncate">
        {openIssue ? (
          <button
            type="button"
            data-open-issue={item.content.type === 'draft' ? undefined : item.content.number}
            onClick={openIssue}
            className="max-w-full truncate text-left hover:underline"
          >
            {title}
          </button>
        ) : href ? (
          <ExternalLink href={href}>{title}</ExternalLink>
        ) : (
          title
        )}
      </span>
      <IssuePills item={item} density="row" />
    </span>
  );
}

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
  cascading,
  cascadeStyleFor,
  blockedItemIds = NO_BLOCKED_ITEMS,
  agentStates = NO_AGENT_STATES,
}: {
  projectId: string;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  truncated: boolean;
  filterActive: boolean;
  sort: SortState;
  onSortChange: (fieldId: string) => void;
  cascading?: boolean;
  cascadeStyleFor?: (index: number) => CSSProperties;
  /** `blockedItemIds(graph)` — rows whose status rule holds still and fades. */
  blockedItemIds?: ReadonlySet<string>;
  /** The same `useGraphAgentStates` map the graph reads — a row's AI glow. */
  agentStates?: ReadonlyMap<string, GraphNodeActivity>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusField = useMemo(() => findStatusField(fields), [fields]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="project-items-table">
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
            const isInitialCascade = cascading && virtualRow.index < CASCADE_MAX_STEPS;
            const statusStroke = itemStatusStroke(item, statusField, blockedItemIds.has(item.id));
            const rowActivity = agentStates.get(item.id);
            const glow = rowActivity?.glow ?? 'idle';
            // Same precedence as a board card: a live glow wins over the
            // status stroke, and the stroke shows once the row is idle.
            const showStatusRule = glow === 'idle' && statusStroke !== null;

            return (
              <div
                key={item.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-project-row={item.id}
                data-status-kind={statusStroke?.kind}
                data-blocked={statusStroke?.blocked ? '' : undefined}
                // A glowing row's 3px ring takes the place of 3px of its
                // padding, so the row's text does not jump when a glow starts.
                className={`absolute left-0 top-0 flex w-full items-center border-b border-border/60 text-xs ${
                  isInitialCascade ? 'animate-fade-in-up cascade-delay' : ''
                } ${glow === 'idle' ? 'px-3' : `rounded px-[9px] ${taskGlowClass(glow)}`}`}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: ROW_HEIGHT,
                  ...(isInitialCascade ? cascadeStyleFor?.(virtualRow.index) : undefined),
                }}
              >
                {showStatusRule && statusStroke ? <StatusRule stroke={statusStroke} /> : null}
                <span className="w-6 shrink-0">
                  <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                {/* The same agent avatar a card and a graph node wear — the terminal list's own. */}
                {rowActivity && rowActivity.badges.length > 0 ? (
                  <ActivityBadgeStack badges={rowActivity.badges} className="mr-1.5 shrink-0" />
                ) : null}
                <RowTitle item={item} title={title} href={href} />
                <span className="flex w-40 shrink-0 items-center gap-1.5 truncate text-muted-foreground">
                  {item.content.assignees.length > 0 ? (
                    <span className="flex -space-x-1 shrink-0">
                      {item.content.assignees.map((login) => (
                        <UserAvatar
                          key={login}
                          login={login}
                          size={16}
                          className="border border-background"
                          detail="Assignee"
                        />
                      ))}
                    </span>
                  ) : null}
                  <span className="truncate">{item.content.assignees.join(', ')}</span>
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
 * What the transport-error state's Reload runs instead. That state means the
 * `forgeProject.list` call itself never answered — not that gh refused — so
 * re-authorising is a guess; `gh auth status` is side-effect-free and shows,
 * in the terminal, whether gh is installed and signed in at all.
 */
const GH_DIAGNOSE_COMMAND = 'gh auth status';

/**
 * Re-probe cadence after Reload. `gh auth refresh` is gh's interactive
 * browser/device-code flow, so its completion time is the user's, not the
 * shell's — and a shell session gives no "command finished" signal to key
 * off. A bounded poll (~2 min) is the same shape the Health page's Start
 * Ollama button uses, just stretched to fit a browser round trip. It stops
 * early for free: once the list comes back non-empty this button unmounts,
 * and the effect cleanup below clears the interval.
 */
const RELOAD_REPROBE_ATTEMPTS = 24;
const RELOAD_REPROBE_INTERVAL_MS = 5000;

/**
 * Reload for the board list's empty and error states: runs `command` in the
 * integrated terminal (the shared `submitCommand` primitive), refetches
 * immediately, then keeps refetching on the bounded cadence above so the
 * view picks up the refreshed token without the user having to come back
 * and click again.
 */
function ReloadProjectsButton({
  command,
  busy,
  onReload,
}: {
  command: string;
  busy: boolean;
  onReload: () => void;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The interval outlives the render that started it, so it calls through a
  // ref rather than capturing whichever `onReload` closure was current then.
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  const stop = (): void => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const reload = (): void => {
    submitCommand(command, 'gh');
    onReloadRef.current();
    stop();
    let attempts = 0;
    timer.current = setInterval(() => {
      attempts += 1;
      onReloadRef.current();
      if (attempts >= RELOAD_REPROBE_ATTEMPTS) stop();
    }, RELOAD_REPROBE_INTERVAL_MS);
  };

  return (
    <button
      type="button"
      onClick={reload}
      disabled={busy}
      title={`Runs \`${command}\` in the terminal, then reloads`}
      className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
    >
      <LuRefreshCw aria-hidden className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
      Reload
    </button>
  );
}

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
      <VIEW_ICON.tasks aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-medium">Tasks needs one more permission</p>
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

/**
 * The board picker, at rest — a row of pill-shaped board tabs, which is what
 * the header paints once `gh project list` answers. Prose ("Loading
 * projects…") used to stand here; a skeleton keeps the layout the header is
 * about to take (`components/skeleton.tsx`).
 */
function BoardPickerSkeleton() {
  return (
    <LoadingRegion label="Asking GitHub for this owner's task boards…" className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        {['w-28', 'w-20', 'w-24'].map((width) => (
          <Skeleton key={width} className={`h-6 rounded-full ${width}`} />
        ))}
      </div>
      <ItemsSkeletonRows />
    </LoadingRegion>
  );
}

/**
 * The item table, at rest — a header strip and a run of rows, the shape both
 * `ProjectItemsTable` and `BoardView` resolve into.
 */
function ItemsSkeleton() {
  return (
    <LoadingRegion label="Asking GitHub for this board's items…" className="flex flex-col gap-2 p-4">
      <ItemsSkeletonRows />
    </LoadingRegion>
  );
}

const ITEM_SKELETON_WIDTHS: readonly string[] = ['64%', '48%', '72%', '40%', '58%', '52%', '66%'];

function ItemsSkeletonRows() {
  return (
    <>
      {ITEM_SKELETON_WIDTHS.map((width, index) => (
        <div key={width} className="flex items-center gap-3">
          <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
          <Skeleton className="h-3 min-w-0 flex-1" style={{ maxWidth: width }} />
          <Skeleton className="h-3 w-16 shrink-0" />
          <Skeleton className={`h-3 shrink-0 ${index % 2 === 0 ? 'w-10' : 'w-14'}`} />
        </div>
      ))}
    </>
  );
}
