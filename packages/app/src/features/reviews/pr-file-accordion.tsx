import type { FileChangeKind, FileDiff, StatusCode } from '@midnite/git-shared';
import { ChevronRight } from 'lucide-react';
import { useId } from 'react';

import { Counts } from '../../components/change-tree';
import { DiffView } from '../diff/diff-view';
import { StatusMark } from '../status/status-mark';

/**
 * One file of a pull request's diff.
 *
 * Deliberately the same row the Changes page draws
 * (`changes/file-accordion.tsx`): chevron, one-letter mark, dimmed directory
 * with a bold basename, `+n −n` on the right. A PR diff and a working-tree diff
 * are the same thing seen from two places, and giving each its own layout is
 * how the two drift into looking like different features.
 *
 * The one structural difference is where the diff comes from. The Changes
 * accordion fetches per file as it opens, because a checkout has 200 files and
 * a `git diff` per file is cheap. A PR arrives as ONE patch — `gh pr diff`
 * cannot be asked for a single path — so every file's hunks are already in
 * memory and this row only shows or hides them.
 */
export function PrFileAccordion({
  file,
  open,
  onToggle,
}: {
  file: FileDiff;
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
          <StatusMark code={statusCode(file.change)} conflicted={false} />
          <span className="min-w-0 truncate" title={displayTitle(file)}>
            <span className="text-muted-foreground">{directoryOf(file.path)}</span>
            <span className="font-medium">{basenameOf(file.path)}</span>
          </span>
          <Counts insertions={file.insertions} deletions={file.deletions} />
        </button>
      </header>

      {open ? (
        <div id={bodyId} className="border-t border-border/40">
          {/*
            No `onExpandContext`. Expanding context is a REFETCH with a wider
            `-U`, and `gh pr diff` has no per-file form to refetch — asking for
            more context would mean pulling the whole patch again for one file.
            Omitting the prop is what makes DiffView hide the expander rather
            than offer a button that cannot work.
          */}
          <DiffView diff={file} inline />
        </div>
      ) : null}
    </section>
  );
}

/**
 * A file-level change kind in the status panel's vocabulary.
 *
 * The two enums say the same six things with one spelling difference, and
 * mapping here rather than widening `StatusMark` keeps the glyph legend a
 * single definition — see `status-mark.tsx`'s own note about drift.
 */
function statusCode(change: FileChangeKind): StatusCode {
  return change === 'type-changed' ? 'typeChanged' : change;
}

const lastSlash = (path: string): number => path.lastIndexOf('/');
const directoryOf = (path: string): string => path.slice(0, lastSlash(path) + 1);
const basenameOf = (path: string): string => path.slice(lastSlash(path) + 1);
const displayTitle = (file: FileDiff): string =>
  file.oldPath !== null && file.oldPath !== file.path
    ? `${file.oldPath} → ${file.path}`
    : file.path;
