import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Footer } from '../sections/footer/footer';
import { SECTIONS } from '../sections/registry';
import { SITE_ORIGIN } from '../site-origin';

import { DownloadPage } from './download-page';

/**
 * The install command is the one string on this site a visitor is expected to
 * paste into a root-capable shell, so what it points at gets a test rather than
 * a code review. Two things are asserted: it curls **this site's** own
 * `/install.sh`, and the "read it first" link opens the identical URL — a page
 * that offers a script to read and then pipes a *different* one into `sh` is
 * the exact failure this pairing exists to prevent.
 *
 * The rest of the file is the page's own shape: its heading, the eyebrow that
 * is deliberately absent, and the footer it shares with the landing page.
 */
describe('DownloadPage', () => {
  beforeEach(() => {
    // Both the version badge and the footer's fetch the release feed on mount.
    // Stub it: a test should not depend on the network, and a rejected fetch
    // would surface as an unhandled rejection rather than as `unavailable`.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('curls install.sh from the site itself', () => {
    render(<DownloadPage />);
    expect(screen.getByTestId('install-command').textContent).toBe(
      `curl -fsSL ${SITE_ORIGIN}/install.sh | sh`,
    );
  });

  it('offers the same URL to read as the one it pipes into sh', () => {
    render(<DownloadPage />);
    const href = screen.getByTestId('installer-link').getAttribute('href');
    expect(href).toBe(`${SITE_ORIGIN}/install.sh`);
    expect(screen.getByTestId('install-command').textContent).toContain(href);
  });

  it('titles the page "Download Midnite", with no eyebrow above it', () => {
    render(<DownloadPage />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Download Midnite');

    // The old layout stacked a small "Download" label directly on top of an H1
    // reading "One command." — the same word the <title>, the nav item and the
    // landing page's button all already say.
    expect(screen.queryByText('One command.')).toBeNull();
    expect(screen.queryAllByText('Download', { selector: 'p, span' })).toHaveLength(0);
  });

  it('renders the site footer, and the very same component the registry does', () => {
    render(<DownloadPage />);
    expect(document.getElementById('footer')).not.toBeNull();
    // Identity, not "a footer exists": a second copy of the footer's links,
    // roster and version badge is exactly what this is avoiding.
    expect(SECTIONS.find((section) => section.id === 'footer')?.Component).toBe(Footer);
  });

  it("keeps the footer's section anchors resolving back to the landing page", () => {
    const { container } = render(<DownloadPage />);
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    // Not `#features`, which from /download/ would be a jump to nothing.
    expect(hrefs).toContain('/#features');
    expect(hrefs).toContain('/#faq');
    expect(hrefs).toContain('/#early-access');
  });

  it('never links to the private repo, footer included', () => {
    const { container } = render(<DownloadPage />);
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.includes('bilo-io/midnite-studio'))).toBe(false);
  });
});
