import { LuTerminal } from 'react-icons/lu';

import { Eyebrow, Heading, Lede, Reveal, Section } from '../../components';
import { HeroVideo } from '../hero/hero-video';
import { PilotVideo } from '../hero/pilot-video';

/**
 * Midnite Studio, the superset: every app beside every other in one window.
 * It is also what the apps run inside today, which makes it the thing worth
 * showing in motion, so the pilot and the screen recording live here.
 */
export const Studio = () => (
  <Section id="studio" label="Studio" className="bg-bg-sunken">
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-14">
      <Reveal>
        <div className="flex flex-col items-start gap-4">
          <Eyebrow>Midnite Studio</Eyebrow>
          <Heading level={2} typeIn>
            Or have all of it at once
          </Heading>
          <Lede typeIn>
            Studio holds every app in one window with one rail. At its centre is a git client for the
            whole loop around a repository: an interactive commit graph, worktrees under the repos
            they belong to, your real login shell, and the forge (pull requests, checks, reviews)
            beside them.
          </Lede>
          <p className="flex items-center gap-2 text-sm text-fg-subtle">
            <LuTerminal aria-hidden="true" className="shrink-0" />
            <span>
              Git is the real CLI, so your credential helpers, SSH agent and commit signing work
              with no configuration of ours.
            </span>
          </p>
        </div>
      </Reveal>

      <Reveal delay={120}>
        <PilotVideo className="w-full" />
      </Reveal>
    </div>

    <Reveal className="mt-14 sm:mt-20">
      <HeroVideo className="aspect-[16/10] w-full" />
    </Reveal>
  </Section>
);
