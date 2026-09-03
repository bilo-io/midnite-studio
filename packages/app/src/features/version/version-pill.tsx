import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuExternalLink, LuFileText, LuLoaderCircle } from 'react-icons/lu';

import {
  RELEASE_CHANGELOG_PAGE_URL,
  RELEASE_LIST_URL,
  releasePageUrl,
} from '@midnite/studio-shared';

import { Popover } from '../../components/popover';
import { ExternalLink } from '../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../markdown/prose';
import { bridge } from '../../services/bridge';
import { openExternal } from '../../services/queries';
import { useReleaseNotes } from './release-notes';

/**
 * The running build's version, as a button that opens its release notes.
 *
 * Modelled on midnite web's own version pill: the version string *is* the
 * trigger, and what it opens is this version's `## [x.y.z]` changelog section
 * plus two links that stand whether or not the notes arrived — the full
 * changelog and this release's page. Notes fail soft for a reason that is
 * structural rather than defensive: the public mirror gains a version's section
 * when that version's tag publishes, so a freshly-built or pre-release app
 * legitimately has nothing to show, and the links are the whole value of the
 * panel in exactly that case.
 *
 * `0.0.0` is what the preload reports when main did not pass a version — a
 * browser/jsdom render, or a preload switch that went missing. There is no
 * build that is genuinely 0.0.0, so the pill hides rather than claiming one.
 */
export function VersionPill({ expanded = true }: { expanded?: boolean }) {
  const version = bridge()?.appVersion ?? '0.0.0';
  if (version === '0.0.0') return null;
  return <Pill version={version} expanded={expanded} />;
}

function Pill({ version, expanded }: { version: string; expanded: boolean }) {
  return (
    <Popover
      side="top"
      align={expanded ? 'start' : 'center'}
      label={`Midnite Studio v${version} — release notes`}
      testId="version-pill"
      panelClassName="w-[22rem]"
      /*
        The one pill in the app that takes the *selected* accent rather than a
        neutral surface — it names the build, which is the one fact about this
        window that is about the app itself. Hover deepens the same tint rather
        than swapping to `accent`, so the colour never changes identity under
        the pointer; `data-[open=true]` holds that deepened state while the
        panel is up, which is what stops the pill reading as dismissed the
        moment the pointer leaves it.
      */
      triggerClassName="flex h-[18px] items-center rounded-full bg-primary/10 px-2 font-mono text-[10px] font-medium leading-none text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary data-[open=true]:bg-primary/25"
      trigger={<span>v{version}</span>}
    >
      <Panel version={version} />
    </Popover>
  );
}

function Panel({ version }: { version: string }) {
  // Mounted only while the popover is open (the panel is not rendered
  // otherwise), so the query's `enabled` is simply `true` here — the laziness
  // is the mount, not a flag this component has to track a second time.
  const { data, isLoading } = useReleaseNotes(version, true);

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
          // Every published build has a namespaced tag; a build that has not been
          // released has no tag page at all, so an unfetchable section is also
          // the signal to send the user to the list instead of a 404.
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
