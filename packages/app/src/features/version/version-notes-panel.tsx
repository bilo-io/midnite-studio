import { useEffect, useState } from 'react';
import { LuBug, LuExternalLink, LuFileText } from 'react-icons/lu';

import { RELEASE_CHANGELOG_PAGE_URL, RELEASE_LIST_URL, releasePageUrl } from '@midnite/studio-shared';

import { ReportIssueDialog } from '@midnite/studio-feature-report/renderer';
import { ExternalLink } from '../markdown/external-link';
import { ReleaseNotesPanel } from '@midnite/studio-frame';
import { openExternal } from '../../services/queries';
import { PresentButton, useSlidesStore } from '@midnite/studio-feature-slides/renderer';
import { useReleaseNotes } from './release-notes';

/** How many earlier releases the drop-up lists beneath the current one. */
const PREVIOUS_COUNT = 3;

export function VersionNotesPanel({ version }: { version: string }) {
  const { data, isLoading } = useReleaseNotes(version, PREVIOUS_COUNT + 1);
  const label = `Release ${version}`;
  const [reportOpen, setReportOpen] = useState(false);

  // A single document-level body — claims `activeMarkdown` (Phase 29 Theme F,
  // the rule stated in `slides-store.ts`). Release notes are the one surface
  // in the app a human would plausibly actually present. Skipped while notes
  // haven't arrived, cleared on unmount.
  useEffect(() => {
    if (!data?.notes) return;
    useSlidesStore.getState().setActiveMarkdown({ content: data.notes, label });
    return () => useSlidesStore.getState().setActiveMarkdown(null);
  }, [data?.notes, label]);

  return (
    <>
      <ReleaseNotesPanel
        appName="Midnite Studio"
        version={version}
        data={data}
        isLoading={isLoading}
        headerAction={data?.notes ? <PresentButton source={{ content: data.notes, label }} /> : undefined}
        markdownComponents={{ a: ExternalLink }}
        earlierCount={PREVIOUS_COUNT}
        links={
          <>
            <PanelLink icon={LuFileText} label="Full changelog" href={RELEASE_CHANGELOG_PAGE_URL} />
            <PanelLink
              icon={LuExternalLink}
              label="Release page"
              href={data?.notes ? releasePageUrl(version) : RELEASE_LIST_URL}
            />
            {/*
              The third of the links that stand whether or not the notes arrived
              (Phase 65 Theme E). Before it there was no way to report a bug from
              inside the app at all. Phase 93 Theme C: opens the same in-app
              composer `monitor-page.tsx`'s "Report a bug" does, rather than
              `openExternal` directly — no `href`, so `PanelLink` skips the
              external-link chevron it wears for the other two rows.

              **Packaged-only, by way of this panel.** `version-pill.tsx` hides
              itself on `'0.0.0'`, so in a dev build nothing opens this panel and
              this link is unreachable. That is deliberate rather than a gap: the
              same action also sits in `Settings ▸ Monitor ▸ Diagnostics`, which
              renders in every build, so the affordance exists either way and this
              one is simply the convenient copy beside the release notes.
            */}
            <PanelLink icon={LuBug} label="Report a bug" onClick={() => setReportOpen(true)} />
          </>
        }
      />
      <ReportIssueDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}

function PanelLink({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: typeof LuFileText;
  label: string;
  /** Omit alongside `onClick` for an action that isn't a plain external navigation. */
  href?: string;
  /** Overrides the default `openExternal(href)` click — and drops the trailing chevron, since the action no longer just opens a link. */
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      // Deliberately `openExternal`, not `openInMidnite` (Phase 71 Theme B),
      // for the two rows that still just open a link: release notes are read
      // once and never returned to.
      onClick={onClick ?? (() => href && openExternal(href))}
      title={href ?? label}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {label}
      {href && !onClick ? (
        <LuExternalLink aria-hidden className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      ) : null}
    </button>
  );
}
