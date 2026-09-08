import { Button } from './button';
import { Container } from './container';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { useActiveSection } from '../hooks/use-active-section';
import { anchorHref, hrefFor } from '../routes';
import { NAV_SECTIONS, NAV_SECTION_IDS } from '../sections/registry';

export type SiteNavProps = {
  /**
   * `true` on the download page, where the anchor list points back at the
   * landing page rather than at sections of the current one.
   */
  offLanding?: boolean;
};

/** No sections to spy on when the nav is not sitting above the landing page. */
const NO_SECTIONS: readonly string[] = [];

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
 * **The item for the section in view is marked** — `aria-current="location"`
 * plus a rainbow underline and a slow neon breath (`.ws-nav-tab` in
 * `styles/site.css`). `useActiveSection` decides which, from one
 * `IntersectionObserver` over the sections rather than a scroll listener. On the
 * download page it is handed no ids at all, so nothing is current: the links
 * there point at *another page's* fragments, and marking one of them would claim
 * the reader is somewhere they are not.
 *
 * `aria-current="location"` rather than `"page"`: the section is a place within
 * the current page, and `"page"` is the value reserved for the link pointing at
 * the document you are already on — which here is the logo, not a section.
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
export const SiteNav = ({ offLanding = false }: SiteNavProps) => {
  const active = useActiveSection(offLanding ? NO_SECTIONS : NAV_SECTION_IDS);

  return (
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
            {NAV_SECTIONS.map((section) => {
              const isActive = section.id === active;
              return (
                <li key={section.id}>
                  <a
                    href={anchorHref(section.id)}
                    aria-current={isActive ? 'location' : undefined}
                    data-active={isActive ? 'true' : 'false'}
                    className="ws-nav-tab text-sm text-fg-muted transition duration-fast hover:text-fg data-[active=true]:text-fg"
                  >
                    {section.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button href={hrefFor('download')} size="md">
            Download
          </Button>
        </div>
      </Container>
    </header>
  );
};
