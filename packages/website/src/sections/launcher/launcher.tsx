import type { CSSProperties, ReactNode } from 'react';
import { LuDownload, LuLayoutGrid, LuShieldCheck } from 'react-icons/lu';

import { Eyebrow, GlowCard, Heading, Lede, Reveal, Section, useInView } from '../../components';

type Step = { icon: ReactNode; title: string; body: string };

const STEPS: readonly Step[] = [
  {
    icon: <LuDownload />,
    title: 'Install the launcher',
    body: 'One app in /Applications, from one command or one download. It lists every midnite app and what each one is for.',
  },
  {
    icon: <LuLayoutGrid />,
    title: 'Pick your apps',
    body: 'Install the ones you want and open them from their tiles. Each tile remembers where you were.',
  },
  {
    icon: <LuShieldCheck />,
    title: 'Updates, verified',
    body: 'The launcher reads a feed per app, checks every download against its published SHA-256 checksum, and keeps the old copy until the new one verifies.',
  },
];

/**
 * How the launcher works, in three steps, plus the one honest caveat: every app
 * runs inside Studio today.
 */
export const Launcher = () => {
  const { ref, inView } = useInView<HTMLOListElement>();

  return (
    <Section id="launcher" label="Launcher" className="bg-bg-sunken">
      <Reveal>
        <div className="flex flex-col items-start gap-4">
          <Eyebrow>Midnite Apps</Eyebrow>
          <Heading level={2} typeIn>
            One place to get them all
          </Heading>
          <Lede typeIn>
            The launcher installs, opens and updates every app in the suite, so there is one thing
            to download and nothing to keep track of by hand.
          </Lede>
        </div>
      </Reveal>

      <ol ref={ref} className={`mt-12 grid gap-5 md:grid-cols-3 ${inView ? 'ws-cascade-in' : ''}`}>
        {STEPS.map((step, index) => (
          <li key={step.title} className="ws-cascade" style={{ '--i': index * 2 } as CSSProperties}>
            <GlowCard className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent"
                >
                  {step.icon}
                </span>
                <span className="font-mono text-sm text-fg-subtle">0{index + 1}</span>
              </div>
              <h3 className="text-lg font-semibold text-fg">{step.title}</h3>
              <p className="text-sm leading-relaxed text-fg-muted">{step.body}</p>
            </GlowCard>
          </li>
        ))}
      </ol>

      <Reveal className="mt-8">
        <p className="max-w-prose text-sm text-fg-subtle">
          Today every app runs inside Midnite Studio, the app that holds all of them in one
          window: opening Coder from the launcher opens Studio on Coder. As each app ships as its
          own bundle, the launcher installs that one instead, and its tile stays where it is.
        </p>
      </Reveal>
    </Section>
  );
};
