import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuExternalLink, LuFileText, LuLoaderCircle } from 'react-icons/lu';

import {
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
