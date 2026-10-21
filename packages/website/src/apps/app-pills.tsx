import type { CSSProperties, ReactNode } from 'react';
import { LuApple, LuBox, LuLayers, LuTag } from 'react-icons/lu';

import type { VersionState } from '../pages/use-latest-version';

import { SECTION_LABELS, type SiteApp } from './catalog';

type PillProps = {
  children: ReactNode;
  icon?: ReactNode;
  /** Its place in the hero's cascade. */
  index: number;
  label?: string;
};

/**
 * One fact about the app, as a chip. Glass over the aurora: a translucent white
 * fill with a hairline border, so it reads on every app's colours without
 * borrowing any one of them.
 */
const Pill = ({ children, icon, index, label }: PillProps) => (
  <li
    className="ws-cascade inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-md"
    style={{ '--i': index } as CSSProperties}
    aria-label={label}
  >
    {icon ? (
      <span aria-hidden="true" className="text-white/80">
        {icon}
      </span>
    ) : null}
    {children}
  </li>
);

/**
 * What the version pill says for each state of the feed.
 *
 * Every app runs inside Studio today, so its version is Studio's. Nothing is
 * shown until the feed answers, rather than a placeholder that then changes
 * width under the reader; a feed that cannot be reached shows nothing at all,
 * because "unknown" is not a fact worth a chip.
 */
export const versionLabel = (version: VersionState): string | null => {
  if (version.status === 'released') return `v${version.version.replace(/^v/, '')}`;
  if (version.status === 'unreleased') return 'Pre-release';
  return null;
};

export type AppPillsProps = {
  app: SiteApp;
  version: VersionState;
  /** Where the pills join the hero's cascade; each one takes the next step. */
  startIndex?: number;
};

/**
 * The hero's row of facts: status, version, which part of the suite it
 * belongs to, where it runs, and the platform.
 */
export const AppPills = ({ app, version, startIndex = 0 }: AppPillsProps) => {
  const versionText = versionLabel(version);
  let i = startIndex;

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={`About Midnite ${app.name}`}>
      <Pill index={i++} label="Status: available">
        <span aria-hidden="true" className="ws-live-dot h-2 w-2 rounded-full bg-emerald-400" />
        Available
      </Pill>
      {versionText !== null ? (
        <Pill index={i++} icon={<LuTag />} label={`Version ${versionText}`}>
          {versionText}
        </Pill>
      ) : null}
      <Pill index={i++} icon={<LuLayers />}>
        {SECTION_LABELS[app.section]}
      </Pill>
      {app.id === 'studio' ? null : (
        <Pill index={i++} icon={<LuBox />}>
          Runs in Studio
        </Pill>
      )}
      <Pill index={i++} icon={<LuApple />}>
        macOS · Apple silicon
      </Pill>
    </ul>
  );
};

/** How many cascade steps `AppPills` takes for an app, so the next element can follow it. */
export const pillCount = (app: SiteApp, version: VersionState): number =>
  3 + (versionLabel(version) === null ? 0 : 1) + (app.id === 'studio' ? 0 : 1);
