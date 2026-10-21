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

  it('links to the Apps page, the launcher, the FAQ and early access, and does not link to download', () => {
    render(<Footer />);
    const all = hrefs();
    expect(all.some((href) => href.endsWith('download/'))).toBe(false);
    expect(all).toContain('/apps/');
    expect(all).toContain('/#launcher');
    expect(all).toContain('/#faq');
    expect(all).toContain('/#early-access');
  });

  it('names every agent in the roster', () => {
    render(<Footer />);
    const listed = screen.getByTestId('footer-agents').textContent ?? '';
    for (const agent of AGENT_ROSTER) {
      expect(listed, agent.id).toContain(agent.label);
    }
  });

  /** Access is gated: the footer carries no link to any repository or release list. */
  it('links to no GitHub repository', () => {
    render(<Footer />);
    for (const href of hrefs()) {
      expect(href).not.toMatch(/github\.com|midnite-apps|midnite-studio/);
    }
    expect(document.body.textContent ?? '').not.toContain('midnite-apps');
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
    expect(wordmark.textContent).toBe('Midnite Apps');
    expect(wordmark.getAttribute('aria-hidden')).toBe('true');
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
