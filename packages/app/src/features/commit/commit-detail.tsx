import type { AgentDefinition, CommitProvenance } from '@midnite/studio-shared';
import {
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuCopy,
  LuExternalLink,
  LuList,
  LuListTree,
  LuRows3,
  LuX,
} from 'react-icons/lu';
import { useGraphStore } from '../graph/graph-store';
import {
  ProvenanceMark,
  getProvenanceTooltip,
  resolveProvenanceDetails,
} from '../graph/provenance-mark';
import { useAgents } from '../terminal/use-agents';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { buildChangeTree, flattenBySize } from '../../components/build-change-tree';
import { ChangeTotals, ChangeTree } from '../../components/change-tree';
import { DIFF_BAR_CLASS, DiffPaneFrame } from '../../components/diff-pane-frame';
import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { Tooltip } from '../../components/tooltip';
import { UserAvatar } from '../../components/user-avatar';

import { copyText, resolveRevision, useCommitDetail, useRemotes, useSessionHistory } from '../../services/queries';
import { useSessionsStore } from '../../store/sessions-store';
import {
  classifyProvenance,
  type AgentSignature,
  type Commit,
} from '@midnite/studio-shared';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore, type CommitFileView } from '../../store/ui-store';
import { DiffView } from '../diff/diff-view';
import { imageDiffSources } from '../diff/image-sources';
import { useCommitFileDiff } from '../diff/use-file-diff';
import { formatDate } from '../graph/graph-row';
import { CommitAllChanges } from './commit-all-changes';
/*
  `react-markdown` + `remark-gfm` out of the entry chunk — Phase 36 Theme C.

  The phase doc expected these to leave the entry for free, once `DashboardView`
  and `Workbench`/reviews went lazy. They did not, and the manifest said so: the
  commit inspector renders its message through the same pipeline, and the
  inspector hangs off `GraphView`, which is eager by design because it is the
  first paint. So this is the one place the doc's "add an explicit split only
  where the assertion fails" clause actually fires.

  `fallback={null}`, not a spinner: the message body is one block inside a header
  that has already rendered the sha, the author and the subject. A spinner there
  would draw the eye to the one part of the panel that is about to fill itself in.
*/
const CommitMessage = lazy(() =>
  import('./commit-message').then((m) => ({ default: m.CommitMessage })),
);

/**
 * The commit inspector.
 *
 * Phase 5 shipped this as an explicit stub: `%B` in a `whitespace-pre-wrap` div,
 * a flat file list, and a `<pre>` of `git show --stat` repeating the numbers the
 * file list already showed. Phase 12 makes it the thing you actually read a
 * commit in — rendered message with live references (Theme A), a real header,
 * a collapsible file tree and parent navigation (Theme B), over the diff Theme D
 * already provides.
 *
 * The pane is one scrolling header above a draggable files/diff split, rather
 * than tabs. At ~384px wide there is not room for everything at once, but the
 * question being asked of a file list — "which of these do I want to read" — is
 * one you answer by looking at the list and the diff together.
 */
function parseTrailers(body: string, key: string): string[] {
  const result: string[] = [];
  const lines = body.split('\n');
  const prefix = `${key.toLowerCase()}:`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(prefix)) {
      const val = trimmed.slice(prefix.length).trim();
      if (val) result.push(val);
    }
  }
  return result;
}

function getAgentName(agentId: string, agents: readonly AgentDefinition[]): string {
  const agent = agents.find((a) => a.id === agentId);
  if (agent?.label) return agent.label;
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

export function CommitDetail({
  repoId,
  sha,
  onClose,
  layout = 'stacked',
  dividerGradient,
}: {
  repoId: string;
  sha: string;
  onClose?: () => void;
  /**
   * `stacked` is the inspector as a narrow column — the header, the file list
   * and one file's diff one above the other (Search's commit results). `split` is the git graph's inline panel: the header and the file
   * list form a left column and the whole right column is the diff, of one
   * file, a Cmd/Ctrl-click multi-selection, or — with nothing picked — every
   * file. Same state, same parts; only the arrangement differs.
   */
  layout?: 'stacked' | 'split';
  /** Lane colours for the split layout's divider (graph inline panel only). */
  dividerGradient?: { from: string; to: string };
}) {
  const split = layout === 'split';
  const { data, isLoading } = useCommitDetail(repoId, sha);
  const { data: remotes } = useRemotes(repoId);
  const selectCommit = useUiStore((s) => s.selectCommit);
  const fileView = useUiStore((s) => s.commitFileView);
  const setFileView = useUiStore((s) => s.setCommitFileView);

  const { agents } = useAgents();
  const sessionHistory = useSessionHistory();
  const closedSessions = useMemo(() => sessionHistory.data ?? [], [sessionHistory.data]);
  const roster = useMemo(
    () => agents.map((a) => a.signatures).filter(Boolean) as AgentSignature[],
    [agents],
  );

  const rowCount = useGraphStore((s) => s.rows.length);
  const storeCommit = useMemo(
    () => useGraphStore.getState().rows.find((r) => r.commit.sha === data?.sha)?.commit,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowCount, data?.sha],
  );

  /**
   * The row batch already classified this sha once (Theme C, `graph-store.ts`
   * `appendBatch`) whenever the row has streamed into view — reuse that
   * rather than reclassifying, so the mark here always agrees with the mark
   * on the row. A commit opened before its row has streamed in (a deep link,
   * or a session's commit the user has not scrolled to) falls back to
   * classifying it directly off the loaded detail plus the trailers on its
   * own message (Theme D) — the store is a cache, not the only source.
   */
  const storeProvenance = useGraphStore((s) => s.provenance[sha]);
  const provenance = useMemo(() => {
    if (storeProvenance) return storeProvenance;
    if (!data) return null;
    const commit: Commit = storeCommit ?? {
      sha: data.sha,
      parents: data.parents,
      authorName: data.author.name,
      authorEmail: data.author.email,
      authorDate: data.author.date,
      committerDate: data.committer.date,
      subject: data.subject,
      refs: [],
      coAuthors: parseTrailers(data.body, 'Co-Authored-By'),
      sessionTrailers: parseTrailers(data.body, 'Midnite-Session'),
    };
    return classifyProvenance(commit, roster, closedSessions, repoId);
  }, [storeProvenance, data, storeCommit, roster, closedSessions, repoId]);

  const handleOpenSession = useCallback((sessionId: string) => {
    useSessionsStore.getState().selectClosedSession(sessionId);
    useSessionsStore.getState().selectLiveSession(null);
    useUiStore.getState().setActiveView('sessions');
  }, []);

  /*
    Open ⇄ closed is a preference, like the tree/list choice beside it: you are
    either reading commits or scanning diffs, and you keep doing the one you
    were doing. So it persists, and it is not reset by selecting another commit.
  */
  const metaOpen = useUiStore((s) => s.commitMetaOpen);
  const toggleMeta = useUiStore((s) => s.toggleCommitMeta);
  const metaId = useId();

  const commitProvenance = provenance ?? { kind: 'human' as const };
  const { sessionName, agent } = resolveProvenanceDetails(commitProvenance, agents, closedSessions);

  // The pre-image path rides along with the selection: rename detection needs
  // both sides of the pathspec, and without it a renamed file renders as a
  // brand-new file with every line green.
  //
  // The requested sha is stored WITH it, so the selection can be corrected
  // during render rather than in an effect — see `selected` below.
  const [state, setState] = useState<CommitViewState>({
    sha,
    files: EMPTY_FILES,
    collapsedDirs: EMPTY_SET,
    showAll: false,
  });

  /**
   * Selecting a commit must not carry the previous commit's file selection: the
   * path may not even exist in this one, which would render a permanently empty
   * diff pane with no clue as to why. The collapse state goes with it, because
   * the directories are a different set.
   *
   * Corrected DURING render, not in an effect. An effect runs after render, so
   * the render that first observes the new sha would still hold the previous
   * commit's path — and `useCommitFileDiff` is called in that render, issuing a
   * real `git diff` for a file that usually is not in the new commit and caching
   * it under `staleTime: Infinity`. This is the same shape as, and the same fix
   * as, `useContextReset` in `use-file-diff.ts`.
   */
  const stale = state.sha !== sha;
  const picked = stale ? EMPTY_FILES : state.files;
  const selected = picked.length === 1 ? picked[0]! : null;
  const collapsedDirs = stale ? EMPTY_SET : state.collapsedDirs;
  // Split mode has no "one file" layout to leave: nothing picked IS every file.
  const showAll = split ? picked.length === 0 : stale ? false : state.showAll;
  if (stale) setState({ sha, files: EMPTY_FILES, collapsedDirs: EMPTY_SET, showAll: false });
  const pickedPaths = useMemo(() => new Set(picked.map((file) => file.path)), [picked]);

  /**
   * Clicking the open file again closes the diff.
   *
   * Kept from the Phase 5 pane: in a 384px panel the diff is most of the height,
   * and being able to put it away is how you see the rest of a large commit's
   * file list without switching commits and back.
   *
   * Also drops out of `showAll`: picking one file is picking it out of the rest,
   * and the two views cannot both be answering "what do I look at" at once.
   */
  const toggleFile = useCallback(
    (file: { path: string; oldPath: string | null }, modifiers?: { additive: boolean }) => {
      const pick = { path: file.path, oldPath: file.oldPath };
      setState((current) => {
        const files = current.sha === sha ? current.files : EMPTY_FILES;
        const has = files.some((f) => f.path === pick.path);
        // Cmd/Ctrl-click grows or shrinks a multi-selection — split mode only,
        // since the stacked pane has room for exactly one file's diff.
        const next =
          split && modifiers?.additive
            ? has
              ? files.filter((f) => f.path !== pick.path)
              : [...files, pick]
            : has && files.length === 1
              ? EMPTY_FILES
              : [pick];
        return { ...current, sha, files: next, showAll: false };
      });
    },
    [sha, split],
  );

  /** Tree/list stays a single-file affordance — selecting either exits `showAll`. */
  const selectFileView = useCallback(
    (view: CommitFileView) => {
      setFileView(view);
      setState((current) => ({ ...current, sha, showAll: false }));
    },
    [sha, setFileView],
  );

  const toggleShowAll = useCallback(() => {
    setState((current) =>
      split
        ? { ...current, sha, files: EMPTY_FILES, showAll: false }
        : { ...current, sha, showAll: current.sha === sha ? !current.showAll : true },
    );
  }, [sha, split]);

  const diff = useCommitFileDiff({
    repoId,
    // The RESOLVED sha, not the requested one: an abbreviated sha reaches
    // `git show` fine but makes a different query key on every abbreviation of
    // the same commit, so the diff would refetch for each.
    sha: data?.sha ?? sha,
    path: selected?.path ?? null,
    oldPath: selected?.oldPath ?? null,
  });

  /**
   * Follow a sha out of the message body.
   *
   * Resolved through main first. A 7-char sha selects fine — `git show` accepts
   * it — but the selection is also what the graph highlights and what the diff
   * key is built from, and neither works with an abbreviation. Resolving also
   * turns "that commit is not in this repository" into an answer we can render
   * instead of a pane that loads forever.
   */
  const followSha = useCallback(
    (rev: string) => {
      void resolveRevision(repoId, rev).then((full) => {
        // A rev that resolves to nothing is still selected: the inspector's
        // not-found state names it, which is more useful than a click that
        // appears to do nothing at all.
        selectCommit(full ?? rev);
      });
    },
    [repoId, selectCommit],
  );

  const tree = useMemo(() => buildChangeTree(data?.files ?? []), [data?.files]);
  const list = useMemo(() => flattenBySize(data?.files ?? []), [data?.files]);

  const toggleDir = useCallback(
    (path: string) => {
      setState((current) => {
        const next = new Set(current.sha === sha ? current.collapsedDirs : EMPTY_SET);
        if (!next.delete(path)) next.add(path);
        return { ...current, sha, collapsedDirs: next };
      });
    },
    [sha],
  );

  const filesHeight = useUiStore((s) => s.layout.commitFilesHeight);
  const setLayout = useUiStore((s) => s.setLayout);
  const files = useResizable({
    size: filesHeight,
    onSize: (value) => setLayout('commitFilesHeight', value),
    min: LAYOUT_BOUNDS.commitFilesHeight.min,
    max: LAYOUT_BOUNDS.commitFilesHeight.max,
    initial: 200,
    axis: 'y',
  });

  // The split layout's left column — details and the file list, left of the diff.
  const listWidth = useUiStore((s) => s.layout.graphInlineListWidth);
  const listColumn = useResizable({
    size: listWidth,
    onSize: (value) => setLayout('graphInlineListWidth', value),
    initial: DEFAULT_LAYOUT.graphInlineListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.graphInlineListWidth,
  });

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  }

  // Null is a real answer, not a failure: a sha linkified out of a commit
  // message may name a commit that was never pushed here, or that a rebase
  // orphaned. Saying so beats an empty panel that looks broken.
  if (!data) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm">Commit not found</p>
          {onClose ? (
            <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} />
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{shortSha(sha)}</span> is not in this repository. It may not
          have been fetched, or a rebase may have replaced it.
        </p>
      </div>
    );
  }

  const insertions = data.files.reduce((sum, f) => sum + f.insertions, 0);
  const deletions = data.files.reduce((sum, f) => sum + f.deletions, 0);

  const headerRow = (
    /*
      The accordion's header row, and the only part of the metadata that is
      always on screen: the sha you came here to check, the copy button, and
      the tree/list toggle. Pinned rather than scrolled, because it now also
      carries the control that reveals everything below it.
    */
    <div
      className={
        layout === 'split'
          ? `flex items-center gap-1 pl-1 pr-2 ${DIFF_BAR_CLASS}`
          : 'flex shrink-0 items-center gap-1 py-2 pl-1 pr-2'
      }
      data-testid="commit-header-bar"
    >
      <button
        type="button"
        onClick={toggleMeta}
        aria-expanded={metaOpen}
        // Only while the panel exists: `aria-controls` naming an absent id is
        // a dangling reference, and the region is unmounted rather than
        // hidden — see the note on the block itself.
        {...(metaOpen ? { 'aria-controls': metaId } : {})}
        aria-label={metaOpen ? 'Hide the commit details' : 'Show the commit details'}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        {metaOpen ? (
          <LuChevronDown className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <LuChevronRight className="h-3 w-3" strokeWidth={2.5} />
        )}
      </button>
      {split ? (
        // Already in the graph, under this commit's own row: nothing to go to.
        <span
          title={data.sha}
          className="min-w-0 flex-1 truncate font-mono text-[11px] leading-tight text-muted-foreground"
        >
          {data.sha.slice(0, 16)}…
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            // The Changes workbench's commit tab is gone; a commit opens in
            // place under its row in the graph instead.
            useUiStore.getState().setActiveView('graph');
            selectCommit(data.sha);
          }}
          title={`Show commit in graph (${data.sha})`}
          aria-label={`Show commit in graph (${data.sha})`}
          className="group inline-flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-[11px] leading-tight text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="truncate underline decoration-muted-foreground/40 underline-offset-2 group-hover:decoration-foreground">
            {data.sha.slice(0, 16)}…
          </span>
          <LuExternalLink
            aria-hidden
            className="h-3 w-3 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground"
          />
        </button>
      )}
      <CopySha sha={data.sha} />
      <div className="flex shrink-0 items-center">
        <ViewToggle
          view={fileView}
          onChange={selectFileView}
          // Split mode always shows the list, so tree/list stay pressed as picked.
          pickerHidden={split ? false : showAll}
          showAll={showAll}
          onToggleAll={toggleShowAll}
        />
      </div>
      {onClose && !split ? <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} /> : null}
    </div>
  );

  const metaHeader = (
    <header className="px-3 pb-2">
      <Identities
        author={data.author}
        committer={data.committer}
        provenance={commitProvenance}
        sessionName={sessionName}
        agent={agent}
        agents={agents}
        onOpenSession={handleOpenSession}
      />
      <div className="mt-2">
        <Suspense fallback={null}>
          <CommitMessage
            body={data.body}
            remotes={remotes ?? EMPTY_REMOTES}
            onSelectSha={followSha}
          />
        </Suspense>
      </div>
      <Parents parents={data.parents} onSelect={followSha} />
    </header>
  );

  const totalsRow = (
    <div className="flex shrink-0 items-center border-y border-border px-3 py-1.5">
      <ChangeTotals fileCount={data.files.length} insertions={insertions} deletions={deletions} />
    </div>
  );

  const selection = split
    ? { path: null, paths: pickedPaths, onSelect: toggleFile }
    : { path: selected?.path ?? null, onSelect: toggleFile };
  const fileTree =
    fileView === 'tree' ? (
      <ChangeTree
        nodes={tree}
        selection={selection}
        collapsed={collapsedDirs}
        onToggleDir={toggleDir}
        testId="commit-files"
      />
    ) : (
      <ChangeTree
        nodes={list}
        selection={selection}
        collapsed={EMPTY_SET}
        onToggleDir={toggleDir}
        flat
        testId="commit-files"
      />
    );

  const singleDiff = (
    <DiffView
      diff={diff.diff}
      isLoading={diff.isLoading}
      onExpandContext={diff.expandContext}
      images={imageDiffSources(diff.diff, { kind: 'commit', repoId, sha: data.sha })}
    />
  );

  const noFiles = (
    <p className="px-3 py-2 text-xs text-muted-foreground">This commit changed no files.</p>
  );

  if (split) {
    const pickedFiles = data.files.filter((file) => pickedPaths.has(file.path));
    return (
      <div className="flex h-full min-h-0" data-commit-layout="split">
        <div
          className={`flex h-full min-h-0 shrink-0 flex-col self-stretch border-r border-border ${
            listColumn.dragging ? '' : 'transition-[width] duration-150 ease-in-out'
          }`}
          style={{ width: listColumn.current }}
          data-testid="commit-left-panel"
        >
          {headerRow}
          {/*
            Capped rather than elastic, unlike the stacked layout's: here the
            file list below it is what the column is FOR, and an unbounded
            message would push it out of the panel.
          */}
          {metaOpen ? (
            <div id={metaId} className="min-h-0 shrink-0 overflow-auto" style={{ maxHeight: '45%' }}>
              {metaHeader}
            </div>
          ) : null}
          {totalsRow}
          {data.files.length === 0 ? (
            noFiles
          ) : (
            <div className="min-h-0 flex-1 overflow-auto" data-testid="commit-file-pane">
              {fileTree}
            </div>
          )}
        </div>
        <ResizeHandle
          resizable={listColumn}
          axis="x"
          label="Resize the commit file list"
          gradient={dividerGradient}
        />
        <div className="h-full min-w-0 flex-1" data-testid="commit-diff-pane">
          <DiffPaneFrame onClose={onClose}>
          {data.files.length === 0 ? null : selected !== null ? (
            singleDiff
          ) : pickedFiles.length > 1 ? (
            <CommitAllChanges
              // Re-keyed on the pick so a changed selection re-opens every file in it.
              key={pickedFiles.map((file) => file.path).join('\u0000')}
              repoId={repoId}
              sha={data.sha}
              files={pickedFiles}
              totals={{
                fileCount: pickedFiles.length,
                insertions: pickedFiles.reduce((n, f) => n + f.insertions, 0),
                deletions: pickedFiles.reduce((n, f) => n + f.deletions, 0),
              }}
              initiallyExpanded
            />
          ) : (
            <CommitAllChanges
              repoId={repoId}
              sha={data.sha}
              files={data.files}
              totals={{ fileCount: data.files.length, insertions, deletions }}
            />
          )}
          </DiffPaneFrame>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {headerRow}

      {/*
        Unmounted when closed rather than clipped by a `<Collapse>`.

        The panel is a column of flex children, and this one is the elastic one
        — a commit message has no upper bound on its height, so it takes
        `flex-1` and scrolls. A collapse animation would have to keep the
        element in the layout, and a `1fr` track holding an unbounded message
        pushes the file list and the diff off the bottom of the panel. Taking
        the row out of the column is what hands its height to the diff, which
        is the whole point of being able to close it.
      */}
      {metaOpen ? (
        <div id={metaId} className="min-h-0 flex-1 overflow-auto">
          {metaHeader}
        </div>
      ) : null}

      {/*
        The all-changes view carries these totals in its own header, beside the
        expand/collapse-all buttons — two single-purpose rows stacked on top of
        each other read as a layout bug, and both are one line's worth of text.
      */}
      {showAll && data.files.length > 0 ? null : totalsRow}

      {data.files.length === 0 ? (
        noFiles
      ) : showAll ? (
        <div className="min-h-0 flex-1">
          <CommitAllChanges
            repoId={repoId}
            sha={data.sha}
            files={data.files}
            totals={{ fileCount: data.files.length, insertions, deletions }}
          />
        </div>
      ) : (
        <>
          {/*
            `maxHeight` as well as `height`, and it is not belt-and-braces: the
            bounds in the store are absolute pixels, so a 720px request in a
            short window would collapse BOTH neighbours to nothing — and, being
            persisted, would still be collapsed on the next launch, with only a
            zero-height handle left to drag back. A share of the pane keeps the
            message above and the diff below on screen whatever the drag asks for.
          */}
          <div
            className="min-h-0 shrink-0 overflow-auto"
            style={{ height: files.current, maxHeight: '60%' }}
            data-testid="commit-file-pane"
          >
            {fileTree}
          </div>

          <ResizeHandle resizable={files} axis="y" label="Resize the commit file list" />

          <div className="min-h-0 flex-1">
            {selected === null ? (
              <p className="p-3 text-xs text-muted-foreground">
                Select a file to see what changed in it.
              </p>
            ) : (
              singleDiff
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What the panel remembers about the commit it is showing.
 *
 * The sha is part of the state rather than only a prop so a mismatch is
 * detectable during render — see the reset note above.
 */
type CommitViewState = {
  sha: string;
  /** The picked files — at most one in the stacked layout. */
  files: readonly PickedFile[];
  collapsedDirs: ReadonlySet<string>;
  /** Whether the file pane and single-file diff are replaced by `CommitAllChanges`. */
  showAll: boolean;
};

type PickedFile = { path: string; oldPath: string | null };

/** Neither is ever mutated, so one module-level instance avoids a render loop. */
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_FILES: readonly PickedFile[] = [];
const EMPTY_REMOTES: never[] = [];

const shortSha = (sha: string): string => sha.slice(0, 12);

/**
 * Copy the full sha.
 *
 * Through Electron's clipboard rather than `navigator.clipboard`: the packaged
 * app is a `file://` origin and the Async Clipboard API is gated on a secure
 * context, so the web API is the one path that would work under the dev server
 * and fail silently in the shipped dmg.
 *
 * The checkmark is shown only on a confirmed write. A button that flashes
 * "copied" regardless is worse than one that does nothing, because it stops the
 * user from trying again.
 */
function CopySha({ sha }: { sha: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount matters: the panel is unmounted by selecting another
  // commit, and a pending timer would call setState on a dead component.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <IconButton
      icon={copied ? LuCheck : LuCopy}
      label={copied ? 'Copied' : 'Copy the full sha'}
      size="sm"
      onClick={() => {
        void copyText(sha).then((ok) => {
          if (!ok) return;
          setCopied(true);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1200);
        });
      }}
    />
  );
}

/**
 * Tree ⇄ list ⇄ all, as a three-button radio group rather than a toggle.
 *
 * Tree and list are two layouts of the same "pick one file" picker, so they
 * share `view`; "view all changes" replaces that picker with every file's
 * diff at once, so it is a separate `showAll` flag rather than a third
 * `CommitFileView` value — picking tree or list is also how you leave it.
 */
function ViewToggle({
  view,
  onChange,
  pickerHidden,
  showAll,
  onToggleAll,
}: {
  view: CommitFileView;
  onChange: (view: CommitFileView) => void;
  /** Whether "all" has replaced the file picker, so neither layout is pressed. */
  pickerHidden: boolean;
  showAll: boolean;
  onToggleAll: () => void;
}) {
  return (
    <>
      <IconButton
        icon={LuListTree}
        label="Group the files by folder"
        size="sm"
        aria-pressed={!pickerHidden && view === 'tree'}
        className={!pickerHidden && view === 'tree' ? 'bg-accent text-foreground' : ''}
        onClick={() => onChange('tree')}
      />
      <IconButton
        icon={LuList}
        label="List the files by how much changed"
        size="sm"
        aria-pressed={!pickerHidden && view === 'list'}
        className={!pickerHidden && view === 'list' ? 'bg-accent text-foreground' : ''}
        onClick={() => onChange('list')}
      />
      <IconButton
        icon={LuRows3}
        label={pickerHidden ? 'Back to one file at a time' : 'View all changes at once'}
        size="sm"
        aria-pressed={showAll}
        className={showAll ? 'bg-accent text-foreground' : ''}
        onClick={onToggleAll}
      />
    </>
  );
}

type Identity = { name: string; email: string; date: number };

/**
 * Author, and committer only when it differs.
 *
 * Compared on name AND email, not email alone: a rebase or a squash-merge keeps
 * the author's address and changes the display name, and a GitHub web-UI merge
 * changes both. Showing the row unconditionally would duplicate one line on the
 * overwhelming majority of commits; comparing on email alone would hide a real
 * signal on the ones where only the name moved.
 */
/**
 * Splits `text` on the first occurrence of `needle` and wraps that occurrence
 * in a button that opens the session's archived transcript (Theme D) — the
 * rest of the sentence (Theme C's `getProvenanceTooltip` phrasing) renders as
 * plain text either side of it. Falls back to plain text when the needle
 * cannot be found (e.g. the session was since renamed).
 */
function linkifySessionName(
  text: string,
  needle: string,
  sessionId: string,
  onOpenSession: (sessionId: string) => void,
): ReactNode {
  const idx = text.indexOf(needle);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const after = text.slice(idx + needle.length);
  return (
    <>
      {before}
      <button
        type="button"
        onClick={() => onOpenSession(sessionId)}
        className="underline decoration-primary/40 underline-offset-2 hover:decoration-primary text-primary font-medium"
        title={`Open session transcript (${sessionId})`}
        aria-label={`Open session ${needle}`}
      >
        {needle}
      </button>
      {after}
    </>
  );
}

function Identities({
  author,
  committer,
  provenance,
  sessionName,
  agent,
  agents,
  onOpenSession,
}: {
  author: Identity;
  committer: Identity;
  provenance?: CommitProvenance | null;
  sessionName?: string;
  agent?: AgentDefinition | null;
  agents: readonly AgentDefinition[];
  onOpenSession?: (sessionId: string) => void;
}) {
  const differs = author.name !== committer.name || author.email !== committer.email;
  const hasProvenance = provenance && provenance.kind !== 'human';
  const agentName =
    agent?.label ||
    (hasProvenance ? provenance.agentIds.map((id) => getAgentName(id, agents)).join(', ') : undefined);
  const provenanceText = hasProvenance
    ? getProvenanceTooltip({ provenance, sessionName, agentName })
    : null;
  const sessionId = hasProvenance ? provenance.sessionId : undefined;
  const provenanceContent =
    provenanceText && sessionId && sessionName && onOpenSession
      ? linkifySessionName(provenanceText, sessionName, sessionId, onOpenSession)
      : provenanceText;

  return (
    <dl
      className="mt-1.5 grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 gap-y-0.5 text-xs"
      data-testid="commit-identities"
    >
      <IdentityRow role="author" identity={author} />
      {differs ? <IdentityRow role="committer" identity={committer} /> : null}
      {hasProvenance ? (
        <>
          <dt className="text-muted-foreground">Provenance</dt>
          <dd
            className="col-span-2 flex min-w-0 items-center gap-1.5 truncate"
            data-testid="commit-provenance"
          >
            <ProvenanceMark
              provenance={provenance}
              sessionName={sessionName}
              agent={agent}
              size={14}
            />
            <span className="truncate text-foreground/90">{provenanceContent}</span>
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function IdentityRow({ role, identity }: { role: string; identity: Identity }) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <>
      <dt className="text-muted-foreground">{role}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 truncate">
        <UserAvatar
          name={identity.name}
          email={identity.email}
          size={16}
          detail={roleLabel}
        />
        <span className="truncate">{identity.name}</span>
      </dd>
      {/*
        Relative, with the absolute date on hover — the same reading as the
        graph's Date column, which is the one place these numbers get compared.
      */}
      <dd className="justify-self-end text-muted-foreground">
        <Tooltip label={new Date(identity.date * 1000).toLocaleString()}>
          <span className="tabular-nums">{formatDate(identity.date)}</span>
        </Tooltip>
      </dd>
    </>
  );
}

/**
 * Parents, as clickable short shas.
 *
 * Labelled `parent 1` / `parent 2` for a merge, because which side is which is
 * the whole question you are asking of a merge commit — the first parent is the
 * branch it was merged *into*.
 */
function Parents({ parents, onSelect }: { parents: string[]; onSelect: (sha: string) => void }) {
  if (parents.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">Root commit — no parents.</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
      {parents.map((parent, index) => (
        <span key={parent} className="flex items-baseline gap-1">
          <span className="text-muted-foreground">
            {parents.length > 1 ? `parent ${index + 1}` : 'parent'}
          </span>
          <button
            type="button"
            onClick={() => onSelect(parent)}
            title={`Show commit ${parent}`}
            // Labelled with the FULL sha: the visible text is a 12-character
            // truncation, which is not a name anybody can act on by ear.
            aria-label={`Show commit ${parent}`}
            className="rounded bg-muted px-1 font-mono text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {shortSha(parent)}
          </button>
        </span>
      ))}
    </div>
  );
}
