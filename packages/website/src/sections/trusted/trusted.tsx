import { Eyebrow, Heading, Lede, Reveal, Section } from '../../components';

import { AgentMarquee } from './agent-marquee';
import { SITE_AGENTS } from './agents';

/**
 * The agent banner: "use your favourite agents".
 *
 * The claim this section makes is narrow and true — the app ships a roster of
 * agent CLIs it can launch in its own terminal, and these ten are that roster,
 * copied field-for-field in `agents.ts`. It is deliberately **not** a
 * "trusted by" wall: no logo here belongs to a company that has endorsed
 * anything, and the copy says what the logos actually mean so nobody reads them
 * as customers.
 *
 * The section keeps the registry id `trusted` — a published URL fragment, and
 * the siblings' anchors point at it — while the nav label changes from
 * "Built on" to "Agents", which is what the band is about.
 */
export const Trusted = () => (
  <Section id="trusted" label="Agents" className="bg-bg-sunken">
    <Reveal>
      <div className="flex flex-col items-center gap-4 text-center">
        <Eyebrow>Bring your own agent</Eyebrow>
        <Heading level={2} typeIn>
          Use your favourite agents
        </Heading>
        <Lede className="text-center" typeIn>
          {SITE_AGENTS.length} coding agents ship in the roster, each one launched in a real
          login shell in a docked terminal — so its own auth, its own config and its own
          resume flag all work exactly as they do outside the app. Adding one more is an edit
          to a JSON file, not a release.
        </Lede>
      </div>
    </Reveal>

    <AgentMarquee className="mt-12 sm:mt-16" />
  </Section>
);
