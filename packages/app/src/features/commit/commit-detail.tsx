import { Check, ChevronDown, ChevronRight, Copy, List, ListTree } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { buildChangeTree, flattenBySize } from '../../components/build-change-tree';
import { ChangeTotals, ChangeTree } from '../../components/change-tree';
import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { Tooltip } from '../../components/tooltip';
import {
  copyText,
  resolveRevision,
  useCommitDetail,
  useRemotes,
} from '../../services/queries';
import { LAYOUT_BOUNDS, useUiStore, type CommitFileView } from '../../store/ui-store';
import { DiffView } from '../diff/diff-view';
import { useCommitFileDiff } from '../diff/use-file-diff';
import { formatDate } from '../graph/graph-row';
import { CommitMessage } from './commit-message';

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
export function CommitDetail({ repoId, sha }: { repoId: string; sha: string }) {
  const { data, isLoading } = useCommitDetail(repoId, sha);
  const { data: remotes } = useRemotes(repoId);
  const selectCommit = useUiStore((s) => s.selectCommit);
  const fileView = useUiStore((s) => s.commitFileView);
  const setFileView = useUiStore((s) => s.setCommitFileView);
  /*
    Open ⇄ closed is a preference, like the tree/list choice beside it: you are
    either reading commits or scanning diffs, and you keep doing the one you
    were doing. So it persists, and it is not reset by selecting another commit.
  */
  const metaOpen = useUiStore((s) => s.commitMetaOpen);
  const toggleMeta = useUiStore((s) => s.toggleCommitMeta);
  const metaId = useId();

  // The pre-image path rides along with the selection: rename detection needs
  // both sides of the pathspec, and without it a renamed file renders as a
  // brand-new file with every line green.
  //
  // The requested sha is stored WITH it, so the selection can be corrected
  // during render rather than in an effect — see `selected` below.
  const [state, setState] = useState<CommitViewState>({
    sha,
    file: null,
    collapsedDirs: EMPTY_SET,
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
  const selected = stale ? null : state.file;
  const collapsedDirs = stale ? EMPTY_SET : state.collapsedDirs;
  if (stale) setState({ sha, file: null, collapsedDirs: EMPTY_SET });

  /**
   * Clicking the open file again closes the diff.
   *
   * Kept from the Phase 5 pane: in a 384px panel the diff is most of the height,
   * and being able to put it away is how you see the rest of a large commit's
   * file list without switching commits and back.
   */
  const toggleFile = useCallback(
    (file: { path: string; oldPath: string | null }) => {
      setState((current) => ({
        ...current,
        sha,
        file: current.sha === sha && current.file?.path === file.path ? null : file,
      }));
    },
    [sha],
  );

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

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  }

  // Null is a real answer, not a failure: a sha linkified out of a commit
  // message may name a commit that was never pushed here, or that a rebase
  // orphaned. Saying so beats an empty panel that looks broken.
  if (!data) {
    return (
      <div className="p-3">
        <p className="text-sm">Commit not found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{shortSha(sha)}</span> is not in this repository. It may not
          have been fetched, or a rebase may have replaced it.
        </p>
      </div>
    );
  }

  const insertions = data.files.reduce((sum, f) => sum + f.insertions, 0);
  const deletions = data.files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        The accordion's header row, and the only part of the metadata that is
        always on screen: the sha you came here to check, the copy button, and
        the tree/list toggle. Pinned rather than scrolled, because it now also
        carries the control that reveals everything below it.
      */}
      <div className="flex shrink-0 items-start gap-1 py-2 pl-1 pr-2">
        <button
          type="button"
          onClick={toggleMeta}
          aria-expanded={metaOpen}
          // Only while the panel exists: `aria-controls` naming an absent id is
          // a dangling reference, and the region is unmounted rather than
          // hidden — see the note on the block itself.
          {...(metaOpen ? { 'aria-controls': metaId } : {})}
          aria-label={metaOpen ? 'Hide the commit details' : 'Show the commit details'}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          {metaOpen ? (
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
          )}
        </button>
        {/*
          11px rather than the panel's 12: forty monospace characters plus
          the buttons beside them fit the default 384px pane at this size and
          wrap to an orphaned character at the next one up. Still `break-all`,
          because the pane is draggable down to 280.

          The row's padding is tighter than the `px-3` used everywhere below,
          and that is what pays for the chevron: at `px-3` the 40th character
          wrapped to a line of its own. Sitting the chevron in the reclaimed
          gutter is also the usual shape for an accordion header — the control
          is left of the content it opens, not inset with it.
        */}
        <p
          className="min-w-0 flex-1 break-all font-mono text-[11px] leading-tight text-muted-foreground"
          data-selectable
        >
          {data.sha}
        </p>
        <CopySha sha={data.sha} />
        <div className="flex shrink-0 items-center">
          <ViewToggle view={fileView} onChange={setFileView} />
        </div>
      </div>

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
          <header className="px-3 pb-2">
            <Identities author={data.author} committer={data.committer} />
            <div className="mt-2">
              <CommitMessage
                body={data.body}
                remotes={remotes ?? EMPTY_REMOTES}
                onSelectSha={followSha}
              />
            </div>
            <Parents parents={data.parents} onSelect={followSha} />
          </header>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center border-y border-border px-3 py-1.5">
        <ChangeTotals
          fileCount={data.files.length}
          insertions={insertions}
          deletions={deletions}
        />
      </div>

      {/*
        `maxHeight` as well as `height`, and it is not belt-and-braces: the
        bounds in the store are absolute pixels, so a 720px request in a short
        window would collapse BOTH neighbours to nothing — and, being persisted,
        would still be collapsed on the next launch, with only a zero-height
        handle left to drag back. A share of the pane keeps the message above
        and the diff below on screen whatever the drag asks for.
      */}
      <div
        className="min-h-0 shrink-0 overflow-auto"
        style={{ height: files.current, maxHeight: '60%' }}
        data-testid="commit-file-pane"
      >
        {data.files.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            This commit changed no files.
          </p>
        ) : fileView === 'tree' ? (
          <ChangeTree
            nodes={tree}
            selection={{ path: selected?.path ?? null, onSelect: toggleFile }}
            collapsed={collapsedDirs}
            onToggleDir={toggleDir}
            testId="commit-files"
          />
        ) : (
          <ChangeTree
            nodes={list}
            selection={{ path: selected?.path ?? null, onSelect: toggleFile }}
            collapsed={EMPTY_SET}
            onToggleDir={toggleDir}
            flat
            testId="commit-files"
          />
        )}
      </div>

      <ResizeHandle resizable={files} axis="y" label="Resize the commit file list" />

      <div className="min-h-0 flex-1">
        {selected === null ? (
          <p className="p-3 text-xs text-muted-foreground">
            Select a file to see what changed in it.
          </p>
        ) : (
          <DiffView
            diff={diff.diff}
            isLoading={diff.isLoading}
            onExpandContext={diff.expandContext}
          />
        )}
      </div>
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
  file: { path: string; oldPath: string | null } | null;
  collapsedDirs: ReadonlySet<string>;
};

/** Neither is ever mutated, so one module-level instance avoids a render loop. */
const EMPTY_SET: ReadonlySet<string> = new Set();
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
      icon={copied ? Check : Copy}
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

/** Tree ⇄ list, as a two-button radio group rather than a toggle. */
function ViewToggle({
  view,
  onChange,
}: {
  view: CommitFileView;
  onChange: (view: CommitFileView) => void;
}) {
  return (
    <>
      <IconButton
        icon={ListTree}
        label="Group the files by folder"
        size="sm"
        aria-pressed={view === 'tree'}
        className={view === 'tree' ? 'bg-accent text-foreground' : ''}
        onClick={() => onChange('tree')}
      />
      <IconButton
        icon={List}
        label="List the files by how much changed"
        size="sm"
        aria-pressed={view === 'list'}
        className={view === 'list' ? 'bg-accent text-foreground' : ''}
        onClick={() => onChange('list')}
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
function Identities({ author, committer }: { author: Identity; committer: Identity }) {
  const differs = author.name !== committer.name || author.email !== committer.email;

  return (
    <dl
      className="mt-1.5 grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 gap-y-0.5 text-xs"
      data-testid="commit-identities"
    >
      <IdentityRow role="author" identity={author} />
      {differs ? <IdentityRow role="committer" identity={committer} /> : null}
    </dl>
  );
}

function IdentityRow({ role, identity }: { role: string; identity: Identity }) {
  return (
    <>
      <dt className="text-muted-foreground">{role}</dt>
      <dd className="min-w-0 truncate" title={`${identity.name} <${identity.email}>`}>
        {identity.name}
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
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Root commit — no parents.
      </p>
    );
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
