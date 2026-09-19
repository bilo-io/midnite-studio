import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteNav } from '../components/site-nav';
import { DownloadPage } from '../pages/download-page';

import { SECTIONS } from './registry';

/**
 * No em dash (—) or en dash (–) in visitor-facing copy.
 *
 * The house style rewrites every dash used as punctuation into a sentence that
 * reads naturally without one (a colon, a comma, parentheses, or two
 * sentences), never a plain hyphen standing in for one. This renders every
 * landing-page section, the nav and the download page, and asserts neither
 * character appears in rendered text or in an `aria-label` — the two places
 * a visitor (sighted or on a screen reader) actually encounters copy. Code
 * comments, docblocks and
 * `README.md` prose are outside this net on purpose: `grep -P` over `src/`
 * during the sweep that produced this test found dozens of dashes in exactly
 * those places, and they are not copy.
 */
const DASH = /[—–]/;

beforeEach(() => {
  // The footer fetches the version feed on mount (`useLatestVersion`); never
  // resolved here, so it neither hits the network nor warns about a rejection.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('landing-page copy', () => {
  it('renders the nav with no em dash or en dash', () => {
    const { container } = render(<SiteNav />);
    expect(container.textContent).not.toMatch(DASH);
    for (const el of Array.from(container.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('aria-label')).not.toMatch(DASH);
    }
  });

  it.each(SECTIONS.map((section) => [section.id, section.Component] as const))(
    'renders "%s" with no em dash or en dash, in text or in an aria-label',
    (_id, Component) => {
      const { container } = render(<Component />);
      expect(container.textContent).not.toMatch(DASH);
      for (const el of Array.from(container.querySelectorAll('[aria-label]'))) {
        expect(el.getAttribute('aria-label')).not.toMatch(DASH);
      }
    },
  );

  it('renders the download page with no em dash or en dash', () => {
    const { container } = render(<DownloadPage />);
    expect(container.textContent).not.toMatch(DASH);
    for (const el of Array.from(container.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('aria-label')).not.toMatch(DASH);
    }
  });
});
