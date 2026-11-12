import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuFileText, LuLoaderCircle } from 'react-icons/lu';

import type { ReleaseNotes } from '@midnite/studio-shared';

import { MARKDOWN_PROSE_CLASSES } from '../../layout/markdown-prose';

/** How many earlier releases the drop-up lists beneath the current one. */
const EARLIER_COUNT = 3;

export type ReleaseNotesPanelProps = {
  /** Names the panel for assistive tech: the root is a region labelled `<appName> release notes`. */
  appName: string;
  version: string;
  data: ReleaseNotes | undefined;
  isLoading: boolean;
  /** Sits at the header's right edge (Studio's Present button). */
  headerAction?: ReactNode;
  /** The rows beneath the notes — the links that stand whether or not the notes arrived. */
  links: ReactNode;
  /** Override how markdown renders; the default `a` is a plain new-tab anchor. */
  markdownComponents?: Components;
  earlierCount?: number;
};

const DEFAULT_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

/**
 * The release-notes drop-up's body (Phase 131 Theme E), presentational: Studio's markup, moved here so
 * every suite app's version pill opens the same panel. The caller owns the data and the link rows; the
 * panel owns the header, the loading line, the notes, the `Earlier releases` list and the empty copy.
 * Studio's `VersionNotesPanel` wraps it with its Present and Report rows.
 */
export function ReleaseNotesPanel({
  appName,
  version,
  data,
  isLoading,
  headerAction,
  links,
  markdownComponents = DEFAULT_COMPONENTS,
  earlierCount = EARLIER_COUNT,
}: ReleaseNotesPanelProps) {
  const earlier = (data?.sections ?? [])
    .filter((section) => section.version.replace(/^v/, '') !== version.replace(/^v/, ''))
    .slice(0, earlierCount);

  return (
    <div role="region" aria-label={`${appName} release notes`} className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <LuFileText aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">What&apos;s new in v{version}</span>
        {headerAction ? <span className="ml-auto flex">{headerAction}</span> : null}
      </div>

      <div className="hide-scrollbar max-h-[min(60vh,20rem)] overflow-auto px-3 py-2 text-xs leading-relaxed">
        {isLoading ? (
          <p className="flex items-center gap-2 py-1 text-muted-foreground">
            <LuLoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
            Loading release notes…
          </p>
        ) : data?.notes ? (
          <div className={MARKDOWN_PROSE_CLASSES}>
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {data.notes}
            </Markdown>
          </div>
        ) : (
          <p className="py-1 text-muted-foreground">
            {data?.error ? 'Release notes are unavailable right now.' : 'No published notes for this build yet.'}
          </p>
        )}
        {earlier.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2" data-testid="earlier-releases">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Earlier releases</span>
            {earlier.map((section) => (
              <details key={section.version} className="group rounded border border-border">
                <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs font-medium hover:bg-accent">
                  v{section.version}
                  {section.date ? <span className="ml-auto font-normal text-muted-foreground">{section.date}</span> : null}
                </summary>
                <div className={`${MARKDOWN_PROSE_CLASSES} px-2 pb-2`}>
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {section.body}
                  </Markdown>
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border p-1">{links}</div>
    </div>
  );
}
