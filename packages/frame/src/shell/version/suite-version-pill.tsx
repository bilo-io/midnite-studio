import { Suspense, lazy } from 'react';

import { CHANGELOG_APP_IDS, RELEASE_LIST_URL, appReleasePageUrl, changelogPageUrl, type ChangelogAppId, type SuiteAppId } from '@midnite/studio-shared';

import { bridge } from '../../bridge';
import { KitPopover } from '../../kit/kit-ui';
import { ReleaseNotesLink } from './release-notes-link';
import { useSuiteReleaseNotes } from './use-suite-release-notes';

const ReleaseNotesPanel = lazy(() => import('./release-notes-panel').then((m) => ({ default: m.ReleaseNotesPanel })));

/**
 * The running build's version when this host can show its notes, else `null`. `0.0.0` is what the preload
 * reports when main passed no version (a browser or jsdom render): there is no build that is genuinely
 * 0.0.0, so nothing is drawn rather than claiming one. Studio's bridge has no `suiteReleaseNotes`, and its
 * rail wears its own pill.
 */
export function suiteVersion(app: SuiteAppId): { app: ChangelogAppId; version: string } | null {
  const b = bridge();
  const version = b?.appVersion;
  if (typeof version !== 'string' || version === '' || version === '0.0.0' || b?.suiteReleaseNotes === undefined) return null;
  // A suite app with no changelog of its own (not yet released) has nothing to link to either.
  const known = CHANGELOG_APP_IDS.find((id) => id === app);
  return known === undefined ? null : { app: known, version };
}

/**
 * The version button in a suite app's rail footer (Phase 131 Theme E): the same pill Studio wears, opening
 * the app's own changelog section, the three releases before it, and links that stand whether or not the
 * notes arrived. Studio's pill and this one share the panel body (`ReleaseNotesPanel`).
 */
export function SuiteVersionPill({ app: suiteApp, name, expanded }: { app: SuiteAppId; name: string; expanded: boolean }) {
  const found = suiteVersion(suiteApp);
  if (found === null) return null;
  const { app, version } = found;
  return (
    <KitPopover
      side="top"
      align={expanded ? 'start' : 'center'}
      label={`${name} v${version} — release notes`}
      testId="suite-version-pill"
      panelClassName="w-[22rem]"
      triggerClassName="flex h-[18px] items-center rounded-full bg-primary/10 px-2 font-mono text-[10px] font-medium leading-none text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary data-[open=true]:bg-primary/25"
      trigger={<span>v{version}</span>}
    >
      <Suspense fallback={null}>
        <Panel app={app} name={name} version={version} />
      </Suspense>
    </KitPopover>
  );
}

function Panel({ app, name, version }: { app: ChangelogAppId; name: string; version: string }) {
  const { data, isLoading } = useSuiteReleaseNotes(version);
  return (
    <ReleaseNotesPanel
      appName={name}
      version={version}
      data={data}
      isLoading={isLoading}
      links={
        <>
          <ReleaseNotesLink label="Full changelog" href={changelogPageUrl(app)} />
          <ReleaseNotesLink label="Release page" href={data?.notes ? appReleasePageUrl(app, version) : RELEASE_LIST_URL} />
        </>
      }
    />
  );
}

/**
 * The rail's bottom strip: the pill on a rule that lines up with the status bar's (`h-6`, the status bar's
 * own height), absolutely positioned against the fixed rail exactly as Studio's `RailVersion` is. Nothing is
 * drawn — no rule either — when there is no version to show.
 */
export function SuiteRailVersion({ app, name, expanded }: { app: SuiteAppId; name: string; expanded: boolean }) {
  if (suiteVersion(app) === null) return null;
  return (
    <div
      data-testid="suite-rail-version"
      className={`absolute inset-x-0 bottom-0 flex h-6 items-center border-t border-border ${expanded ? 'justify-start px-2' : 'justify-center px-1'}`}
    >
      <SuiteVersionPill app={app} name={name} expanded={expanded} />
    </div>
  );
}
