import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SITE_ORIGIN } from '../site-origin';

import { DownloadPage } from './download-page';

/**
 * The install command is the one string on this site a visitor is expected to
 * paste into a root-capable shell, so what it points at gets a test rather than
 * a code review. Two things are asserted: it curls **this site's** own
 * `/install.sh`, and the "read it first" link opens the identical URL — a page
 * that offers a script to read and then pipes a *different* one into `sh` is
 * the exact failure this pairing exists to prevent.
 */
describe('DownloadPage', () => {
  beforeEach(() => {
    // The version badge fetches the release feed on mount. Stub it: a test
    // should not depend on the network, and a rejected fetch would surface as
    // an unhandled rejection rather than as the `unavailable` state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('never links to the private repo', () => {
    const { container } = render(<DownloadPage />);
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.includes('bilo-io/midnite-studio'))).toBe(false);
  });
});
