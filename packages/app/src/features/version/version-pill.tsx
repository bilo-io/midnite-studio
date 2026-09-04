import { Suspense, lazy } from 'react';
import { Popover } from '../../components/popover';
import { bridge } from '../../services/bridge';

const VersionNotesPanel = lazy(() =>
  import('./version-notes-panel').then((m) => ({ default: m.VersionNotesPanel })),
);

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
      <Suspense fallback={null}>
        <VersionNotesPanel version={version} />
      </Suspense>
    </Popover>
  );
}
