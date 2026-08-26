import type { StatusEntry } from '@midnite/git-shared';
import { ChevronRight } from 'lucide-react';
import { useId } from 'react';

import { DiffView } from '../diff/diff-view';
import { useFileDiff } from '../diff/use-file-diff';
import { primaryCode, StatusMark } from '../status/status-mark';

/**
 * One file in the all-changes view: a header that names it, and its diff.
 *
 * The diff is fetched by the BODY, which only mounts while the accordion is
 * open. That is the whole performance story of this view — a checkout with 200
 * changed files costs 200 rows and zero `git diff` calls until somebody
 * expands something. Closing a file unmounts the query rather than hiding it,
 * so a stale expansion cannot sit in the background holding a whole file's
 * worth of hunks.
 */
export function FileAccordion({
  repoId,
  worktreePath,
  entry,
  open,
  onToggle,
}: {
  repoId: string;
  /** The checkout being read — never the globally selected one. */
  worktreePath: string;
  entry: StatusEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const bodyId = useId();

  return (
    <section className="border-b border-border/60 last:border-b-0">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-3 py-1.5 backdrop-blur">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] transition-colors hover:text-foreground"
        >
          <ChevronRight
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-in-out ${
              open ? 'rotate-90' : ''
            }`}
          />
          <StatusMark code={primaryCode(entry)} conflicted={entry.conflicted} />
          {/*
            The directory dimmed and the basename in full strength. In a list of
            forty paths sharing three prefixes, the last segment is the only
            part that distinguishes them, and undifferentiated grey makes the
            list unscannable.
          */}
          <span className="min-w-0 truncate" title={displayTitle(entry)}>
            <span className="text-muted-foreground">{directoryOf(entry.path)}</span>
            <span className="font-medium">{basenameOf(entry.path)}</span>
          </span>
        </button>
      </header>

      {open ? (
        <div id={bodyId}>
          <FileAccordionBody repoId={repoId} worktreePath={worktreePath} entry={entry} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Split out so the query lives and dies with the open state.
 *
 * Hooks cannot be called conditionally, so a single component would have to
 * fetch for every row whether or not it is expanded — which is precisely the
 * cost this view is designed to avoid.
 */
function FileAccordionBody({
  repoId,
  worktreePath,
  entry,
}: {
  repoId: string;
  worktreePath: string;
  entry: StatusEntry;
}) {
  /*
    `staged: false` — the working-tree side.

    This view answers "what have I changed in this checkout", and the unstaged
    diff is that answer for a modified file. A file that is staged and then
    untouched has no worktree diff, which git reports as zero hunks and
    `describeEmptyDiff` explains in words; the Changes panel beside it is where
    the staged/unstaged distinction is actually worked with.
  */
  const { diff, isLoading, expandContext } = useFileDiff({
    repoId,
    worktreePath,
    path: entry.path,
    staged: entry.unstaged === 'unmodified',
    ...(entry.origPath ? { oldPath: entry.origPath } : {}),
  });

  return (
    <div className="border-t border-border/40">
      <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-muted-foreground">
        {diff ? (
          <>
            <span className="tabular-nums text-success">+{diff.insertions}</span>
            <span className="tabular-nums text-destructive">−{diff.deletions}</span>
          </>
        ) : null}
      </div>
      <DiffView diff={diff} isLoading={isLoading} onExpandContext={expandContext} inline />
    </div>
  );
}

const lastSlash = (path: string): number => path.lastIndexOf('/');
const directoryOf = (path: string): string => path.slice(0, lastSlash(path) + 1);
const basenameOf = (path: string): string => path.slice(lastSlash(path) + 1);
const displayTitle = (entry: StatusEntry): string =>
  entry.origPath ? `${entry.origPath} → ${entry.path}` : entry.path;
