import type { ForgePullFiles, ForgeReviewThread } from '@midnite/git-shared';
import { useState } from 'react';

import { openExternal } from '../../services/queries';
import { PrFileAccordion } from './pr-file-accordion';
import { PrFilesSkeleton } from './reviews-skeletons';

/**
 * How many files open on arrival.
 *
 * Three, not zero and not all. The overwhelming majority of pull requests touch
 * fewer files than this, and for them "all collapsed" means the Files tab opens
 * showing nothing but filenames — two clicks from the thing it exists to show.
 * A large PR gets the opposite protection: everything past the third stays shut
 * until asked for, so opening a 200-file review does not mount 200 diffs.
 */
const DEFAULT_OPEN = 3;

export function PrFiles({
  files,
  isLoading,
  error,
  notReady,
  pullUrl,
  threads,
  review,
}: {
  files: ForgePullFiles | null;
  isLoading: boolean;
  error: string | null;
  /** Why `gh` could not answer at all — see `notReady` in `pr-detail.tsx`. */
  notReady: string | null;
  /** Where to send a reader whose diff was capped. */
  pullUrl: string;
  /**
   * Every inline thread on the PR, unfiltered.
   *
   * Passed whole and split per file by each row rather than grouped once here,
   * because the grouping is cheap and the alternative is a `Map<path, …>` that
   * has to be rebuilt whenever either the patch or the threads refetch — two
   * queries with different lifetimes. `threadsForFile` is a linear scan over a
   * list bounded at 100.
   */
  threads: readonly ForgeReviewThread[];
  /** The write half — see `PrFileAccordion`'s own note on `headSha`. */
  review: React.ComponentProps<typeof PrFileAccordion>['review'];
}) {
  /*
    Overrides, not the open set itself.

    The default depends on a file's index, which is only known once the patch
    arrives; seeding state from it would need an effect that runs a render late
    and flashes every row shut. Recording only what the user has toggled means
    the default is computed at render time and the answer is right immediately.
  */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  // Before any statement about the diff: whether we were able to ask.
  if (notReady !== null) return <Note>{notReady}</Note>;
  if (error !== null) return <Note tone="destructive">{error}</Note>;
  if (isLoading && files === null) return <PrFilesSkeleton />;
  if (files === null) return <Note>No diff to show for this pull request.</Note>;
  if (files.files.length === 0) {
    return <Note>This pull request changes no files.</Note>;
  }

  return (
    <div>
      {files.files.map((file, index) => {
        const key = `${file.oldPath ?? ''}→${file.path}`;
        const open = toggled[key] ?? index < DEFAULT_OPEN;
        return (
          <PrFileAccordion
            key={key}
            file={file}
            open={open}
            onToggle={() => setToggled((prev) => ({ ...prev, [key]: !open }))}
            threads={threads}
            review={review}
          />
        );
      })}

      {files.truncated ? (
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {files.omittedFiles.toLocaleString()} more{' '}
          {files.omittedFiles === 1 ? 'file is' : 'files are'} not shown — this pull request&rsquo;s
          patch is {Math.round(files.totalBytes / 1024).toLocaleString()} KB, past the ceiling that
          keeps the window responsive.{' '}
          <button
            type="button"
            onClick={() => openExternal(pullUrl)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Open the whole diff on GitHub
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}

function Note({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <p
      className={`px-4 py-3 text-xs ${
        tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}
