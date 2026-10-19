import type { CSSProperties } from 'react';
import { LuSparkles } from 'react-icons/lu';

import { AppPills, pillCount } from '../../apps/app-pills';
import { Aurora } from '../../apps/aurora';
import { appLogoHref, spectrumVars, type SiteApp } from '../../apps/catalog';
import { Wordmark } from '../../components/wordmark';
import { anchorHref } from '../../routes';
import type { VersionState } from '../use-latest-version';

export type AppHeroProps = {
  app: SiteApp;
  version: VersionState;
  /** The slide this hero is the content of is the one in view. */
  active: boolean;
};

/** A cascade step, as the inline style `.ws-cascade` reads. */
const step = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

/**
 * One app's hero: the slide's whole content.
 *
 * Back to front: the aurora in the app's own spectrum, then the logo and name,
 * the tagline, the pills, the pitch, the features and the way to get it. Every
 * piece but the aurora is a `.ws-cascade` step, numbered in reading order, so
 * when the slide becomes active the hero assembles itself top to bottom; the
 * logo has its own entrance (`.ws-cascade-logo`) and lands first.
 *
 * It is a dark poster in both themes, which is why the copy here is white
 * rather than a theme token: it sits on the aurora, never on the page.
 *
 * `inert` while inactive, so a keyboard user tabbing through the page does not
 * land on the call to action of a slide that is off to one side and dimmed.
 */
export const AppHero = ({ app, version, active }: AppHeroProps) => {
  const afterPills = 3 + pillCount(app, version);

  return (
    <article
      aria-labelledby={`app-${app.id}-name`}
      className="relative isolate flex min-h-[34rem] overflow-hidden rounded-[2rem] border border-white/10 text-white shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] sm:min-h-[38rem]"
      style={spectrumVars(app.spectrum) as CSSProperties}
      inert={!active}
    >
      <Aurora />

      <div className="relative flex w-full flex-col justify-end gap-6 p-6 sm:p-10 lg:p-14">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
          <div className="ws-cascade-logo shrink-0">
            <div className="ws-float">
              <img
                src={appLogoHref(app.id)}
                alt=""
                width={112}
                height={112}
                draggable={false}
                className="h-20 w-20 select-none rounded-[1.4rem] shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)] sm:h-28 sm:w-28 sm:rounded-[1.8rem]"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <h2
              id={`app-${app.id}-name`}
              className="ws-cascade text-4xl font-semibold leading-none tracking-tight sm:text-6xl"
              style={step(0)}
            >
              <Wordmark tone="inherit" product={app.name} />
            </h2>
            <p className="ws-cascade text-base text-white/80 sm:text-xl" style={step(1)}>
              {app.tagline}
            </p>
          </div>
        </div>

        <AppPills app={app} version={version} startIndex={2} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-3">
            <p
              className="ws-cascade text-xs font-semibold uppercase tracking-[0.18em] text-white/60"
              style={step(afterPills)}
            >
              {app.like}
            </p>
            <p
              className="ws-cascade max-w-prose text-sm leading-relaxed text-white/85 sm:text-base"
              style={step(afterPills + 1)}
            >
              {app.vision}
            </p>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2" aria-label={`What is in Midnite ${app.name}`}>
            {app.features.map((feature, index) => (
              <li
                key={feature.label}
                className="ws-cascade rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md"
                style={step(afterPills + 2 + index)}
              >
                <p className="text-sm font-semibold text-white">{feature.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-white/70">{feature.blurb}</p>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="ws-cascade flex flex-wrap items-center gap-3"
          style={step(afterPills + 2 + app.features.length)}
        >
          <a
            href={anchorHref('early-access')}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition duration-base hover:bg-white/90"
          >
            <LuSparkles aria-hidden="true" />
            Get early access
          </a>
          <span className="text-xs text-white/60">Installed and opened from the Midnite Apps launcher</span>
        </div>
      </div>
    </article>
  );
};
