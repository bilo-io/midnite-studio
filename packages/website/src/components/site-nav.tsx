import { Button } from './button';
import { Container } from './container';
import { Logo } from './logo';
import { anchorHref, hrefFor } from '../routes';
import { NAV_SECTIONS } from '../sections/registry';

export type SiteNavProps = {
  /**
   * `true` on the download page, where the anchor list points back at the
   * landing page rather than at sections of the current one.
   */
  offLanding?: boolean;
};

/**
 * The sticky top bar: the mark, the section anchors, and Download.
 *
 * The anchor list is **read from the section registry**, not written here, so a
 * wave-2 agent that adds a section with `nav: true` gets a nav item for free
 * and cannot ship a link to a fragment that does not exist. `anchorHref` builds
 * every one against `import.meta.env.BASE_URL`, which is what makes the same
 * component work on the download page — from there the links are cross-page
 * navigations to `/#features` rather than in-page jumps, and nothing about the
 * markup has to change for that.
 *
 * Below `md` the anchors are hidden rather than folded into a drawer. There are
 * seven of them, all reachable by scrolling the one page they live on, and a
 * hamburger that opens a list of in-page jumps is a control that costs a tap to
 * do what the scroll gesture already does. Download stays visible at every
 * width, because it is the one thing a visitor might have come for.
 *
 * `backdrop-blur` with a translucent background rather than a solid one: the
 * hero's lane graph keeps moving underneath, which is the point of having it.
 */
export const SiteNav = ({ offLanding = false }: SiteNavProps) => (
  <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/80 backdrop-blur-md">
    <Container className="flex h-16 items-center justify-between gap-4">
      <a
        href={hrefFor('landing')}
        className="rounded-md transition duration-fast hover:opacity-80"
        aria-label={offLanding ? 'Midnite Studio — back to the home page' : 'Midnite Studio'}
      >
        <Logo />
      </a>

      <nav aria-label="Sections" className="hidden md:block">
        <ul className="flex items-center gap-6">
          {NAV_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={anchorHref(section.id)}
                className="text-sm text-fg-muted transition duration-fast hover:text-fg"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Button href={hrefFor('download')} size="md">
        Download
      </Button>
    </Container>
  </header>
);
