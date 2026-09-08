import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SiteNav } from './site-nav';
import { NAV_SECTIONS } from '../sections/registry';

describe('SiteNav', () => {
  it('renders one anchor per nav: true registry entry, in order', () => {
    render(<SiteNav />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual(NAV_SECTIONS.map((s) => s.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      NAV_SECTIONS.map((s) => `/#${s.id}`),
    );
  });

  it('always offers Download, and links it to the download page', () => {
    render(<SiteNav />);
    expect(screen.getByRole('link', { name: 'Download' })).toHaveProperty(
      'pathname',
      '/download/',
    );
  });
});
