import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuBug, LuExternalLink, LuFileText, LuLoaderCircle } from 'react-icons/lu';

import {
  NEW_ISSUE_URL,
  RELEASE_CHANGELOG_PAGE_URL,
  RELEASE_LIST_URL,
  releasePageUrl,
} from '@midnite/studio-shared';

import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { openExternal } from '../../services/queries';
import { useReleaseNotes } from './release-notes';

export function VersionNotesPanel({ version }: { version: string }) {
  const { data, isLoading } = useReleaseNotes(version);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <LuFileText aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">What&apos;s new in v{version}</span>
      </div>

      <div className="max-h-[min(60vh,20rem)] overflow-auto px-3 py-2 text-xs leading-relaxed">
        {isLoading ? (
          <p className="flex items-center gap-2 py-1 text-muted-foreground">
            <LuLoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
            Loading release notes…
          </p>
        ) : data?.notes ? (
          <div className={MARKDOWN_PROSE_CLASSES}>
            <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
              {data.notes}
            </Markdown>
          </div>
        ) : (
          <p className="py-1 text-muted-foreground">
            {data?.error
              ? 'Release notes are unavailable right now.'
              : 'No published notes for this build yet.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border p-1">
        <PanelLink icon={LuFileText} label="Full changelog" href={RELEASE_CHANGELOG_PAGE_URL} />
        <PanelLink
          icon={LuExternalLink}
          label="Release page"
          href={data?.notes ? releasePageUrl(version) : RELEASE_LIST_URL}
        />
        {/*
          The third of the links that stand whether or not the notes arrived
          (Phase 65 Theme E). Before it there was no way to report a bug from
          inside the app at all.

          **Packaged-only, by way of this panel.** `version-pill.tsx` hides
          itself on `'0.0.0'`, so in a dev build nothing opens this panel and
          this link is unreachable. That is deliberate rather than a gap: the
          same action also sits in `Settings ▸ Monitor ▸ Diagnostics`, which
          renders in every build, so the affordance exists either way and this
          one is simply the convenient copy beside the release notes.
        */}
        <PanelLink icon={LuBug} label="Report a bug" href={NEW_ISSUE_URL} />
      </div>
    </div>
  );
}

function PanelLink({
  icon: Icon,
  label,
  href,
}: {
  icon: typeof LuFileText;
  label: string;
  href: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openExternal(href)}
      title={href}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {label}
      <LuExternalLink aria-hidden className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}
