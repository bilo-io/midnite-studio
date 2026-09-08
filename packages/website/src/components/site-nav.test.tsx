import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SiteNav } from './site-nav';
import { NAV_SECTIONS } from '../sections/registry';
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  latestObserver,
  restoreRects,
} from '../test-support/fake-intersection-observer';

/**
 * The nav on its own is not a page — so the sections it spies on have to be put
 * in the document beside it, which is what the landing page does for real.
 */
const withSections = (nav: React.ReactNode) => (
  <>
    {nav}
    <main>
      {NAV_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} />
      ))}
    </main>
  </>
);

const sectionLinks = () =>
  Array.from(screen.getByRole('navigation', { name: 'Sections' }).querySelectorAll('a'));

const currentLinks = () =>
  sectionLinks().filter((link) => link.getAttribute('aria-current') === 'location');

describe('SiteNav', () => {
  beforeEach(() => {
    installFakeIntersectionObserver({});
  });

  afterEach(() => {
    restoreRects();
    window.location.hash = '';
  });

  it('renders one anchor per nav: true registry entry, in order', () => {
    render(<SiteNav />);
    expect(sectionLinks().map((a) => a.textContent)).toEqual(NAV_SECTIONS.map((s) => s.label));
    expect(sectionLinks().map((a) => a.getAttribute('href'))).toEqual(
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

  it('marks nothing current before a section reaches the band', () => {
    render(withSections(<SiteNav />));
    expect(currentLinks()).toHaveLength(0);
  });

  it('marks exactly one link current, and follows the section in view', () => {
    render(withSections(<SiteNav />));

    latestObserver().emit([{ id: 'services', isIntersecting: true }]);
    expect(currentLinks().map((link) => link.textContent)).toEqual(['Services']);
    expect(sectionLinks().filter((link) => link.dataset.active === 'true')).toHaveLength(1);

    latestObserver().emit([
      { id: 'services', isIntersecting: false },
      { id: 'faq', isIntersecting: true },
    ]);
    expect(currentLinks().map((link) => link.textContent)).toEqual(['FAQ']);
  });

  it('starts on the deep-linked section', () => {
    window.location.hash = '#faq';
    render(withSections(<SiteNav />));
    expect(currentLinks().map((link) => link.textContent)).toEqual(['FAQ']);
  });

  it('marks nothing, and observes nothing, off the landing page', () => {
    window.location.hash = '#faq';
    render(withSections(<SiteNav offLanding />));
    expect(currentLinks()).toHaveLength(0);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});
