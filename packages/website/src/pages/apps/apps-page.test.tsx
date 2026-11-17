import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SITE_APPS } from '../../apps/catalog';

import { AppsPage } from './apps-page';

/**
 * The Apps page's carousel, as jsdom can see it: which slide is active, what
 * the controls and thumbnails say about it, and the fragment that follows it.
 * Scroll-snap and the observer that tracks a swipe need a real layout and are
 * left to the browser; here every move goes through a control.
 */

const carousel = () => screen.getByRole('region', { name: 'The midnite apps' });
const slides = () => within(carousel()).getAllByRole('group', { name: /of \d+: Midnite/ });
const activeSlide = () => slides().find((slide) => slide.dataset.active === 'true');
const thumbs = () => within(screen.getByRole('group', { name: 'Choose an app' })).getAllByRole('button');

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  window.history.replaceState(null, '', '/apps/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('AppsPage', () => {
  it('renders one slide and one thumbnail per available app, each hero naming its app', () => {
    render(<AppsPage />);
    expect(slides()).toHaveLength(SITE_APPS.length);
    expect(thumbs()).toHaveLength(SITE_APPS.length);
    for (const app of SITE_APPS) {
      expect(screen.getByRole('heading', { level: 2, name: `Midnite ${app.name}` })).toBeTruthy();
    }
  });

  it('opens on the first app, with Previous disabled and the fragment set', () => {
    render(<AppsPage />);
    expect(activeSlide()?.id).toBe(SITE_APPS[0]!.id);
    expect(screen.getByRole('button', { name: 'Previous app' })).toHaveProperty('disabled', true);
    expect(thumbs()[0]?.getAttribute('aria-current')).toBe('true');
    expect(window.location.hash).toBe(`#${SITE_APPS[0]!.id}`);
  });

  it('opens on the app a fragment names', () => {
    window.history.replaceState(null, '', '/apps/#vault');
    render(<AppsPage />);
    expect(activeSlide()?.id).toBe('vault');
  });

  it('moves with Next, a thumbnail and the arrow keys, and keeps one thumbnail current', () => {
    render(<AppsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Next app' }));
    expect(activeSlide()?.id).toBe(SITE_APPS[1]!.id);

    fireEvent.click(screen.getByRole('button', { name: 'Show Midnite Money' }));
    expect(activeSlide()?.id).toBe('money');
    expect(window.location.hash).toBe('#money');

    fireEvent.keyDown(carousel(), { key: 'End' });
    expect(activeSlide()?.id).toBe(SITE_APPS.at(-1)!.id);
    expect(screen.getByRole('button', { name: 'Next app' })).toHaveProperty('disabled', true);

    fireEvent.keyDown(carousel(), { key: 'ArrowLeft' });
    expect(activeSlide()?.id).toBe(SITE_APPS.at(-2)!.id);

    expect(thumbs().filter((thumb) => thumb.getAttribute('aria-current') === 'true')).toHaveLength(1);
  });

  it('makes every slide but the active one inert', () => {
    render(<AppsPage />);
    const articles = slides().map((slide) => slide.querySelector('article'));
    expect(articles.filter((article) => !article?.hasAttribute('inert'))).toHaveLength(1);
  });

  it('marks the Apps nav link as the current page', () => {
    render(<AppsPage />);
    expect(
      within(screen.getByRole('navigation', { name: 'Sections' }))
        .getByRole('link', { name: 'Apps' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});
