import { LuLayoutGrid, LuShieldCheck } from 'react-icons/lu';

import { appLogoHref, SITE_APPS } from '../../apps/catalog';
import { Button, Container, Eyebrow, Section, TypeIn, Typewriter, Wordmark } from '../../components';
import { anchorHref, hrefFor } from '../../routes';

import { LauncherMock } from './launcher-mock';

/**
 * The phrases the headline types through: what the suite is for, one part of
 * the day at a time, ending on the claim the rest add up to. Short, because the
 * line reserves the width of the longest.
 */
const PHRASES = [
  'for your code.',
  'for your agents.',
  'for your media.',
  'for your ideas.',
  'for your machine.',
  'for all of it.',
] as const;

/**
 * The hero: Midnite Apps, the launcher, and the suite it opens.
 *
 * Copy on the left, the launcher window on the right from `lg` up (stacked
 * below it on a phone). The launcher mark carries the page's one neon halo;
 * the window carries the motion, so the copy column stays still enough to read.
 *
 * `bare` on the `Section`, because this one owns its own height and padding.
 */
export const Hero = () => (
  <Section id="hero" label="Midnite Apps" bare className="relative isolate overflow-hidden">
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10"
      style={{
        background:
          'radial-gradient(ellipse 90% 70% at 20% 0%, var(--ws-accent-soft) 0%, transparent 60%),' +
          'radial-gradient(ellipse 70% 60% at 85% 15%, var(--ws-bg-elevated) 0%, transparent 65%)',
      }}
    />

    <Container className="relative pb-20 pt-28 sm:pb-28 sm:pt-36">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-14">
        <div className="flex flex-col items-start gap-6">
          {/* A box-shadow halo on a rounded box, not a `drop-shadow` filter, so the pulse never re-rasterises the image. */}
          <img
            src={appLogoHref('launcher')}
            alt=""
            width={56}
            height={56}
            className="ws-neon h-14 w-14 rounded-[1rem]"
          />

          <Eyebrow>Midnite Apps · macOS on Apple silicon</Eyebrow>

          {/* One `<h1>`: the wordmark names the product, the typewriter says what it is for. */}
          <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-6xl">
            <span className="block">
              <Wordmark product="Apps" />
            </span>
            <Typewriter phrases={PHRASES} className="text-accent" />
          </h1>

          <p className="max-w-prose text-base leading-relaxed text-fg-muted sm:text-lg">
            <TypeIn
              leadMs={0}
              text={`One launcher for ${SITE_APPS.length} desktop apps that share one frame: a terminal that survives restarts, a docked browser, the companion and your own agents come with every one of them. Install the ones you want, open them from one place, and let the launcher keep them current.`}
            />
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button href={anchorHref('early-access')} size="lg">
              Get Access
            </Button>
            <Button href={hrefFor('apps')} size="lg" variant="ghost" icon={<LuLayoutGrid />}>
              Explore the apps
            </Button>
          </div>

          <p className="flex items-center gap-2 text-sm text-fg-subtle">
            <LuShieldCheck aria-hidden="true" className="shrink-0" />
            <span>No analytics and no telemetry. Every update is checked against its published checksum.</span>
          </p>
        </div>

        <LauncherMock className="w-full" />
      </div>
    </Container>
  </Section>
);
