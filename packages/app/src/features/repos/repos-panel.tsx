import { useMemo, useState } from 'react';

import type { Ref, Remote, RepoDescriptor, StatusResult, Worktree } from '@midnite/git-shared';
import { forgeProjectUrl } from '@midnite/git-shared';
import {
  ArrowRightLeft,
  ChevronRight,
  Cloud,
  FolderCheck,
  FolderGit2,
  FolderPlus,
  FolderX,
  GitBranch,
  GripVertical,
  ListFilter,
  MoreVertical,
  SquareArrowOutUpRight,
  Tag,
} from 'lucide-react';
import { AiOutlineDiff } from 'react-icons/ai';

import type { MenuItem } from '../../components/context-menu';
import { ChangeCountPill } from '../../components/change-count-pill';
import { bridge } from '../../services/bridge';
import { SortableList, useSortableRow } from '../../components/sortable-list';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';
import { TreeSection } from '../../components/tree-section';
import { cascadeStyle } from '../../lib/cascade';
import {
  openExternal,
  usePickAndOpenRepo,
  useForgeRuns,
  useRefs,
  useRemotes,
  useRepos,
} from '../../services/queries';
import {
  useRepoStatus,
  useWorktreeStatuses,
  type WorktreeStatuses,
} from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { SyncControls } from '../status/sync-controls';
import { BranchDot } from './branch-dot';
import { branchHealth, worktreeHealth, type BranchHealth } from './branch-health';
import { checksVerdict } from './checks-verdict';
import { ForgeSections } from './forge-sections';
import {
  useViewSections,
  type RefSectionKey,
  type SectionKey,
  type ViewSections,
} from './view-sections';
import { primaryTarget, useRepoActions } from './use-repo-actions';

/**
 * What the sidebar's narrowing toggle says it will do.
 *
 * Kept exact for the dirty-checkout case: "Showing only changed checkouts" is
 * the accessible name Phase 17's Changes filter shipped with, and it is what
 * the user has been reading since. The views that hide whole sections rather
 * than clean checkouts need their own wording — "showing only changed
 * checkouts" would be a lie in Actions — and `dirtyOnly` is what tells the two
 * apart, so the view id itself is never needed here.
 */
function sectionFilterLabel(sections: ViewSections): string {
  if (!sections.filtered) return 'Show every ref and checkout';
  return sections.dirtyOnly ? 'Showing only changed checkouts' : 'Show all sections';
}

/**
 * The repositories sidebar, modelled on VS Code's SCM view crossed with
 * GitKraken's ref tree.
 *
 * Each repository owns its labelled subsections — Local, Remotes, Tags,
 * Worktrees, and (for a GitHub remote) Actions and Reviews — because "which
 * ref", "which checkout" and "what does CI say" are different questions and the
 * app answers all of them. Every one of them folds independently: a repo with
 * two hundred tags and three worktrees is unusable if the tags cannot be got
 * out of the way. A linked worktree is nested under the repository that owns
 * it, never listed as a sibling: git treats every checkout as a worktree,
 * including the main one, so the list is uniform with the primary checkout
 * marked rather than special-cased.
 *
 * Selecting a worktree, not just a repo, is the point of the panel: staging,
 * committing and status are all per-checkout, so "which worktree" is the app's
 * primary context — and since Phase 17 every checkout carries its own change
 * count, so the tree answers "where did I leave off" without being opened.
 */
export function ReposPanel() {
  const { data: repos = [], isLoading } = useRepos();
  const { pickAndOpen, isPending } = usePickAndOpenRepo();
  const [error, setError] = useState<string | null>(null);
  const sections = useViewSections();

  const onOpen = async () => {
    setError(null);
    const result = await pickAndOpen();
    if (result && !result.ok) setError(result.message);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card/40">
      <header className="flex h-9 items-center gap-2 px-3">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Repositories
        </h2>
        {/*
          One toolbar cluster, not two controls spread by `justify-between`.
          The filter and "open a repository" are both things done TO the list,
          so they belong together at the trailing edge; floating the filter
          mid-header read as a third column of the title row.
        */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/*
            The narrowing is visible whenever it is on, and reversible from
            here. Arriving in a view to find two thirds of the tree missing is
            only acceptable if the thing that did it is on screen saying so — a
            hidden mode that eats rows is indistinguishable from data loss.

            The label names the STATE while narrowed and the ACTION while not,
            which is the pairing the Changes filter shipped with; the views that
            hide sections rather than checkouts get their own wording, because
            "showing only changed checkouts" would be a lie in Actions.
          */}
          <IconButton
            icon={ListFilter}
            label={sectionFilterLabel(sections)}
            aria-pressed={sections.filtered}
            size="sm"
            onClick={sections.toggle}
            /*
              NOTE: this tint does not currently read.

              `--primary` is a near-black in this theme (`240 5.9% 10%`), within
              a point of `--muted-foreground` on every channel, so the pressed
              icon computes to rgb(93,93,100) against a resting rgb(93,93,101).
              Tinted backgrounds fare no better — `bg-accent` and `bg-primary/10`
              both resolve to alpha ≈0.03 here. It is a token problem rather than
              a problem with this control, it predates Phase 19 (Phase 17 shipped
              the same line), and chasing it belongs with the appearance tokens,
              not in the nav shell.

              The STATE is not lost meanwhile: `aria-pressed` is correct, the
              label says which mode is on in words, and both are asserted by
              `nav-shell.spec.ts`.
            */
            className={sections.filtered ? 'text-primary' : ''}
          />
          <IconButton
            icon={FolderPlus}
            label="Open a repository…"
            size="sm"
            disabled={isPending}
            onClick={() => void onOpen()}
          />
        </div>
      </header>

      {error ? (
        <p className="mx-3 mb-2 animate-fade-in rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {isLoading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : repos.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            No repositories yet. <span className="text-foreground">Open</span> one to get started —
            a linked worktree works too, and nests under the repository that owns it.
          </p>
        ) : (
          /*
            Order is the user's, and it lives in `repos.json` alongside the
            repo list itself — not in localStorage. A drag reorders the
            registry's own Map, so clearing the browser store cannot leave the
            sidebar in an order the repo list disagrees with.
          */
          <SortableList
            ids={repos.map((repo) => repo.id)}
            onReorder={(repoIds) => bridge()?.repos.reorder({ repoIds })}
          >
            {repos.map((repo, index) => (
              <RepoItem
                key={repo.id}
                repo={repo}
                first={index === 0}
                index={index}
                sections={sections}
                // '' clears a stale message on the next successful op, so an
                // error from two operations ago cannot sit there looking current.
                onError={(message) => setError(message || null)}
              />
            ))}
          </SortableList>
        )}
      </div>
    </div>
  );
}

function RepoItem({
  repo,
  first,
  index,
  sections,
  onError,
}: {
  repo: RepoDescriptor;
  first: boolean;
  index: number;
  sections: ViewSections;
  onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const dialogs = useDialogs();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectRepo = useUiStore((s) => s.selectRepo);
  const drag = useSortableRow(repo.id);

  /**
   * Refs are fetched per repo, but only while it is expanded.
   *
   * `useRefs` runs one `for-each-ref` over heads, remotes and tags; doing that
   * eagerly for every open repository would cost a subprocess per repo on every
   * watcher invalidation, to populate a tree nobody has opened.
   */
  const { data: refs = [] } = useRefs(expanded ? repo.id : null);
  const { data: remotes = [] } = useRemotes(expanded ? repo.id : null);

  /**
   * Status, on the other hand, is fetched whether the repo is expanded or not:
   * the header's whole job is to answer "does this repo need a push?" without
   * being opened. It is the same query key the title bar uses for the same
   * checkout, so selecting the repo costs no second `git status`.
   *
   * `isPlaceholderData` is load-bearing. The placeholder is an EMPTY status —
   * no upstream, nothing ahead — and `syncAffordances` reads that as a branch
   * that has never been published, i.e. it would offer a live "Publish branch"
   * for a repository whose real state has not arrived yet.
   */
  const { data: status, isPlaceholderData } = useRepoStatus(primaryTarget(repo));
  const loaded = isPlaceholderData ? undefined : status;

  /**
   * Every checkout's status — one `git status` per worktree.
   *
   * Gated the same way refs are, with one exception that is the whole point of
   * the filter: in "changed only" mode the panel has to know each checkout's
   * count BEFORE it can decide whether to show the repository at all, so the
   * queries run for a folded repo too. That is the cost of the mode, and it is
   * bounded — `staleTime: Infinity` plus the watcher means each one is paid
   * once and refreshed only when the filesystem actually changes.
   */
  const statuses = useWorktreeStatuses(repo, expanded || sections.dirtyOnly);

  const changedByWorktree = useMemo(() => {
    const map = new Map<string, number>();
    for (const [path, result] of statuses.byPath) map.set(path, result.entries.length);
    return map;
  }, [statuses.byPath]);

  const actions = useRepoActions(repo, onError, { changedByWorktree, remotes });
  const { refMenu, repoMenu, worktreeMenu, sectionMenu, checkout, report, viewAllChanges } =
    actions;

  const openRepoMenu = (at: { clientX: number; clientY: number }) =>
    dialogs.openMenu(at, repoMenu(refs, loaded));

  /*
    A repo with nothing changed drops out of the filtered tree — but never
    while its counts are still arriving. Hiding on missing data would make the
    panel flicker repos out and back in on every refetch, and would hide a
    dirty checkout on the strength of a number that had not landed yet.
  */
  if (sections.dirtyOnly && !statuses.isLoading && statuses.total === 0) return null;

  return (
    <section
      ref={drag.setNodeRef}
      /*
        The drag transform has to win over the entrance animation's own
        transform, so the two are merged rather than one replacing the other —
        a row picked up mid-cascade would otherwise snap back to its start.
      */
      style={{ ...cascadeStyle(index), ...drag.style }}
      className={`animate-fade-in-up cascade-delay ${drag.isDragging ? 'opacity-80' : ''} ${
        // A delimiter between repositories, not above the first one — a rule at
        // the top of a list reads as a header separator that lost its header.
        //
        // No padding around the rule: the repo row and the tree below it carry
        // their own, and adding more here left the selected row's highlight
        // floating a few pixels clear of the delimiter above it.
        first ? '' : 'border-t border-border/60'
      }`}
    >
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          openRepoMenu(event);
        }}
        /*
          Fixed height for the same reason `TreeSection`'s heading has one: the
          sync cluster only renders once status has loaded, so a padded row
          grew by a few pixels the moment the first `git status` came back and
          every repo below it shifted down.
        */
        className={`group flex h-8 items-center gap-1 px-2 text-sm transition-colors ${
          selectedRepoId === repo.id ? 'bg-accent/60' : 'hover:bg-accent/30'
        }`}
      >
        {/*
          The drag handle, not the whole row — a repo row already carries three
          click targets (expand, select, the actions ellipsis), and dnd-kit's
          own attributes put a `role="button"` + keyboard handling on whatever
          they land on. Spread across the row those would have doubled up on
          the row's own semantics; here they own one small, purpose-built grip.
        */}
        <span
          {...drag.attributes}
          {...drag.listeners}
          aria-label={`Reorder ${repo.name}`}
          title="Drag to reorder"
          className="shrink-0 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="h-3.5 w-3.5" />
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground"
          aria-label={expanded ? `Collapse ${repo.name}` : `Expand ${repo.name}`}
          aria-expanded={expanded}
        >
          <ChevronRight
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform duration-150 ease-in-out ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        <Tooltip label={repo.path}>
          <button
            type="button"
            onClick={() => selectRepo(repo.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="truncate font-medium">{repo.name}</span>
            {/*
              Folded, the row has to stand in for the whole tree below it, so it
              carries the branch and the repository's TOTAL uncommitted count.
              Expanded, both are said better a few pixels down — the Local list
              names the branch and marks it with the live dot, and each worktree
              carries its own count — and at the 288px default repeating them
              here truncated the repository's own name to "midnite-…", which is
              the one string on the row that has to survive. `shrink-[6]` backs
              that up at narrower widths: the branch gives up its space six
              times faster than the name does.
            */}
            {expanded ? null : (
              /*
                Pushed to the trailing edge rather than trailing the name.
                Folded rows are scanned as a column: branch and count line up
                under each other and sit directly left of the sync control they
                explain, instead of starting at a different x on every row
                because repository names differ in length.
              */
              <span className="ml-auto flex min-w-0 shrink-[6] items-center gap-1.5">
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch aria-hidden className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {loaded?.branch.head ?? repo.headRef ?? 'detached'}
                  </span>
                </span>
                <ChangeCountPill count={statuses.total} what={repo.name} />
              </span>
            )}
          </button>
        </Tooltip>

        {/*
          The sync control, per repository. Syncing is a per-repo question, and
          answering it only for the selected one means opening each repo in turn
          to find out which needs attention. The counts stay visible at `↑0 ↓0`
          — "in sync" and "no upstream" must not look alike — and they now sit
          inside the button that acts on them.
        */}
        {loaded ? (
          <span className="flex shrink-0 items-center text-[11px]">
            <SyncControls
              target={primaryTarget(repo)}
              branch={loaded.branch}
              size="sm"
              onError={onError}
            />
          </span>
        ) : null}

        {/*
          One ellipsis rather than a row of per-repo buttons. The close action
          used to sit here as a bare X, which cost as much width as the sync
          cluster now uses and put the panel's only irreversible-looking control
          one stray click from the pointer's resting place.
        */}
        <IconButton
          icon={MoreVertical}
          label={`Actions for ${repo.name}`}
          size="sm"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            // A keyboard activation reports 0,0 — fall back to the button's own
            // box so the menu opens under the control rather than in the corner.
            openRepoMenu({
              clientX: event.clientX || rect.left,
              clientY: event.clientY || rect.bottom,
            });
          }}
        />
      </div>

      {expanded ? (
        <RepoTree
          repo={repo}
          refs={refs}
          remotes={remotes}
          statuses={statuses}
          sections={sections}
          refMenu={refMenu}
          worktreeMenu={worktreeMenu}
          sectionMenu={sectionMenu}
          onViewAllChanges={viewAllChanges}
          onCheckout={(ref) => void checkout.mutateAsync({ target: ref.name }).then(report)}
        />
      ) : null}
    </section>
  );
}

/** Beyond this a tag list stops being a list and becomes a wall. */
const TAG_PREVIEW = 50;

const SECTION_TITLE: Record<RefSectionKey, string> = {
  local: 'Local',
  remotes: 'Remotes',
  tags: 'Tags',
  worktrees: 'Worktrees',
};

/**
 * Fold state for a repo's subsections.
 *
 * Held as the set of *closed* sections so a section defaults to open without
 * having to be listed — a repo the user just opened should show its tree, and
 * a section they folded away should stay folded while the repo stays expanded.
 */
function useSectionToggles() {
  const [closed, setClosed] = useState<ReadonlySet<SectionKey>>(() => new Set());

  return (key: SectionKey) => ({
    collapsible: true,
    open: !closed.has(key),
    onToggle: () =>
      setClosed((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
  });
}

function RepoTree({
  repo,
  refs,
  remotes,
  statuses,
  sections,
  refMenu,
  worktreeMenu,
  sectionMenu,
  onViewAllChanges,
  onCheckout,
}: {
  repo: RepoDescriptor;
  refs: Ref[];
  remotes: Remote[];
  statuses: WorktreeStatuses;
  sections: ViewSections;
  refMenu: (ref: Ref) => MenuItem[];
  worktreeMenu: (worktree: Worktree) => MenuItem[];
  sectionMenu: (kind: RefSectionKey, refs: readonly Ref[]) => MenuItem[];
  onViewAllChanges: (worktreePath: string, label: string) => void;
  onCheckout: (ref: Ref) => void;
}) {
  const [showAllTags, setShowAllTags] = useState(false);
  const section = useSectionToggles();
  const dialogs = useDialogs();

  const { branches, remotes: remoteGroups, tags } = useMemo(() => partitionRefs(refs), [refs]);

  const forgeByName = useMemo(
    () => new Map(remotes.map((remote: Remote) => [remote.name, remote.forge])),
    [remotes],
  );

  // The main worktree is listed alongside the linked ones: git models it as a
  // worktree too, so the list is uniform with the primary checkout flagged.
  const worktrees = useMemo(
    () => [...repo.worktrees].sort((a, b) => Number(b.isMain) - Number(a.isMain)),
    [repo.worktrees],
  );

  /**
   * CI verdicts for the branch dots — from cache only, never fetched for.
   *
   * `enabled: false` is doing real work here. It closes the loop
   * `todo/outstanding.md` left open ("Branch checks — the RAG dot's real
   * source") without paying for it: if the user has opened Actions on this
   * repo, the runs are already in the query cache and every branch tip that
   * matches one gets a real red/amber/green. If they have not, this fetches
   * nothing, `runs` is undefined, and every branch reports `unknown` and shows
   * no dot — which is the behaviour the dot was designed around. A green dot
   * meaning "no data" is worse than no dot; a `gh` subprocess per repo just to
   * colour a 6px circle is worse than both.
   */
  const { data: cachedRuns } = useForgeRuns(repo.id, false);

  const changedOf = (path: string): number => statuses.byPath.get(path)?.entries.length ?? 0;
  const conflictedOf = (path: string): number =>
    statuses.byPath.get(path)?.entries.filter((entry) => entry.conflicted).length ?? 0;

  /*
    In filter mode the tree shows only what the mode is about. Local, Remotes,
    Tags, Actions and Reviews are all answers to questions the Changes view is
    not asking, and leaving them in place would mean the filter had removed
    repositories while keeping two hundred tags.
  */
  const visibleWorktrees = sections.dirtyOnly
    ? worktrees.filter((worktree) => changedOf(worktree.path) > 0)
    : worktrees;

  const visibleTags = showAllTags ? tags : tags.slice(0, TAG_PREVIEW);

  /** One builder for both affordances, so right-click and the ellipsis agree. */
  const headingAction = (kind: RefSectionKey, count: number) => ({
    icon: MoreVertical,
    label: `${SECTION_TITLE[kind]} section actions`,
    onClick: () => {
      const items = sectionMenu(kind, refs);
      if (items.length === 0) return;
      dialogs.openMenu(lastPointer(), items);
    },
    count,
  });

  return (
    <div className="pb-1">
      {/*
        Each section asks the view table for itself. One gate over the whole
        group would be smaller, but the Actions view wants Worktrees without
        Local and the Changes view wants neither — the sections are independent
        answers and have to be filtered as such.
      */}
      {sections.visible('local') ? (
        /*
          "Local", not "Branches": the section below it is remote branches too,
          and a heading that only says "Branches" leaves the reader to work out
          which of the two they are looking at.
        */
        <TreeSection
          title="Local"
          count={branches.length}
          depth={1}
          {...section('local')}
          action={headingAction('local', branches.length)}
        >
          {branches.map((ref, i) => (
            <RefRow
              key={ref.fullName}
              refItem={ref}
              icon={GitBranch}
              index={i}
              health={branchHealth({
                ref,
                status: liveStatus(ref, statuses, repo),
                checks: checksVerdict(cachedRuns?.runs, ref.sha),
              })}
              changed={ref.worktreePath ? changedOf(ref.worktreePath) : 0}
              conflicted={ref.worktreePath ? conflictedOf(ref.worktreePath) : 0}
              menu={refMenu}
              onCheckout={onCheckout}
              onViewAllChanges={onViewAllChanges}
            />
          ))}
        </TreeSection>
      ) : null}

      {sections.visible('remotes') ? (
        <TreeSection
          title="Remotes"
          count={remoteGroups.length}
          depth={1}
          {...section('remotes')}
          action={headingAction('remotes', remoteGroups.length)}
        >
          {remoteGroups.map((group) => (
            <RemoteGroup
              key={group.name}
              name={group.name}
              refs={group.refs}
              forge={forgeByName.get(group.name) ?? null}
              menu={refMenu}
            />
          ))}
        </TreeSection>
      ) : null}

      {sections.visible('tags') ? (
        <TreeSection
          title="Tags"
          count={tags.length}
          depth={1}
          {...section('tags')}
          action={
            tags.length > TAG_PREVIEW
              ? {
                  label: showAllTags ? 'Show fewer' : `Show all ${tags.length}`,
                  onClick: () => setShowAllTags((v) => !v),
                }
              : undefined
          }
        >
          {visibleTags.map((ref, i) => (
            <RefRow key={ref.fullName} refItem={ref} icon={Tag} index={i} menu={refMenu} />
          ))}
        </TreeSection>
      ) : null}

      {sections.visible('worktrees') ? (
        <TreeSection
          title="Worktrees"
          count={visibleWorktrees.length}
          depth={1}
          {...section('worktrees')}
          action={headingAction('worktrees', visibleWorktrees.length)}
        >
          {visibleWorktrees.map((worktree, i) => (
            <WorktreeRow
              key={worktree.id}
              repo={repo}
              worktree={worktree}
              index={i}
              // Every checkout now speaks for itself. This used to be
              // `isMain`-only — the primary's status was the only one fetched,
              // so attributing it to a linked worktree would have reported the
              // wrong directory's dirt. The invariant survives; the data caught
              // up.
              health={worktreeHealth(statuses.byPath.get(worktree.path))}
              changed={changedOf(worktree.path)}
              conflicted={conflictedOf(worktree.path)}
              menu={worktreeMenu}
              onViewAllChanges={onViewAllChanges}
            />
          ))}
        </TreeSection>
      ) : null}

      <ForgeSections
        repoId={repo.id}
        remotes={remotes}
        index={worktrees.length}
        visible={sections.visible}
      />
    </div>
  );
}

/**
 * The status of the checkout a branch is actually live in.
 *
 * The rule this preserves: only a checkout's OWN status may speak for it.
 * `branchHealth` would happily fold the primary checkout's dirt into a branch
 * living in another worktree, and the row would then report a directory the
 * user is not looking at.
 */
function liveStatus(
  ref: Ref,
  statuses: WorktreeStatuses,
  repo: RepoDescriptor,
): StatusResult | undefined {
  if (ref.worktreePath) return statuses.byPath.get(ref.worktreePath);
  if (!ref.isHead) return undefined;
  const main = repo.worktrees.find((worktree) => worktree.isMain);
  return main ? statuses.byPath.get(main.path) : undefined;
}

/**
 * Where the last pointer event landed, for a menu opened from a heading.
 *
 * `TreeSection`'s `action` is a bare `onClick: () => void` — it never sees the
 * event — and widening that prop for one caller would push a menu concern into
 * a layout primitive that four other places use. Tracking the pointer is the
 * smaller intrusion, and it degrades correctly: a keyboard activation with no
 * prior pointer opens the menu at the top-left rather than nowhere.
 */
let pointer = { clientX: 0, clientY: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (event) => {
      pointer = { clientX: event.clientX, clientY: event.clientY };
    },
    true,
  );
}
const lastPointer = () => pointer;

/**
 * One remote's branches, with a link out to the project when we can build one.
 *
 * The button is absent rather than disabled for a remote we cannot resolve — a
 * local-path remote or an unrecognised host. A disabled control implies the
 * action exists and is currently unavailable; here there is simply no web page
 * to open, and that is permanent for that remote.
 */
function RemoteGroup({
  name,
  refs,
  forge,
  menu,
}: {
  name: string;
  refs: Ref[];
  forge: Remote['forge'];
  menu: (ref: Ref) => MenuItem[];
}) {
  const [open, setOpen] = useState(true);
  const projectUrl = forge ? forgeProjectUrl(forge) : null;

  return (
    <TreeSection
      title={name}
      count={refs.length}
      icon={<Cloud aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={2}
      action={
        projectUrl === null || forge === null
          ? undefined
          : {
              icon: SquareArrowOutUpRight,
              label: `Open ${forge.owner}/${forge.repo} on ${forge.host}`,
              onClick: () => openExternal(projectUrl),
            }
      }
    >
      {refs.map((ref, i) => (
        <RefRow key={ref.fullName} refItem={ref} icon={GitBranch} index={i} depth={2} menu={menu} />
      ))}
    </TreeSection>
  );
}

/**
 * One ref row — a branch, a remote branch, or a tag.
 *
 * Three affordances, deliberately overlapping: right-click and a hover ellipsis
 * open the same menu (a context menu alone is an affordance nobody finds), and
 * the two verbs worth a dedicated button get one — switching this repository's
 * primary checkout, and reading the whole checkout's diff.
 */
function RefRow({
  refItem,
  icon: Icon,
  index,
  depth = 1,
  health,
  changed = 0,
  conflicted = 0,
  menu,
  onCheckout,
  onViewAllChanges,
}: {
  refItem: Ref;
  icon: typeof GitBranch;
  index: number;
  depth?: number;
  health?: BranchHealth;
  changed?: number;
  conflicted?: number;
  menu: (ref: Ref) => MenuItem[];
  onCheckout?: (ref: Ref) => void;
  onViewAllChanges?: (worktreePath: string, label: string) => void;
}) {
  const dialogs = useDialogs();
  const ahead = refItem.upstream?.ahead ?? 0;
  const behind = refItem.upstream?.behind ?? 0;

  // Checked out somewhere else: git refuses to check the same branch out twice,
  // so the row says why rather than looking merely inert.
  const elsewhere = refItem.worktreePath !== null && !refItem.isHead;
  const switchable =
    onCheckout !== undefined && refItem.kind === 'localBranch' && !refItem.isHead && !elsewhere;

  // The dot is the checked-out marker first and a health readout second, so a
  // branch nobody knows anything about shows nothing at all rather than a
  // fourth, meaningless colour on every row.
  const dot = health && (refItem.isHead || health.level !== 'unknown') ? health : null;

  const openMenu = (at: { clientX: number; clientY: number }) =>
    dialogs.openMenu(at, menu(refItem));

  // "Actions for main" is ambiguous the moment a worktree is also called main
  // — which is the common case, not an edge one.
  const kindWord = refItem.kind === 'tag' ? 'tag' : 'branch';

  const row = (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(event);
      }}
      style={cascadeStyle(index)}
      className={`group flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pr-2 text-[13px] transition-colors hover:bg-accent/30 ${
        depth === 2 ? 'pl-12' : 'pl-8'
      } ${elsewhere ? 'text-muted-foreground' : ''}`}
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{shortName(refItem)}</span>
      {dot ? (
        <BranchDot
          health={dot}
          what={refItem.isHead ? 'Primary checkout' : refItem.name}
          pulse={refItem.isHead}
        />
      ) : null}
      {refItem.upstream?.gone ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-destructive">gone</span>
      ) : null}
      <ChangeCountPill count={changed} conflicted={conflicted} what={refItem.name} />

      {/*
        The counts sit right, and everything that only appears on hover shares
        that edge. `ml-auto` on the first of them is what pushes the group
        there without a spacer element.
      */}
      {ahead > 0 || behind > 0 ? (
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {ahead > 0 ? `↑${ahead}` : ''}
          {behind > 0 ? `↓${behind}` : ''}
        </span>
      ) : null}

      <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {onViewAllChanges && refItem.worktreePath ? (
          <IconButton
            icon={AiOutlineDiff}
            label={`View all changes in branch ${refItem.name}`}
            size="sm"
            onClick={() => onViewAllChanges(refItem.worktreePath!, refItem.name)}
          />
        ) : null}
        {switchable ? (
          <IconButton
            icon={ArrowRightLeft}
            label={`Switch primary checkout to ${refItem.name}`}
            size="sm"
            onClick={() => onCheckout?.(refItem)}
          />
        ) : null}
        <IconButton
          icon={MoreVertical}
          label={`Actions for ${kindWord} ${refItem.name}`}
          size="sm"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu({
              clientX: event.clientX || rect.left,
              clientY: event.clientY || rect.bottom,
            });
          }}
        />
      </span>
    </div>
  );

  return elsewhere ? (
    <Tooltip label={`Checked out in ${refItem.worktreePath}`}>{row}</Tooltip>
  ) : (
    row
  );
}

function WorktreeRow({
  repo,
  worktree,
  index,
  health,
  changed,
  conflicted,
  menu,
  onViewAllChanges,
}: {
  repo: RepoDescriptor;
  worktree: Worktree;
  index: number;
  health?: BranchHealth;
  changed: number;
  conflicted: number;
  menu: (worktree: Worktree) => MenuItem[];
  onViewAllChanges: (worktreePath: string, label: string) => void;
}) {
  const dialogs = useDialogs();
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectRepo = useUiStore((s) => s.selectRepo);
  const selectWorktree = useUiStore((s) => s.selectWorktree);

  const active = selectedRepoId === repo.id && selectedWorktreePath === worktree.path;
  const label = worktree.branch ?? 'detached';

  const onSelect = () => {
    if (selectedRepoId !== repo.id) selectRepo(repo.id);
    selectWorktree(worktree.path);
  };

  const openMenu = (at: { clientX: number; clientY: number }) =>
    dialogs.openMenu(at, menu(worktree));

  /**
   * A folder glyph, deliberately unlike the branch's `GitBranch`.
   *
   * A worktree is a directory on disk that happens to have a branch checked
   * out; a branch is a line of history. They were both `⑂` before, which made
   * the two halves of the tree read as one repeated list.
   */
  const Icon = worktree.prunable ? FolderX : worktree.isMain ? FolderCheck : FolderGit2;

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(event);
      }}
      style={cascadeStyle(index)}
      className={`group flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pl-8 pr-2 text-[13px] transition-colors ${
        active ? 'bg-accent/60' : 'hover:bg-accent/30'
      }`}
    >
      <Tooltip label={worktree.path}>
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Icon
            aria-hidden
            className={`h-3 w-3 shrink-0 ${
              worktree.prunable ? 'text-destructive' : 'text-muted-foreground'
            }`}
          />
          <span className="truncate">{label}</span>
          {/*
            No pulse here. The breathing dot marks the live checkout in the
            Local list; repeating it a few rows down would put two animations on
            one repository, drawing the eye to the least informative of them.
          */}
          {health && health.level !== 'unknown' ? (
            <BranchDot health={health} what={worktree.branch ?? worktree.path} />
          ) : null}
          <ChangeCountPill count={changed} conflicted={conflicted} what={label} />
          {worktree.isMain ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              main
            </span>
          ) : null}
          {worktree.prunable ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-destructive">
              missing
            </span>
          ) : null}
          {worktree.locked ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              locked
            </span>
          ) : null}
        </button>
      </Tooltip>

      {/*
        The bare `X` that used to live here is gone, and with it the inline
        "Remove / Cancel" swap it opened. Removal now goes through the shared
        confirm dialog: it can say how many uncommitted changes are at stake
        BEFORE the click, which two unlabelled buttons appearing in a 20px-tall
        row cannot.
      */}
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          icon={AiOutlineDiff}
          label={`View all changes in worktree ${label}`}
          disabled={changed === 0}
          disabledReason="This checkout has no uncommitted changes."
          size="sm"
          onClick={() => onViewAllChanges(worktree.path, label)}
        />
        <IconButton
          icon={MoreVertical}
          label={`Actions for worktree ${label}`}
          size="sm"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu({
              clientX: event.clientX || rect.left,
              clientY: event.clientY || rect.bottom,
            });
          }}
        />
      </span>
    </div>
  );
}

/** `origin/feat/x` displays as `feat/x` under its `origin` group. */
const shortName = (ref: Ref): string =>
  ref.kind === 'remoteBranch' ? ref.name.slice(ref.name.indexOf('/') + 1) : ref.name;

/**
 * Split a repo's refs into the tree's three ref sections.
 *
 * Remote branches group by the segment before the first `/` — `origin/main`
 * and `upstream/main` are different branches on different remotes, and a flat
 * list of them is unreadable the moment a second remote exists.
 */
export function partitionRefs(refs: readonly Ref[]): {
  branches: Ref[];
  remotes: { name: string; refs: Ref[] }[];
  tags: Ref[];
} {
  const branches: Ref[] = [];
  const tags: Ref[] = [];
  const byRemote = new Map<string, Ref[]>();

  for (const ref of refs) {
    if (ref.kind === 'localBranch') branches.push(ref);
    else if (ref.kind === 'tag') tags.push(ref);
    else if (ref.kind === 'remoteBranch') {
      const slash = ref.name.indexOf('/');
      // A remote ref with no `/` cannot be attributed to a remote; bucket it
      // under its own name rather than dropping it silently.
      const remote = slash === -1 ? ref.name : ref.name.slice(0, slash);
      const bucket = byRemote.get(remote);
      if (bucket) bucket.push(ref);
      else byRemote.set(remote, [ref]);
    }
  }

  return {
    // HEAD first, then alphabetical — the branch you are on is the one you look
    // for, and it should not move as the list grows.
    branches: branches.sort(
      (a, b) => Number(b.isHead) - Number(a.isHead) || a.name.localeCompare(b.name),
    ),
    remotes: [...byRemote.entries()]
      .map(([name, list]) => ({ name, refs: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tags: tags.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })),
  };
}
