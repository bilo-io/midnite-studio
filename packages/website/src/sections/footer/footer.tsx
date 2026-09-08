import { LuBug, LuGithub, LuTag } from 'react-icons/lu';

import { Container, Logo, Reveal, Section } from '../../components';
import { useLatestVersion } from '../../pages/use-latest-version';
import { anchorHref, hrefFor } from '../../routes';
import { AGENT_ROSTER } from '../early-access/roster';

import { FooterHorizon } from './footer-horizon';

/** The public releases repo — the only GitHub repo this site may point at. */
const APPS_REPO = 'https://github.com/bilo-io/midnite-apps';

type FooterLink = { label: string; href: string; external?: boolean };

/**
 * The Product column: where a visitor most plausibly wants to go next.
 *
 * Anchors are built through `anchorHref`, so they work from the download page
 * too — from there they are cross-page navigations to `/#faq` rather than
 * in-page jumps, and nothing about the markup changes for that.
 */
const PRODUCT: readonly FooterLink[] = [
  { label: 'Download', href: hrefFor('download') },
  { label: 'Features', href: anchorHref('features') },
  { label: 'FAQ', href: anchorHref('faq') },
  { label: 'Early access', href: anchorHref('early-access') },
];

const COMMUNITY: readonly FooterLink[] = [
  { label: 'Releases', href: `${APPS_REPO}/releases`, external: true },
  { label: 'Report a bug', href: `${APPS_REPO}/issues/new?template=bug.yml`, external: true },
  { label: 'Request a feature', href: `${APPS_REPO}/issues/new?template=feature.yml`, external: true },
  { label: 'All issues', href: `${APPS_REPO}/issues`, external: true },
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
 * The version, from the same feed the download page reads.
 *
 * `useLatestVersion` is imported rather than re-implemented — one fetch of
 * `version.json`, one set of failure states, one definition of what
 * "unreleased" means. A second copy here would be the classic way for the
 * footer and the download page to disagree about the current version on the
 * same page load.
 */
const FooterVersion = () => {
  const state = useLatestVersion();
  const text =
    state.status === 'released'
      ? `midnite-studio/v${state.version}`
      : state.status === 'unreleased'
        ? 'no public release yet'
        : state.status === 'unavailable'
          ? 'version feed unreachable'
          : '…';

  return (
    <a
      href={`${APPS_REPO}/releases`}
      target="_blank"
      rel="noreferrer"
      data-testid="footer-version"
      className="inline-flex items-center gap-2 rounded-full bg-bg-elevated px-3 py-1 font-mono text-xs text-fg-muted shadow-glow-soft transition duration-fast hover:text-fg"
    >
      <LuTag aria-hidden="true" className="shrink-0" />
      {text}
    </a>
  );
};

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
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col items-start gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-fg-muted">
            A git client, an agent workbench and a docked browser in one window. macOS on Apple
            silicon.
          </p>
          <FooterVersion />
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

        <FooterColumn heading="Community" links={COMMUNITY} />
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
      */}
      <Reveal className="mt-16">
        <p
          aria-hidden="true"
          data-testid="footer-wordmark"
          className="select-none bg-clip-text text-[clamp(2.5rem,11vw,9rem)] font-semibold leading-[0.9] tracking-tight text-transparent"
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
          Midnite Studio
        </p>
      </Reveal>

      <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p data-testid="footer-copyright" className="text-xs text-fg-subtle">
          © {__BUILD_YEAR__} Bilo Lwabona. Downloads, release notes and the issue tracker live in{' '}
          <a
            href={APPS_REPO}
            target="_blank"
            rel="noreferrer"
            className="text-fg-muted underline decoration-dotted underline-offset-4 hover:text-fg"
          >
            bilo-io/midnite-apps
          </a>
          .
        </p>
        <div className="flex items-center gap-4">
          <a
            href={APPS_REPO}
            target="_blank"
            rel="noreferrer"
            aria-label="bilo-io/midnite-apps on GitHub"
            className="text-fg-subtle transition duration-fast hover:text-fg"
          >
            <LuGithub aria-hidden="true" className="h-4 w-4" />
          </a>
          <a
            href={`${APPS_REPO}/issues`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open issues"
            className="text-fg-subtle transition duration-fast hover:text-fg"
          >
            <LuBug aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </Container>
  </Section>
);
