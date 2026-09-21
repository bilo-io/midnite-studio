import { LuCheck } from 'react-icons/lu';

import { Button, Container, Eyebrow, GlowCard, Heading, Lede, Reveal } from '../components';
import { SiteNav } from '../components/site-nav';
import { anchorHref } from '../routes';
import { Footer } from '../sections/footer/footer';

/**
 * Published prices — mid-band picks from Phase 90 Decisions ($5–10 Individual,
 * $10–20 Team per seat). Both are two constants in one file and trivially
 * changeable.
 */
export const INDIVIDUAL_PRICE_USD = 8;
export const TEAM_PRICE_PER_SEAT_USD = 12;
export const TEAM_MIN_SEATS = 5;

type TierColumn = {
  name: string;
  price: string;
  detail: string;
  features: readonly string[];
  glow: 'soft' | 'accent' | 'lane-2';
  highlighted?: boolean;
};

const TIERS: readonly TierColumn[] = [
  {
    name: 'Free',
    price: '$0',
    detail: 'Public repositories, forever',
    features: [
      'Unlimited public repositories',
      'The full git client, terminal, and forge views',
      'Early access while the product is in preview',
    ],
    glow: 'soft',
  },
  {
    name: 'Individual',
    price: `$${INDIVIDUAL_PRICE_USD}`,
    detail: 'per month',
    features: [
      'Everything in Free',
      'Private repositories — the paid boundary',
      'One seat, one identity',
    ],
    glow: 'accent',
    highlighted: true,
  },
  {
    name: 'Team',
    price: `$${TEAM_PRICE_PER_SEAT_USD}`,
    detail: `per seat / month · ${TEAM_MIN_SEATS}-seat minimum`,
    features: [
      'Everything in Individual',
      'Shared team billing when checkout ships',
      'Seat-based access for your org',
    ],
    glow: 'lane-2',
  },
];

const TierCard = ({ tier, index }: { tier: TierColumn; index: number }) => (
  <Reveal delay={index * 80}>
    <GlowCard
      glow={tier.glow}
      interactive={tier.highlighted}
      className={tier.highlighted ? 'ring-1 ring-accent/30' : ''}
    >
      <Eyebrow className="text-fg-muted">{tier.name}</Eyebrow>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="font-mono text-4xl font-semibold tracking-tight text-fg">{tier.price}</span>
        {tier.detail ? (
          <span className="text-sm text-fg-muted">{tier.detail}</span>
        ) : null}
      </p>
      <ul className="mt-6 space-y-3">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm leading-relaxed text-fg-muted">
            <LuCheck aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Button href={anchorHref('early-access')} variant={tier.highlighted ? 'primary' : 'ghost'}>
          Join early access
        </Button>
      </div>
    </GlowCard>
  </Reveal>
);

/**
 * The pricing page.
 *
 * Three columns at desktop width, stacked on a phone. **No checkout, no Stripe,
 * no payment link** — the call to action is the early-access form the site
 * already has. Nothing here may link to `bilo-io/midnite-studio`; billing
 * questions belong in the public `bilo-io/midnite-apps` issue tracker.
 */
export const PricingPage = () => (
  <>
    <SiteNav offLanding />
    <main>
      <div className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 70% 0%, var(--ws-accent-soft) 0%, transparent 62%)',
          }}
        />
        <Container className="pb-12 pt-20 sm:pt-28">
          <div className="mx-auto max-w-2xl text-center">
            <Heading level={1}>Pricing</Heading>
            <Lede className="mt-4">
              Public repositories stay free. Private repositories are what the paid tiers unlock — the
              product boundary, not a feature checklist bolted on later.
            </Lede>
          </div>

          <div
            data-testid="pricing-columns"
            className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-stretch"
          >
            {TIERS.map((tier, index) => (
              <TierCard key={tier.name} tier={tier} index={index} />
            ))}
          </div>

          <p className="mx-auto mt-12 max-w-prose text-center text-sm leading-relaxed text-fg-subtle">
            Councils, Workflows and the Video Editor will sit behind a higher tier later — more in
            higher tiers, coming after checkout ships. This page shows three columns today; it does
            not invent a priced fourth column for surfaces that are not paywalled yet.
          </p>
        </Container>
      </div>
    </main>
    <Footer />
  </>
);
