import { Fragment, useState } from 'react';

import { LuCheck, LuMinus } from 'react-icons/lu';

import { Button, Container, GlowCard, Heading, Lede, Reveal } from '../components';
import { Faq } from '../sections/faq/faq-section';
import type { FaqEntry } from '../sections/faq/faq';
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

/**
 * The live-agent-session ceiling per tier, and the one limit that does not
 * vary — terminals are unlimited everywhere. Named constants because both
 * numbers are quoted twice each: once in a card's own bullets, once in the
 * comparison table's Limits group, and a figure that changes belongs in one
 * place.
 */
export const STARTER_SESSION_LIMIT = 5;
export const PRO_SESSION_LIMIT = 10;
const UNLIMITED = 'Unlimited';

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
      'Local models through Ollama, free on every tier',
      `Up to ${STARTER_SESSION_LIMIT} live agent sessions at once, unlimited terminals`,
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
      'Councils, Workflows and the Video Editor',
      `Up to ${PRO_SESSION_LIMIT} live agent sessions at once`,
    ],
  },
  {
    id: 'max',
    name: 'Max',
    subtitle: 'Insomniac',
    features: [
      'Everything in Pro',
      'Seat-based access for your whole team',
      'Unlimited live agent sessions',
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

/** A comparison-table cell: a plain include/exclude flag, or a literal value (a limit). */
type FeatureCell = boolean | string;

type FeatureRow = {
  label: string;
  starter: FeatureCell;
  pro: FeatureCell;
  max: FeatureCell;
};

type FeatureGroup = {
  id: string;
  title: string;
  rows: readonly FeatureRow[];
};

/**
 * The comparison table's rows, grouped by category — the first group is the
 * plan-level claims the site already makes elsewhere (the FAQ, the Features
 * section); the three after it mirror the app's own side rail one-for-one,
 * copied as plain strings from `packages/app/src/app.tsx`'s
 * `WORKSPACE_NAV_ITEMS`/`GIT_NAV_ITEMS`/`AGENT_NAV_ITEMS` and
 * `VIEW_LABELS` (`packages/app/src/services/palette/providers.ts`) — this
 * package never imports from `packages/app`, so the names are transcribed,
 * not referenced, and the two can drift if the rail is ever relabelled.
 *
 * **The free/paid split below is a deliberate product decision, not a
 * transcription of the rail.** Every Workspace and Git/Forge item is free on
 * every tier, same as the rail itself, which draws no tier distinction.
 * "Local models (Ollama)" is free everywhere too, because it runs entirely on
 * the visitor's own machine and Ollama — there is nothing here to meter. The
 * rest of the Agents group — Councils, Workflows, the Video Editor, and
 * loop/kanban-driven agent runs — is the one place this page draws a line
 * inside a rail category: those sit behind Pro and Max, the same paid
 * boundary Private repositories already marks. The ten coding-agent CLIs
 * (Claude, Codex, Copilot and the rest) are a different thing entirely —
 * launching a vendor's own agent in a terminal pane, gated only by the
 * Limits group's session count below — and stay free on every tier.
 */
const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: 'plan-basics',
    title: 'Plan basics',
    rows: [
      { label: 'Unlimited public repositories', starter: true, pro: true, max: true },
      { label: 'Private repositories', starter: false, pro: true, max: true },
      {
        label: 'The full git client, terminal and forge in one window',
        starter: true,
        pro: true,
        max: true,
      },
      {
        label: 'All ten coding agents (Claude, Codex, Copilot and more)',
        starter: true,
        pro: true,
        max: true,
      },
      { label: 'Multiple seats on one team', starter: false, pro: false, max: true },
      { label: 'Shared team billing', starter: false, pro: false, max: true },
      { label: 'Priority early-access support', starter: false, pro: true, max: true },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace',
    rows: [
      { label: 'Dashboard', starter: true, pro: true, max: true },
      { label: 'Notes', starter: true, pro: true, max: true },
      { label: 'Knowledge', starter: true, pro: true, max: true },
      { label: 'Sessions', starter: true, pro: true, max: true },
      { label: 'Explorer', starter: true, pro: true, max: true },
      { label: 'Search', starter: true, pro: true, max: true },
      { label: 'Optimizer', starter: true, pro: true, max: true },
      { label: 'Tests', starter: true, pro: true, max: true },
      { label: 'Database', starter: true, pro: true, max: true },
      { label: 'API Client', starter: true, pro: true, max: true },
    ],
  },
  {
    id: 'git',
    title: 'Git & Forge',
    rows: [
      { label: 'Issues', starter: true, pro: true, max: true },
      { label: 'Projects', starter: true, pro: true, max: true },
      { label: 'Graph', starter: true, pro: true, max: true },
      { label: 'Changes', starter: true, pro: true, max: true },
      { label: 'Actions', starter: true, pro: true, max: true },
      { label: 'Reviews', starter: true, pro: true, max: true },
      { label: 'History', starter: true, pro: true, max: true },
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    rows: [
      { label: 'Local models (Ollama)', starter: true, pro: true, max: true },
      { label: 'Councils', starter: false, pro: true, max: true },
      { label: 'Workflows', starter: false, pro: true, max: true },
      { label: 'Video Editor', starter: false, pro: true, max: true },
      { label: 'Loops and kanban-driven agent runs', starter: false, pro: true, max: true },
    ],
  },
  {
    id: 'limits',
    title: 'Limits',
    rows: [
      {
        label: 'Live agent sessions at once',
        starter: `Up to ${STARTER_SESSION_LIMIT}`,
        pro: `Up to ${PRO_SESSION_LIMIT}`,
        max: UNLIMITED,
      },
      { label: 'Terminals', starter: UNLIMITED, pro: UNLIMITED, max: UNLIMITED },
    ],
  },
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

/**
 * The "Recommended" pill on the Pro card.
 *
 * A solid, fixed-dark backdrop — never a translucent wash — ringed by a
 * conic-gradient border that rotates through the site's shared `--ws-angle`
 * custom property (`site.css`), with a blurred copy of the same gradient
 * behind it as the glow. `hsl(240 22% 4%)` is written as a literal rather
 * than `var(--ws-bg-sunken)`: the Pro card underneath is a fixed brand
 * surface with its text pinned to white in both themes (see
 * `.ws-pricing-pro-card` in `site.css`), and a themed fill would flip to
 * near-white in light mode and lose contrast against that white text.
 */
const RecommendedPill = () => (
  <span
    data-testid="pricing-recommended-pill"
    className="ws-pricing-pill absolute -top-3 left-6 inline-flex items-center px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
  >
    <span className="relative">Recommended</span>
  </span>
);

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
        {tier.recommended ? <RecommendedPill /> : null}

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

/**
 * The Pro column's header cell.
 *
 * The gradient is painted on a `span` layered inside the `<th>`, rather than
 * as the cell's own `background-image` the way `.ws-pricing-pro-card` is
 * everywhere else it appears: a `<table>`'s own background-painting
 * algorithm is a separate code path from an ordinary element's, and this
 * table already opts out of `border-collapse` above for `position: sticky`
 * to anchor correctly — the same family of table-specific quirk this
 * sidesteps by moving the animated surface off the cell entirely and onto a
 * plain positioned element inside it.
 */
const ProHeaderCell = () => (
  <th
    scope="col"
    className="ws-pricing-pro-header sticky top-16 z-10 px-2 py-3 text-center font-semibold text-white sm:px-4"
  >
    <span aria-hidden="true" className="ws-pricing-pro-card absolute inset-0" />
    <span className="relative">Pro</span>
  </th>
);

const STATIC_HEADER_CLASS: Record<'starter' | 'max', string> = {
  starter: 'bg-bg-elevated text-fg',
  max: 'ws-pricing-invert bg-bg-elevated text-fg',
};

const ComparisonCell = ({ value }: { value: FeatureCell }) => {
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-fg">{value}</span>;
  }
  return value ? (
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
};

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
          <th
            scope="col"
            className={`sticky top-16 z-10 px-2 py-3 text-center font-semibold sm:px-4 ${STATIC_HEADER_CLASS.starter}`}
          >
            Starter
          </th>
          <ProHeaderCell />
          <th
            scope="col"
            className={`sticky top-16 z-10 px-2 py-3 text-center font-semibold sm:px-4 ${STATIC_HEADER_CLASS.max}`}
          >
            Max
          </th>
        </tr>
      </thead>
      <tbody>
        {FEATURE_GROUPS.map((group) => (
          <Fragment key={group.id}>
            <tr>
              {/*
                A `<td>`, not a `<th scope="colgroup">`: a real colgroup
                header would also read as a `columnheader` to the accessible
                tree (and to `getAllByRole('columnheader')`), which this row
                is not — it is a section divider spanning every column, not a
                header any one of them associates with.
              */}
              <td
                colSpan={4}
                className="border-t border-line bg-bg-sunken px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle sm:px-4"
              >
                {group.title}
              </td>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="px-2 py-3 text-left font-normal text-fg-muted sm:px-4">
                  {row.label}
                </th>
                <td className="px-2 py-3 text-center sm:px-4">
                  <ComparisonCell value={row.starter} />
                </td>
                <td className="px-2 py-3 text-center sm:px-4">
                  <ComparisonCell value={row.pro} />
                </td>
                <td className="px-2 py-3 text-center sm:px-4">
                  <ComparisonCell value={row.max} />
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * The pricing page's own FAQ, reusing `sections/faq/faq-section.tsx`'s
 * tablist/cross-fade component with a pricing-specific list rather than the
 * landing page's general one — same pattern, different `id` (so both can
 * exist in the same build with no anchor collision) and a pricing-scoped
 * heading. See that component's header comment for why an accordion was
 * never on the table.
 */
const PRICING_FAQ: readonly FaqEntry[] = [
  {
    slug: 'monthly-vs-yearly',
    question: 'Monthly or yearly — what changes?',
    answer: [
      `Only the rhythm. Pro is $${PRO_MONTHLY_USD} a month or $${PRO_YEARLY_USD} a year; Max is $${MAX_MONTHLY_USD} a seat a month or $${MAX_YEARLY_USD} a seat a year. Paying yearly is ${YEARLY_DISCOUNT_LABEL} against the monthly rate, roughly two months free, and the toggle above the tiers switches every price on this page between the two instantly.`,
      'The features and the limits are identical either way — billing period is the only thing that moves.',
    ],
  },
  {
    slug: 'per-seat',
    question: 'What does "per seat" mean on Max?',
    answer: [
      'Max is priced per person on the team, not per repository or per machine. Add a teammate and the bill grows by one seat at the same rate everyone else pays; the whole team shares one invoice rather than each person paying separately.',
      'Starter and Pro are single-seat by design — Max is the tier that exists specifically to add more people to one account.',
    ],
  },
  {
    slug: 'free-forever',
    question: "What's free forever, not just while it's early access?",
    answer: [
      'Unlimited public repositories, the full git client, terminal and forge in one window, every Workspace and Git & Forge item on the comparison table above, all ten coding-agent CLIs, and local models through Ollama. None of that moves behind a paywall later — the paid boundary is private repositories and the Agents category (Councils, Workflows, the Video Editor and loop/kanban-driven runs), not the workspace itself.',
      'Terminals are unlimited on every tier, Starter included, for the same reason: a terminal is not the thing this product charges for.',
    ],
  },
  {
    slug: 'session-limits',
    question: 'What are the live agent session limits, and why does RAM matter?',
    answer: [
      `Starter runs up to ${STARTER_SESSION_LIMIT} live agent sessions at once, Pro up to ${PRO_SESSION_LIMIT}, and Max has no cap from the product side.`,
      "Each session is a real agent process attached to a real pty, though, and every machine only has so much RAM — the practical ceiling on any given laptop is whichever number is lower, the plan's limit or what the hardware can actually hold open at once.",
    ],
  },
  {
    slug: 'local-models-free',
    question: 'Are local models really free on every tier?',
    answer: [
      'Yes, including Starter. Local models run through your own Ollama install on your own machine, so there is nothing for the product to meter — the compute and the model weights are already yours.',
      'The paid part of the Agents group — Councils, Workflows and the Video Editor — is the higher-order orchestration layer built on top; local models sit outside that boundary entirely.',
    ],
  },
  {
    slug: 'cancel-and-switch',
    question: 'Can I cancel or switch plans?',
    answer: [
      'Yes — move between Starter, Pro and Max, or cancel outright, whenever you like. There is no contract term.',
      'Checkout has not shipped yet, so today that is a conversation rather than a self-serve toggle; the early-access form is the way to start it.',
    ],
    links: [{ label: 'Ask for early access', href: anchorHref('early-access') }],
  },
  {
    slug: 'team-seats',
    question: 'How do I manage seats for my team on Max?',
    answer: [
      "Seats are managed by whoever owns the team's billing — add or remove a teammate and the next invoice reflects it, at the same per-seat rate for everyone on the account.",
      'Starter and Pro stay single-seat; a team that outgrows one person is exactly the case Max exists for.',
    ],
  },
];

/**
 * The pricing page.
 *
 * Three columns at desktop width, stacked on a phone, with a feature
 * comparison table and a pricing-specific FAQ underneath. **No checkout, no
 * Stripe, no payment link** — the call to action is the early-access form
 * the site already has. Nothing here may link to `bilo-io/midnite-studio`;
 * billing questions belong in the public `bilo-io/midnite-apps` issue
 * tracker.
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
              {/*
                `pb-2` plus a slightly looser `leading-[1.15]` (Tailwind's
                `text-6xl` default is `line-height: 1`, tighter than this
                glyph needs): at that line-height the "g"'s descender sits
                right at the edge of the box the gradient fill and
                `ws-pricing-title-glow`'s `drop-shadow` are both computed
                against, and got visibly cropped. The extra headroom is
                inside the same inline-block the gradient already fills, so
                the fix costs nothing but a sliver of otherwise-empty space
                under the word.
              */}
              <Heading
                level={1}
                className="ws-rainbow-text ws-pricing-title-glow inline-block w-fit pb-2 leading-[1.15]"
              >
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
              <p className="mx-auto mt-4 max-w-prose text-center text-sm leading-relaxed text-fg-subtle">
                Live agent session counts are the product's own ceiling — the practical limit on any
                one machine is also bounded by its RAM, whichever number is lower.
              </p>
            </div>
          </Container>
        </div>

        <Faq
          entries={PRICING_FAQ}
          id="pricing-faq"
          label="Pricing questions"
          eyebrow="Pricing questions"
          heading="The pricing FAQ"
          lede="The billing rhythm, what a seat is, what stays free, and the limits — asked plainly, answered the same way."
        />
      </main>
      <Footer />
    </>
  );
};
