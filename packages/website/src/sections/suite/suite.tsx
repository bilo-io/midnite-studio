import type { CSSProperties } from 'react';
import { LuArrowUpRight } from 'react-icons/lu';

import {
  appLogoHref,
  appsIn,
  SECTION_LABELS,
  spectrumVars,
  type SiteAppSection,
} from '../../apps/catalog';
import { Button, Eyebrow, Heading, Lede, Reveal, Section, useInView } from '../../components';
import { appHref, hrefFor } from '../../routes';

const GROUP_COPY: Record<SiteAppSection, { title: string; blurb: string }> = {
  suite: { title: 'Apps', blurb: 'One job each, for the work and the rest of the day.' },
  utilities: {
    title: `${SECTION_LABELS.utilities} apps`,
    blurb: 'Small tools for the machine underneath.',
  },
};

/** One group of app cards, cascading in once it scrolls into view. */
const SuiteGroup = ({ group }: { group: SiteAppSection }) => {
  const { ref, inView } = useInView<HTMLUListElement>();
  const copy = GROUP_COPY[group];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-fg">{copy.title}</h3>
        <p className="text-sm text-fg-muted">{copy.blurb}</p>
      </div>
      <ul
        ref={ref}
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${inView ? 'ws-cascade-in' : ''}`}
      >
        {appsIn(group).map((app, index) => (
          <li key={app.id} className="ws-cascade" style={{ '--i': index } as CSSProperties}>
            <a
              href={appHref(app.id)}
              className="ws-app-card flex h-full flex-col gap-4 rounded-2xl border border-line bg-bg-elevated p-5 outline-none"
              style={spectrumVars(app.spectrum) as CSSProperties}
            >
              <div className="flex items-center gap-4">
                <img
                  src={appLogoHref(app.id)}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  draggable={false}
                  className="h-12 w-12 shrink-0 select-none rounded-[0.85rem]"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg">Midnite {app.name}</p>
                  <p className="text-sm text-fg-muted">{app.tagline}</p>
                </div>
                <LuArrowUpRight aria-hidden="true" className="shrink-0 text-fg-subtle" />
              </div>
              <p className="text-sm leading-relaxed text-fg-muted">{app.vision}</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * The suite: every available app as a card, in the launcher's two groups.
 * Each card links to that app's slide on the Apps page.
 */
export const Suite = () => (
  <Section id="suite" label="Suite">
    <Reveal>
      <div className="flex flex-col items-start gap-4">
        <Eyebrow>The suite</Eyebrow>
        <Heading level={2} typeIn>
          An app for each part of the day
        </Heading>
        <Lede typeIn>
          Each one does one job, and each one is built on the same frame, so moving between them
          feels like moving between rooms of one house rather than between vendors.
        </Lede>
      </div>
    </Reveal>

    <div className="mt-12 flex flex-col gap-14">
      <SuiteGroup group="suite" />
      <SuiteGroup group="utilities" />
    </div>

    <Reveal className="mt-12">
      <Button href={hrefFor('apps')} variant="ghost">
        See every app up close
      </Button>
    </Reveal>
  </Section>
);
