import { Eyebrow, Heading, Lede, Reveal, Section } from '../../components';

import { SERVICE_ROWS } from './rows';
import { ServiceRow } from './service-row';

/**
 * What you get out of it, as three rows.
 *
 * Features answers "what is in the window"; this section answers "what does
 * that let me do", which is why every row leads with an outcome and keeps the
 * mechanism in a *How it works* list underneath. The two sections deliberately
 * overlap in subject and not in shape: the same GitHub integration is a bullet
 * in a pillar card up there and a whole row down here, because a visitor
 * scanning for capabilities and a visitor deciding whether to install are
 * reading for different things.
 *
 * Each row reveals as a whole rather than per element — a heading, a paragraph
 * and a drawing arriving separately is three animations for one idea.
 */
export const Services = () => (
  <Section id="services" label="Services" className="bg-bg-sunken">
    <Reveal>
      <header className="flex flex-col gap-4">
        <Eyebrow>What it is for</Eyebrow>
        <Heading level={2} typeIn>
          Close the loop without leaving the window
        </Heading>
        <Lede typeIn>
          Three things the app is built to do end to end — automate a board, keep a review
          moving, and hold the whole development loop in one frame.
        </Lede>
      </header>
    </Reveal>

    <div className="mt-14 flex flex-col gap-16 sm:mt-20 sm:gap-24">
      {SERVICE_ROWS.map((row, index) => (
        <Reveal key={row.id}>
          <ServiceRow row={row} index={index} />
        </Reveal>
      ))}
    </div>
  </Section>
);
