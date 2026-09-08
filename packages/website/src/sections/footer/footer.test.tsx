import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_ROSTER } from '../early-access/roster';

import { Footer } from './footer';

const links = () => Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
const hrefs = () => links().map((link) => link.getAttribute('href') ?? '');

/**
 * The footer fetches the version feed on mount (through the download page's own
 * hook). Stubbed so the tests neither hit the network nor warn about an
 * unhandled rejection; the badge's own states are the hook's tests' business.
 */
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<Footer>', () => {
  it('is the `footer` anchor, matching the registry id', () => {
    render(<Footer />);
    const section = document.getElementById('footer');
    expect(section).not.toBeNull();
    expect(section?.tagName).toBe('SECTION');
  });

  it('links to the download page, features and the FAQ', () => {
    render(<Footer />);
    const all = hrefs();
    expect(all.some((href) => href.endsWith('download/'))).toBe(true);
    expect(all).toContain('/#features');
    expect(all).toContain('/#faq');
  });

  it('names every agent in the roster', () => {
    render(<Footer />);
    const listed = screen.getByTestId('footer-agents').textContent ?? '';
    for (const agent of AGENT_ROSTER) {
      expect(listed, agent.id).toContain(agent.label);
    }
  });

  it('links to releases and to issues in the public repo', () => {
    render(<Footer />);
    const all = hrefs();
    expect(all).toContain('https://github.com/bilo-io/midnite-apps/releases');
    expect(all).toContain('https://github.com/bilo-io/midnite-apps/issues');
  });

  /**
   * The site is served from the *public* releases repo and this one is private,
   * so a link here is a 404 for every visitor. The footer is the densest set of
   * links on the page, which makes it the likeliest place for one to slip in.
   */
  it('never links to the private repository', () => {
    render(<Footer />);
    for (const href of hrefs()) {
      expect(href).not.toContain('bilo-io/midnite-studio');
    }
  });

  it('opens every external link in a new tab, with noreferrer', () => {
    render(<Footer />);
    for (const link of links()) {
      if (!link.getAttribute('href')?.startsWith('http')) continue;
      expect(link.target, link.href).toBe('_blank');
      expect(link.rel, link.href).toContain('noreferrer');
    }
  });

  it('carries the build year in the copyright line', () => {
    render(<Footer />);
    const copyright = screen.getByTestId('footer-copyright').textContent ?? '';
    expect(copyright).toContain(`© ${__BUILD_YEAR__}`);
    /* A four-digit year, i.e. the `define` actually substituted rather than
       leaving the identifier to blow up or render as text. */
    expect(copyright).toMatch(/© \d{4}/);
  });

  it('reveals the wordmark without putting it in the accessibility tree', () => {
    render(<Footer />);
    const wordmark = screen.getByTestId('footer-wordmark');
    expect(wordmark.textContent).toBe('Midnite Studio');
    expect(wordmark.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the version badge, pointing at the release list', () => {
    render(<Footer />);
    const badge = screen.getByTestId('footer-version') as HTMLAnchorElement;
    expect(badge.getAttribute('href')).toBe('https://github.com/bilo-io/midnite-apps/releases');
  });

  it('draws the lane horizon as decoration only', () => {
    render(<Footer />);
    const horizon = screen.getByTestId('footer-horizon');
    expect(horizon.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  /**
   * The horizon animates through a CSS class, and `useReducedMotion` withholds
   * it — so the drift is genuinely absent under the preference rather than
   * running at a clamped duration.
   */
  it('stops the horizon animating under reduced motion', () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      render(<Footer />);
      const horizon = screen.getByTestId('footer-horizon');
      expect(horizon.dataset.animated).toBe('false');
      expect(horizon.querySelectorAll('.ws-horizon-lane')).toHaveLength(0);
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it('animates the horizon when motion is allowed', () => {
    render(<Footer />);
    const horizon = screen.getByTestId('footer-horizon');
    expect(horizon.dataset.animated).toBe('true');
    expect(horizon.querySelectorAll('.ws-horizon-lane').length).toBeGreaterThan(0);
  });
});
