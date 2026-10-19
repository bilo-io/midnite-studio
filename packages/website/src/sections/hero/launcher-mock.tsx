import type { CSSProperties } from 'react';

import { Aurora } from '../../apps/aurora';
import {
  appLogoHref,
  appsIn,
  LAUNCHER_SPECTRUM,
  SECTION_LABELS,
  spectrumVars,
  type SiteAppSection,
} from '../../apps/catalog';
import { useInView } from '../../components';
import { appHref } from '../../routes';

export type LauncherMockProps = { className?: string };

const GROUPS: readonly SiteAppSection[] = ['suite', 'utilities'];

/**
 * The hero's picture of the product: a launcher window, drawn rather than
 * screenshotted, with every available app as a tile.
 *
 * Drawn, because the tiles are the real catalog (`apps/catalog.ts`) and each
 * one links to its own slide on the Apps page, which a screenshot cannot do.
 * The tiles cascade in once the window scrolls into view and then drift on
 * staggered periods, so the grid never moves in lockstep.
 *
 * A dark window in both themes, like the app heroes it links to: it sits on
 * the launcher's own aurora.
 */
export const LauncherMock = ({ className = '' }: LauncherMockProps) => {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });
  let i = 0;

  return (
    <div
      ref={ref}
      className={`relative isolate overflow-hidden rounded-[1.6rem] border border-white/10 text-white shadow-[0_40px_90px_-30px_rgb(0_0_0/0.75)] ${inView ? 'ws-cascade-in' : ''} ${className}`}
      style={spectrumVars(LAUNCHER_SPECTRUM) as CSSProperties}
    >
      <Aurora />

      <div className="relative flex items-center gap-2 border-b border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md">
        <span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span aria-hidden="true" className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs font-medium text-white/70">Midnite Apps</span>
      </div>

      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/60">
              {group === 'suite' ? 'Apps' : `${SECTION_LABELS[group]} apps`}
            </p>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
              {appsIn(group).map((app) => {
                const index = i++;
                return (
                  <li key={app.id} className="ws-cascade" style={{ '--i': index } as CSSProperties}>
                    <a
                      href={appHref(app.id)}
                      className="group flex flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center outline-none transition duration-base hover:bg-white/10 focus-visible:bg-white/10"
                    >
                      <span
                        className="ws-tile-float block"
                        style={
                          {
                            '--float-s': `${5 + (index % 4)}s`,
                            '--float-delay': `${-(index * 0.7).toFixed(1)}s`,
                          } as CSSProperties
                        }
                      >
                        <img
                          src={appLogoHref(app.id)}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          draggable={false}
                          className="h-12 w-12 select-none rounded-[0.9rem] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)] transition duration-base group-hover:scale-110 sm:h-14 sm:w-14 sm:rounded-[1rem]"
                        />
                      </span>
                      <span className="text-[0.7rem] font-medium text-white/85">{app.name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
