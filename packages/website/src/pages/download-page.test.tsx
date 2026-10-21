import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '../sections/footer/footer';
import { SECTIONS } from '../sections/registry';

import { DownloadPage } from './download-page';

/**
 * The page is access-gated: its job is to route every call to action to the
 * early-access form, and to carry no link to a repository or a release list.
 */
describe('DownloadPage', () => {
  it('titles the page "Get Midnite"', () => {
    render(<DownloadPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Get Midnite');
  });

  it('routes its primary call to action to the early-access section', () => {
    render(<DownloadPage />);
    expect(screen.getByTestId('get-access').getAttribute('href')).toBe('/#early-access');
  });

  it('shows no install command, installer link or disk image', () => {
    const { container } = render(<DownloadPage />);
    expect(screen.queryByTestId('install-command')).toBeNull();
    expect(screen.queryByTestId('installer-link')).toBeNull();
    expect(screen.queryByTestId('dmg-link')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/curl|install\.sh|\.dmg/);
  });

  it('renders the site footer, and the very same component the registry does', () => {
    render(<DownloadPage />);
    expect(document.getElementById('footer')).not.toBeNull();
    expect(SECTIONS.find((section) => section.id === 'footer')?.Component).toBe(Footer);
  });

  it("keeps the footer's section anchors resolving back to the landing page", () => {
    const { container } = render(<DownloadPage />);
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/#launcher');
    expect(hrefs).toContain('/#faq');
    expect(hrefs).toContain('/#early-access');
  });

  it('links to no repository, release list or GitHub at all', () => {
    const { container } = render(<DownloadPage />);
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /github\.com|midnite-apps|midnite-studio/.test(h))).toBe(false);
  });
});
