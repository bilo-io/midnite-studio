import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SECTIONS } from '../registry';
import { setTheme } from '../../theme';

import { Features } from './features';
import { PILLARS } from './pillars';

afterEach(() => {
  setTheme('system');
});

describe('the Features section', () => {
  it('is the registry entry for `features`', () => {
    // The registry is what the page renders, so a section that exists but is
    // not wired in is not shipped. Asserting identity — not "is a function" —
    // is what catches a rebase that took the placeholder side of the conflict.
    expect(SECTIONS.find((section) => section.id === 'features')?.Component).toBe(Features);
  });

  it('anchors on the registry id and keeps its nav entry', () => {
    const entry = SECTIONS.find((section) => section.id === 'features');
    expect(entry?.nav).toBe(true);

    const { container } = render(<Features />);
    expect(container.querySelector('section#features')).not.toBeNull();
  });

  it('names all three pillars, whatever the breakpoint', () => {
    // Both layouts share one copy of the content — the narrow-screen switch is
    // a CSS class, not a branch — so all three headings are in the DOM even
    // though only one card is visible on a phone. That is the property being
    // asserted: three headings, not six.
    render(<Features />);
    for (const { name } of PILLARS) {
      expect(screen.getByRole('heading', { name, level: 3 })).toBeDefined();
    }
  });

  it('gives every pillar a segment button that points at its card', () => {
    render(<Features />);
    for (const { id, name } of PILLARS) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-controls')).toBe(`pillar-${id}`);
    }
  });

  it('starts with the first pillar pressed and switches on click', () => {
    render(<Features />);
    const [first, second] = PILLARS;
    if (!first || !second) throw new Error('the section needs at least two pillars');

    const firstButton = screen.getByRole('button', { name: first.name });
    const secondButton = screen.getByRole('button', { name: second.name });
    expect(firstButton.getAttribute('aria-pressed')).toBe('true');
    expect(secondButton.getAttribute('aria-pressed')).toBe('false');

    // `fireEvent` and not `element.click()`: RTL wraps the dispatch in `act`,
    // so the re-render has happened by the time the next line reads the DOM.
    fireEvent.click(secondButton);
    expect(screen.getByRole('button', { name: second.name }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: first.name }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('renders every bullet title', () => {
    render(<Features />);
    for (const { bullets } of PILLARS) {
      for (const { title } of bullets) {
        expect(screen.getByText(title)).toBeDefined();
      }
    }
  });

  it('serves the showcase screenshot lazily, in both themes', () => {
    // The strip is below the fold and the file is large, so an eager fetch here
    // would cost the fold nothing but bandwidth. The theme comes from
    // useResolvedTheme() (see showcase.tsx), not a <picture media> source, so
    // an explicit override is honoured and not just the OS preference.
    const { container } = render(<Features />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('src')).toContain('multi-screen-vertical-dark.png');

    setTheme('light');
    const light = render(<Features />);
    expect(light.container.querySelector('img')?.getAttribute('src')).toContain(
      'multi-screen-vertical-light.png',
    );
  });
});
