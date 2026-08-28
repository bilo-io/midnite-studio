import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import type { ChangedFile } from '../../components/build-change-tree';
import { ChangeTotals, Counts } from '../../components/change-tree';
import { IconButton } from '../../components/icon-button';
import {
  EXPAND_ALL_LIMIT,
  expandAll,
  NOTHING_EXPANDED,
  toggleExpanded,
  withheldByCap,
  type ExpansionState,
} from '../changes/expansion';
import { DiffView } from '../diff/diff-view';
import { imageDiffSources } from '../diff/image-sources';
import { useCommitFileDiff } from '../diff/use-file-diff';

/** A commit's file record has exactly the shape the change tree already needs. */
type CommitFile = ChangedFile;

/**
 * Every file this commit touched, each in its own accordion.
 *
 * The commit-side twin of `AllChangesView` (`features/changes`): same lazy
 * expand-on-open bodies and the same expand-all cap, over `commitFileDiff`
 * instead of a checkout's working tree. `expansion.ts` is generic over paths,
 * so it is reused rather than re-implemented.
 */
export function CommitAllChanges({
  repoId,
  sha,
  files,
  totals,
}: {
  repoId: string;
  sha: string;
  files: readonly CommitFile[];
  /**
   * Shown at the left of the header, so the "how big is this commit" answer
   * and the expand/collapse-all controls share one line instead of stacking
   * two thin bars — the same shape as `ChangesAccordion`'s header.
   */
  totals: { fileCount: number; insertions: number; deletions: number };
}) {
  const [expanded, setExpanded] = useState<ExpansionState>(NOTHING_EXPANDED);

  const sorted = useMemo(() => [...files].sort((a, b) => a.path.localeCompare(b.path)), [files]);
  const paths = useMemo(() => sorted.map((file) => file.path), [sorted]);
  const withheld = withheldByCap(paths);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-y border-border px-3 py-1.5">
        <ChangeTotals {...totals} className="mr-auto" />

        <IconButton
          icon={ChevronsUpDown}
          label={withheld > 0 ? `Expand the first ${EXPAND_ALL_LIMIT} files` : 'Expand all files'}
          size="sm"
          onClick={() => setExpanded(expandAll(paths))}
        />
        <IconButton
          icon={ChevronsDownUp}
          label="Collapse all files"
          size="sm"
          onClick={() => setExpanded(NOTHING_EXPANDED)}
        />
      </header>

      {/* Said out loud, not swallowed — see `AllChangesView`'s copy of this note. */}
      {withheld > 0 && expanded.size >= EXPAND_ALL_LIMIT ? (
        <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          Showing the first {EXPAND_ALL_LIMIT} diffs — {withheld} more{' '}
          {withheld === 1 ? 'file is' : 'files are'} listed below and open individually.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((file) => (
          <CommitFileAccordion
            key={file.path}
            repoId={repoId}
            sha={sha}
            file={file}
            open={expanded.has(file.path)}
            onToggle={() => setExpanded((current) => toggleExpanded(current, file.path))}
          />
        ))}
      </div>
    </div>
  );
}

function CommitFileAccordion({
  repoId,
  sha,
  file,
  open,
  onToggle,
}: {
  repoId: string;
  sha: string;
  file: CommitFile;
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
          <span
            className="min-w-0 flex-1 truncate"
            title={file.oldPath === null ? file.path : `${file.oldPath} → ${file.path}`}
          >
            {file.path}
          </span>
          {/* A rename is worth a marker: the diff below is against `oldPath`. */}
          {file.oldPath === null ? null : (
            <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
              R
            </span>
          )}
          <Counts insertions={file.insertions} deletions={file.deletions} />
        </button>
      </header>

      {open ? (
        <div id={bodyId} className="border-t border-border/40">
          <CommitFileAccordionBody repoId={repoId} sha={sha} file={file} />
        </div>
      ) : null}
    </section>
  );
}

/** Split out so the diff query lives and dies with the open state. */
function CommitFileAccordionBody({
  repoId,
  sha,
  file,
}: {
  repoId: string;
  sha: string;
  file: CommitFile;
}) {
  const { diff, isLoading, expandContext } = useCommitFileDiff({
    repoId,
    sha,
    path: file.path,
    oldPath: file.oldPath,
  });

  return (
    <DiffView
      diff={diff}
      isLoading={isLoading}
      onExpandContext={expandContext}
      inline
      images={imageDiffSources(diff, { kind: 'commit', repoId, sha })}
    />
  );
}
