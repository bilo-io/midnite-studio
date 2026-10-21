import { useCallback, useState, type CSSProperties } from 'react';
import { LuSparkles } from 'react-icons/lu';

import { appIndexFromHash, SITE_APPS } from '../../apps/catalog';
import { Button, Container, Eyebrow, Heading, Lede, Reveal } from '../../components';
import { SiteNav } from '../../components/site-nav';
import { anchorHref } from '../../routes';
import { Footer } from '../../sections/footer/footer';
import { useLatestVersion } from '../use-latest-version';

import { AppsCarousel } from './apps-carousel';

/**
 * The Apps page: every available midnite app, one hero at a time.
 *
 * The page owns which app is in view so the glow behind everything
 * (`.ws-apps-glow`) can take that app's colours and cross-fade to the next
 * one's as the carousel moves; the carousel reports the index and does the
 * scrolling. It opens on the app a `#coder` fragment names, else the first.
 *
 * The version comes from Studio's feed, not the launcher's: every app runs
 * inside Studio today, so Studio's version is the one a visitor would be using.
 */
export const AppsPage = () => {
  const [active, setActive] = useState(() =>
    typeof window === 'undefined' ? 0 : (appIndexFromHash(window.location.hash) ?? 0),
  );
  const onActiveChange = useCallback((index: number) => setActive(index), []);
  const version = useLatestVersion('midnite-studio');
  const app = SITE_APPS[active] ?? SITE_APPS[0];

  const glow = app
    ? ({ '--app-glow-a': app.spectrum[1], '--app-glow-b': app.spectrum[3] } as CSSProperties)
    : undefined;

  return (
    <>
      <div aria-hidden="true" className="ws-apps-glow" style={glow} />
      <SiteNav offLanding current="apps" />
      <main>
        <Container className="flex flex-col items-start gap-4 pb-8 pt-14 sm:pb-12 sm:pt-20">
          <Reveal>
            <Eyebrow>The suite</Eyebrow>
          </Reveal>
          <Reveal delay={90}>
            <Heading level={1}>
              {SITE_APPS.length} apps. One launcher.
            </Heading>
          </Reveal>
          <Reveal delay={180}>
            <Lede>
              Each one does one job well, and each one is built on the same frame, so the terminal,
              the browser, the companion and your agents come with every one of them. Swipe through,
              then open the ones you want from Midnite Apps.
            </Lede>
          </Reveal>
        </Container>

        <AppsCarousel
          apps={SITE_APPS}
          active={active}
          onActiveChange={onActiveChange}
          version={version}
        />

        <Container className="py-20 sm:py-28">
          <Reveal className="flex flex-col items-center gap-5 text-center">
            <Heading level={2}>Get them all from one place</Heading>
            <Lede className="mx-auto">
              Midnite Apps installs, updates and opens every app on this page. Ask for early access
              to get the launcher.
            </Lede>
            <Button href={anchorHref('early-access')} size="lg" icon={<LuSparkles />}>
              Get Access
            </Button>
          </Reveal>
        </Container>
      </main>
      <Footer />
    </>
  );
};
