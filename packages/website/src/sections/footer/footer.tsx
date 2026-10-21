import { Container, Logo, Reveal, Section, TypeIn, Wordmark } from '../../components';
import { anchorHref, hrefFor } from '../../routes';
import { AGENT_ROSTER } from '../early-access/roster';

import { FooterHorizon } from './footer-horizon';

type FooterLink = { label: string; href: string; external?: boolean };

/**
 * The Product column: where a visitor most plausibly wants to go next.
 *
 * Anchors are built through `anchorHref`, so they work from the download page
 * too — from there they are cross-page navigations to `/#faq` rather than
 * in-page jumps, and nothing about the markup changes for that.
 */
const PRODUCT: readonly FooterLink[] = [
  { label: 'Apps', href: hrefFor('apps') },
  { label: 'The launcher', href: anchorHref('launcher') },
  { label: 'FAQ', href: anchorHref('faq') },
  { label: 'Early access', href: anchorHref('early-access') },
];

const FooterColumn = ({
  heading,
  links,
}: {
  heading: string;
  links: readonly FooterLink[];
}) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">{heading}</h3>
    <ul className="mt-4 flex flex-col gap-2.5">
      {links.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            className="text-sm text-fg-muted transition duration-fast hover:text-fg"
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

/**
 * The footer.
 *
 * Full-bleed — `bare` on the `Section`, its own `Container` inside — so the
 * lane horizon can run edge to edge under it while the columns keep the same
 * measure as every other band on the page. The horizon is the hero's motif
 * reprised at the other end of the scroll: the same four lane hues, the same
 * crossings, drawn flat and drifting instead of leaning towards the cursor.
 *
 * The wordmark is set enormous and reveals on scroll, which is the one place on
 * the site where the name is allowed to be decoration rather than navigation —
 * it is `aria-hidden`, because the accessible name is already on the mark above
 * it and a screen reader does not need to be told twice.
 *
 * It is `nav: false` in the registry, for the obvious reason: a "Footer" item in
 * a navigation bar means nothing to a visitor.
 */
export const Footer = () => (
  <Section
    id="footer"
    label="Footer"
    bare
    className="relative isolate mt-10 overflow-hidden border-t border-line pb-10 pt-16"
  >
    <FooterHorizon />

    <Container>
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
        <div className="flex flex-col items-start gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-fg-muted">
            {/* No heading beside it to wait for — the footer has none, only
                the decorative wordmark below. */}
            <TypeIn
              leadMs={0}
              text="One launcher for the midnite apps: code, agents, media, money and the machine underneath, on one shared frame. macOS on Apple silicon."
            />
          </p>
        </div>

        <FooterColumn heading="Product" links={PRODUCT} />

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            Agents
          </h3>
          {/*
            Names, not links. Each is a third party's own CLI and linking ten of
            them off a footer is ten chances to send a visitor somewhere that
            has moved; the list is here to answer "is mine in it?", which it
            does as text.
          */}
          <ul data-testid="footer-agents" className="mt-4 flex flex-wrap gap-x-3 gap-y-2 sm:flex-col sm:gap-2.5">
            {AGENT_ROSTER.map((agent) => (
              <li key={agent.id} className="text-sm text-fg-muted">
                {agent.label}
              </li>
            ))}
          </ul>
        </div>

      </div>

      {/*
        The wordmark. `select-none` and `aria-hidden`: it is a texture, and a
        reader who selects the whole page should not get "MIDNITE STUDIO" in
        70pt letters pasted into whatever they were writing.

        **The gradient is the brand rainbow, faded into the page.** It is the
        same six stops the primary button and the nav's active tab wear, and the
        same ones the app paints its FAB ring with — but at 22-34% against a
        transparent backdrop, because this is a texture at the bottom of a page
        and not a control. `color-mix` rather than a Tailwind `via-` stop: the
        ramp is a custom property holding seven comma-separated colours, which
        is not a thing a Tailwind gradient utility can take.

        **The mark is `<Wordmark tone="inherit">`, so the split is the same one
        the nav and the hero use and lives in one file.** `inherit` rather than
        the default `rainbow`: this `<p>` already owns a ramp and its own
        `background-clip: text`, and the whole design of it is that the ramp is
        faded *into* the page. Letting the component re-fan the full-strength
        ramp inside it — with a glow — would turn the texture back into a mark
        and put a second gradient box inside the first.

        **The clamp is roughly half its original `2.5rem`/`11vw`/`9rem`.** The
        floor moved to `1.5rem` rather than a literal half (`1.25rem`), because
        at phone width `1.25rem` read as an afterthought beside the columns
        above it — `1.5rem` is still unmistakably smaller than before while
        staying legible as the same texture. The `Wordmark` component itself is
        untouched: its `1.35em` split is relative to *this* element's font size,
        so halving the clamp halves both faces together without touching
        `wordmark.tsx`.
      */}
      <Reveal className="mt-16">
        <p
          aria-hidden="true"
          data-testid="footer-wordmark"
          className="select-none bg-clip-text text-[clamp(1.5rem,5.5vw,4.5rem)] font-semibold leading-[0.9] tracking-tight text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(100deg,' +
              ' color-mix(in srgb, var(--ws-rainbow-0) 30%, transparent) 0%,' +
              ' color-mix(in srgb, var(--ws-rainbow-1) 26%, transparent) 20%,' +
              ' color-mix(in srgb, var(--ws-rainbow-2) 24%, transparent) 40%,' +
              ' color-mix(in srgb, var(--ws-rainbow-3) 30%, transparent) 60%,' +
              ' color-mix(in srgb, var(--ws-rainbow-4) 34%, transparent) 78%,' +
              ' color-mix(in srgb, var(--ws-rainbow-5) 22%, transparent) 100%)',
            WebkitBackgroundClip: 'text',
          }}
        >
          <Wordmark tone="inherit" product="Apps" />
        </p>
      </Reveal>

      <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p data-testid="footer-copyright" className="text-xs text-fg-subtle">
          © {__BUILD_YEAR__} Bilo Lwabona. Access is by invitation.
        </p>
      </div>
    </Container>
  </Section>
);
