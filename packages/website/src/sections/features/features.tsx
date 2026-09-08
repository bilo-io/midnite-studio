import { useState } from 'react';

import { Eyebrow, Heading, Lede, Reveal, Section } from '../../components';

import { PillarCard } from './pillar-card';
import { PILLARS, type Pillar } from './pillars';
import { Showcase } from './showcase';

/**
 * What the app does, as three pillars.
 *
 * **One copy of the content, two layouts.** On `lg` and up the three cards sit
 * side by side and the segment control is hidden; below it the control shows and
 * every card but the selected one is `hidden`. The alternative — a tab strip
 * with its own markup beside a grid with its own — would put each pillar in the
 * DOM twice, which duplicates the copy, doubles the headings a screen reader
 * walks, and means a change to a bullet has two places to land. So the switch
 * is a CSS one, and `active` only decides anything on a narrow screen.
 *
 * The control is a **segment control, not a tab list**: buttons with
 * `aria-pressed`, each pointing at the card it reveals with `aria-controls`.
 * Real `role="tab"` semantics would be a lie at the wide breakpoint, where the
 * control is display:none and all three panels are on screen at once — a tab
 * panel with no tab is worse than a pressed button that is honest about being
 * one.
 *
 * Three stacked cards of three bullets each is the wall this is avoiding: on a
 * phone the section is one card tall and the other two are one tap away.
 */
export const Features = () => {
  const [active, setActive] = useState<Pillar['id']>(PILLARS[0]?.id ?? 'git');

  return (
    <Section id="features" label="Features">
      <Reveal>
        <header className="flex flex-col gap-4">
          <Eyebrow>What it does</Eyebrow>
          <Heading level={2} typeIn>
            Three surfaces, one window
          </Heading>
          <Lede typeIn>
            A git client, a workbench for agents, and a browser — sharing a window, a theme
            and the repository you have open. The UI follows that repository live, so a
            commit made in the terminal shows up in the graph without a refresh.
          </Lede>
        </header>
      </Reveal>

      <div
        role="group"
        aria-label="Choose a pillar"
        className="mt-10 flex gap-1 rounded-full border border-line bg-bg-elevated p-1 lg:hidden"
      >
        {PILLARS.map(({ id, name, Icon }) => {
          const selected = id === active;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              aria-controls={`pillar-${id}`}
              onClick={() => setActive(id)}
              className={[
                'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2',
                'text-sm font-medium transition duration-base',
                selected
                  ? 'bg-accent text-accent-fg'
                  : 'text-fg-muted hover:text-fg',
              ].join(' ')}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {name}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:mt-14 lg:grid-cols-3">
        {PILLARS.map((pillar, index) => (
          <Reveal
            key={pillar.id}
            delay={index * 90}
            className={pillar.id === active ? '' : 'hidden lg:block'}
          >
            <div
              id={`pillar-${pillar.id}`}
              role="group"
              aria-labelledby={`pillar-${pillar.id}-name`}
              className="h-full"
            >
              <PillarCard pillar={pillar} headingId={`pillar-${pillar.id}-name`} />
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120}>
        <Showcase />
      </Reveal>
    </Section>
  );
};
