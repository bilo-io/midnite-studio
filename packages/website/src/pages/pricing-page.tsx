import { useState } from 'react';

import { LuCheck, LuMinus } from 'react-icons/lu';

import { Button, Container, GlowCard, Heading, Lede, Reveal } from '../components';
import { SiteNav } from '../components/site-nav';
import { anchorHref } from '../routes';
import { Footer } from '../sections/footer/footer';

/**
 * Published prices — the settled figures (three tiers, a 17% yearly
 * discount). Starter has no numeric price; the other five constants below
 * are what `priceFor` reads to build every price shown on the page, in both
 * billing modes, so a figure changes in exactly one place.
 */
export const PRO_MONTHLY_USD = 5;
export const PRO_YEARLY_USD = 50;
export const PRO_YEARLY_STRUCK_USD = 60;
export const MAX_MONTHLY_USD = 10;
export const MAX_YEARLY_USD = 100;
export const MAX_YEARLY_STRUCK_USD = 120;
export const YEARLY_DISCOUNT_LABEL = '-17%';

export type BillingPeriod = 'monthly' | 'yearly';
type TierId = 'starter' | 'pro' | 'max';

type TierColumn = {
  id: TierId;
  name: string;
  /** The small line under the tier name, inside the card. */
  subtitle: string;
  recommended?: boolean;
  features: readonly string[];
};

const TIERS: readonly TierColumn[] = [
  {
    id: 'starter',
    name: 'Starter',
    subtitle: 'Early riser',
    features: [
      'Unlimited public repositories',
      'The full git client, terminal and forge views',
      'All ten coding agents, no limits',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    subtitle: 'Nightowl',
    recommended: true,
    features: [
      'Everything in Starter',
      'Private repositories, the paid boundary',
      'Loops and kanban-driven agent runs',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    subtitle: 'Insomniac',
    features: [
      'Everything in Pro',
      'Seat-based access for your whole team',
      'Shared team billing',
    ],
  },
];

type PriceDisplay = {
  price: string;
  period: string;
  /** The pre-discount figure, struck through — yearly only, paid tiers only. */
  struck?: string;
};

/** Every price shown on the page, for one tier in one billing mode. */
const priceFor = (tier: TierId, billing: BillingPeriod): PriceDisplay => {
  if (tier === 'starter') return { price: 'Free', period: 'forever' };
  if (tier === 'pro') {
    return billing === 'yearly'
      ? { price: `$${PRO_YEARLY_USD}`, period: 'per year', struck: `$${PRO_YEARLY_STRUCK_USD}` }
      : { price: `$${PRO_MONTHLY_USD}`, period: 'per month' };
  }
  return billing === 'yearly'
    ? { price: `$${MAX_YEARLY_USD}`, period: 'per seat / year', struck: `$${MAX_YEARLY_STRUCK_USD}` }
    : { price: `$${MAX_MONTHLY_USD}`, period: 'per seat / month' };
};

type FeatureRow = {
  label: string;
  starter: boolean;
  pro: boolean;
  max: boolean;
};

/**
 * The comparison table's rows — every claim on this list is one the site
 * already makes elsewhere (the FAQ, the Features section): the public/private
 * boundary, the full window (git client, terminal, forge), the ten-agent
 * roster, loops and the kanban board, and seat-based team billing. Nothing
 * here invents a capability the product does not have.
 */
const FEATURE_ROWS: readonly FeatureRow[] = [
  { label: 'Unlimited public repositories', starter: true, pro: true, max: true },
  { label: 'Private repositories', starter: false, pro: true, max: true },
  {
    label: 'The full git client, terminal and forge in one window',
    starter: true,
    pro: true,
    max: true,
  },
  { label: 'All ten coding agents (Claude, Codex, Copilot and more)', starter: true, pro: true, max: true },
  { label: 'Loops and kanban-driven agent runs', starter: false, pro: true, max: true },
  { label: 'Multiple seats on one team', starter: false, pro: false, max: true },
  { label: 'Shared team billing', starter: false, pro: false, max: true },
  { label: 'Priority early-access support', starter: false, pro: true, max: true },
];

/** The switch's thumb position and the track's brand-coloured fill. */
const BillingToggle = ({
  billing,
  onChange,
}: {
  billing: BillingPeriod;
  onChange: (billing: BillingPeriod) => void;
}) => {
  const isYearly = billing === 'yearly';

  const monthlyClass = isYearly
    ? 'text-sm font-medium text-fg-subtle'
    : 'ws-pricing-pulse text-sm font-semibold text-fg';

  const yearlyClass = isYearly
    ? 'ws-rainbow-text ws-pricing-yearly-glow text-sm font-semibold'
    : 'text-sm font-medium text-fg-subtle';

  return (
    <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-4">
      <span className={monthlyClass}>Monthly</span>
      <button
        type="button"
        role="switch"
        aria-checked={isYearly}
        aria-label="Toggle monthly or yearly billing"
        onClick={() => onChange(isYearly ? 'monthly' : 'yearly')}
        className="relative h-7 w-14 shrink-0 rounded-full border border-line-strong bg-bg-elevated transition-colors duration-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          aria-hidden="true"
          className={`ws-rainbow-fill absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform duration-base ${
            isYearly ? 'translate-x-7' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="flex items-center gap-2">
        <span className={yearlyClass}>Yearly</span>
        {isYearly ? (
          <span
            data-testid="yearly-toggle-badge"
            className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg"
          >
            {YEARLY_DISCOUNT_LABEL}
          </span>
        ) : null}
      </span>
    </div>
  );
};

const TierCard = ({
  tier,
  billing,
  index,
}: {
  tier: TierColumn;
  billing: BillingPeriod;
  index: number;
}) => {
  const { price, period, struck } = priceFor(tier.id, billing);
  const isPro = tier.id === 'pro';
  const isMax = tier.id === 'max';
  const showDiscountBadge = billing === 'yearly' && tier.id !== 'starter';

  return (
    <Reveal delay={index * 80} className="h-full">
      <GlowCard
        glow={isPro ? 'accent' : isMax ? 'lane-3' : 'soft'}
        interactive={tier.recommended}
        className={[
          'relative flex h-full flex-col',
          isPro ? 'ws-pricing-pro-card ring-1 ring-white/30' : '',
          isMax ? 'ws-pricing-invert' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {tier.recommended ? (
          <span className="absolute -top-3 left-6 rounded-full border border-white/40 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
            Recommended
          </span>
        ) : null}

        <p
          className={`text-sm font-semibold uppercase tracking-[0.14em] ${
            isPro ? 'text-white/80' : 'text-fg-muted'
          }`}
        >
          {tier.name}
        </p>
        <p className={`mt-1 text-sm ${isPro ? 'text-white/70' : 'text-fg-subtle'}`}>{tier.subtitle}</p>

        <div className="mt-5 flex flex-wrap items-baseline gap-2">
          {struck ? (
            <span className={`text-lg line-through ${isPro ? 'text-white/50' : 'text-fg-subtle'}`}>
              {struck}
            </span>
          ) : null}
          <span
            className={`font-mono text-4xl font-semibold tracking-tight ${isPro ? 'text-white' : 'text-fg'}`}
          >
            {price}
          </span>
          {period ? (
            <span className={`text-sm ${isPro ? 'text-white/70' : 'text-fg-muted'}`}>{period}</span>
          ) : null}
          {showDiscountBadge ? (
            <span
              data-testid={`${tier.id}-discount-badge`}
              className={
                isPro
                  ? 'rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white'
                  : 'rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg'
              }
            >
              {YEARLY_DISCOUNT_LABEL}
            </span>
          ) : null}
        </div>

        <ul className="mt-6 flex-1 space-y-3">
          {tier.features.map((feature) => (
            <li
              key={feature}
              className={`flex gap-2 text-sm leading-relaxed ${isPro ? 'text-white/90' : 'text-fg-muted'}`}
            >
              <LuCheck aria-hidden="true" className={`mt-0.5 shrink-0 ${isPro ? 'text-white' : 'text-accent'}`} />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Button
            href={anchorHref('early-access')}
            variant="ghost"
            className={isPro ? '!border-white/70 !bg-white/10 !text-white hover:!border-white hover:!bg-white/20' : ''}
          >
            Join early access
          </Button>
        </div>
      </GlowCard>
    </Reveal>
  );
};

/** One `<th>`/`<td>` cell of the comparison table's per-tier styling. */
const TABLE_HEADER_CLASS: Record<TierId, string> = {
  starter: 'bg-bg-elevated text-fg',
  pro: 'ws-pricing-pro-card text-white',
  max: 'ws-pricing-invert bg-bg-elevated text-fg',
};

const ComparisonCell = ({ included }: { included: boolean }) =>
  included ? (
    <>
      <LuCheck aria-hidden="true" className="mx-auto text-accent" />
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <LuMinus aria-hidden="true" className="mx-auto text-fg-subtle" />
      <span className="sr-only">Not included</span>
    </>
  );

const ComparisonTable = () => (
  <div className="mt-8 rounded-lg border border-line" data-testid="pricing-table">
    {/*
      No `overflow-x-auto` wrapper: setting `overflow-x` to anything but
      `visible` forces the used value of `overflow-y` to `auto` too (the CSS
      overflow spec disallows a visible/non-visible pair), which quietly turns
      this div into a *scroll container* — and a `position: sticky`
      descendant sticks to its nearest scroll container, not the viewport.
      With that container never actually scrolling (it is sized to its
      content), the header stuck to the wrong box and the row above it
      visibly bled through while the page scrolled. Dropping the wrapper
      keeps `position: sticky` anchored to the real, page-scrolling viewport;
      the table instead shrinks its own padding and type size at `sm:` so
      four columns still fit a phone width without a scrollbar.

      `border-separate` + zero spacing, not `border-collapse`, for the same
      family of reason: a collapsed table computes shared borders between
      adjacent cells, which also fights sticky positioning in Chromium.
      Separate borders keep the per-row `border-t` below intact with no
      visible seam, since spacing is zero.
    */}
    <table className="w-full border-separate border-spacing-0 text-left text-xs sm:text-sm">
      <thead>
        <tr>
          <th
            scope="col"
            className="sticky top-16 z-10 bg-bg px-2 py-3 font-medium text-fg-muted sm:px-4"
          >
            Feature
          </th>
          {TIERS.map((tier) => (
            <th
              key={tier.id}
              scope="col"
              className={`sticky top-16 z-10 px-2 py-3 text-center font-semibold sm:px-4 ${TABLE_HEADER_CLASS[tier.id]}`}
            >
              {tier.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {FEATURE_ROWS.map((row) => (
          <tr key={row.label} className="border-t border-line">
            <th scope="row" className="px-2 py-3 text-left font-normal text-fg-muted sm:px-4">
              {row.label}
            </th>
            <td className="px-2 py-3 text-center sm:px-4">
              <ComparisonCell included={row.starter} />
            </td>
            <td className="px-2 py-3 text-center sm:px-4">
              <ComparisonCell included={row.pro} />
            </td>
            <td className="px-2 py-3 text-center sm:px-4">
              <ComparisonCell included={row.max} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * The pricing page.
 *
 * Three columns at desktop width, stacked on a phone, with a feature
 * comparison table underneath. **No checkout, no Stripe, no payment link** —
 * the call to action is the early-access form the site already has. Nothing
 * here may link to `bilo-io/midnite-studio`; billing questions belong in the
 * public `bilo-io/midnite-apps` issue tracker.
 */
export const PricingPage = () => {
  const [billing, setBilling] = useState<BillingPeriod>('yearly');

  return (
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
              <Heading level={1} className="ws-rainbow-text ws-pricing-title-glow inline-block w-fit">
                Pricing
              </Heading>
              <Lede className="mx-auto mt-4">
                Public repositories stay free. Private repositories and team seats are what the paid
                tiers unlock, the product boundary rather than a feature checklist bolted on later.
              </Lede>
            </div>

            <BillingToggle billing={billing} onChange={setBilling} />

            <div
              data-testid="pricing-columns"
              className="mt-10 grid gap-6 lg:grid-cols-3 lg:items-stretch"
            >
              {TIERS.map((tier, index) => (
                <TierCard key={tier.id} tier={tier} billing={billing} index={index} />
              ))}
            </div>

            <div className="mt-16">
              <Heading level={2} className="text-center">
                Compare every tier
              </Heading>
              <ComparisonTable />
            </div>

            <p className="mx-auto mt-12 max-w-prose text-center text-sm leading-relaxed text-fg-subtle">
              Councils, Workflows and the Video Editor will sit behind a higher tier later, once
              checkout ships. This page shows three columns today; it does not invent a priced fourth
              column for surfaces that are not paywalled yet.
            </p>
          </Container>
        </div>
      </main>
      <Footer />
    </>
  );
};
