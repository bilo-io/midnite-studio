import type {
  FileChangeKind,
  FileDiff,
  ForgeReviewThread,
  StatusCode,
} from '@midnite/studio-shared';
import { LuChevronRight } from 'react-icons/lu';
import { useId, useState } from 'react';

import { Counts } from '../../components/change-tree';
import { positionForLine, threadsForFile } from '../diff/comment-anchors';
import { DiffToolbar } from '../diff/diff-toolbar';
import { DiffView } from '../diff/diff-view';
import { imageDiffSources } from '../diff/image-sources';

import { StatusMark } from '../status/status-mark';
import { CommentComposer } from './comment-composer';
import { CommentThread } from './comment-thread';
import { OutdatedThreads } from './outdated-threads';

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
  threads,
  repoId,
  worktreePath,
  baseSha,
  review,
}: {
  file: FileDiff;
  open: boolean;
  onToggle: () => void;
  /** Every inline thread on the pull request; this row picks out its own. */
  threads: readonly ForgeReviewThread[];
  repoId?: string;
  worktreePath?: string;
  baseSha?: string | null;
  /**

   * The write half.
   *
   * `headSha` is nullable and gates **only** the new-comment gutter. A review
   * comment is anchored to a commit, and posting one without `commit_id`
   * attaches it to whatever the API decides is current rather than to the diff
   * being read — so starting a thread waits for the sha, which arrives one
   * fetch after the patch. Replying and resolving need no sha at all and are
   * never gated on it: an existing thread already knows which commit it is on.
   */
  review: {
    headSha: string | null;
    /** Resolves true when the comment landed — see `pr-detail.tsx`'s note. */
    onComment: (input: {
      commitId: string;
      path: string;
      line: number;
      position?: number;
      body: string;
    }) => Promise<boolean>;
    /** Resolves true when the reply landed. */
    onReply: (input: { commentId: string; body: string }) => Promise<boolean>;
    onResolve: (input: { threadId: string; resolved: boolean }) => void;
    busy: boolean;
    error: string | null;
  };
}) {
  const bodyId = useId();

  /*
    One composer at a time, per file, and its line is the whole state.

    Per file rather than per page because the accordion mounts one of these per
    changed path and each owns its own diff; a page-level "which line is open"
    would have to be keyed by path anyway, and would put a piece of one file's
    UI state in a component that renders all of them.
  */
  const [composerLine, setComposerLine] = useState<number | null>(null);
  /*
    `file` passed as the third argument, not just its path: it is what lets a
    thread anchored outside this diff's hunks fall into `unanchored` instead of
    into a `byLine` key no row will ever match. See `threadsForFile`.
  */
  const { byLine, leftByLine, unanchored } = threadsForFile(threads, file.path, file);

  // Hoisted so the narrowing holds inside the composer's own callback.
  const headSha = review.headSha;

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
          <LuChevronRight
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

        {open ? <DiffToolbar diff={file} showStats={false} /> : null}
      </header>

      {open ? (
        <div id={bodyId} className="border-t border-border/40">
          <OutdatedThreads
            threads={unanchored}
            onReply={review.onReply}
            onResolve={review.onResolve}
            busy={review.busy}
            error={review.error}
            file={file}
            repoId={repoId}
            worktreePath={worktreePath}
          />

          {/*
            No `onExpandContext`. Expanding context is a REFETCH with a wider
            `-U`, and `gh pr diff` has no per-file form to refetch — asking for
            more context would mean pulling the whole patch again for one file.
            Omitting the prop is what makes DiffView hide the expander rather
            than offer a button that cannot work.
          */}
          <DiffView
            diff={file}
            inline
            threads={byLine}
            leftThreads={leftByLine}

            images={
              repoId && headSha && (baseSha || file.oldPath)
                ? imageDiffSources(file, {
                    kind: 'commit',
                    repoId,
                    sha: headSha,
                    parentSha: baseSha ?? undefined,
                    ...(worktreePath ? { worktreePath } : {}),
                  })
                : null
            }
            /*

              `onComment` is the gate on the gutter affordance, and it is
              undefined until there is a head sha to anchor a comment to — see
              the `review` prop's note. A reader can still read every existing
              thread in the meantime; only starting a new one waits.
            */
            {...(headSha === null ? {} : { onComment: setComposerLine })}
            renderThread={(atLine, line) => (
              <CommentThread
                threads={atLine}
                line={line}
                onReply={review.onReply}
                onResolve={review.onResolve}
                busy={review.busy}
                error={review.error}
                file={file}
                repoId={repoId}
                worktreePath={worktreePath}
              />
            )}
            composer={
              composerLine === null || headSha === null
                ? null
                : {
                    line: composerLine,
                    node: (
                      <div className="border-y border-border/60 bg-muted/20 px-3 py-2">
                        <CommentComposer
                          label={`Comment on ${file.path} line ${composerLine}`}
                          submitLabel="Add comment"
                          busy={review.busy}
                          error={review.error}
                          onCancel={() => setComposerLine(null)}
                          onSubmit={(body) => {
                            /*
                              `position` rides along as the fallback anchor. It
                              is computed here because this is where the parsed
                              hunks are; main sends the line-based form first
                              and only retries with this if the API refuses it.
                            */
                            const position = positionForLine(file, composerLine);
                            void review
                              .onComment({
                                commitId: headSha,
                                path: file.path,
                                line: composerLine,
                                ...(position === null ? {} : { position }),
                                body,
                              })
                              // Closed on success only. A refused write leaves
                              // the box mounted with its text and the failure
                              // under it — losing somebody's paragraph because
                              // a token expired is the one outcome a composer
                              // must never produce.
                              .then((ok) => {
                                if (ok) setComposerLine(null);
                              });
                          }}
                        />
                      </div>
                    ),
                  }
            }
          />
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
