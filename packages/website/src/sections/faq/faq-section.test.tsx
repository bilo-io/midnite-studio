import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FAQ } from './faq';
import { Faq, nextFaqIndex } from './faq-section';

const tab = (slug: string) => screen.getByTestId(`faq-tab-${slug}`);
const panel = (slug: string) => screen.getByTestId(`faq-panel-${slug}`);
const selectedSlug = () =>
  FAQ.find((entry) => tab(entry.slug).getAttribute('aria-selected') === 'true')?.slug;

const setHash = (hash: string) => {
  window.history.replaceState(null, '', hash === '' ? window.location.pathname : hash);
};

beforeEach(() => setHash(''));
afterEach(() => setHash(''));

/**
 * The index arithmetic on its own, because the wrap-around is the part that is
 * easy to get subtly wrong and tedious to prove through the DOM.
 */
describe('nextFaqIndex', () => {
  it('moves down and wraps at the end', () => {
    expect(nextFaqIndex('ArrowDown', 0, 4)).toBe(1);
    expect(nextFaqIndex('ArrowDown', 3, 4)).toBe(0);
  });

  it('moves up and wraps at the start', () => {
    expect(nextFaqIndex('ArrowUp', 2, 4)).toBe(1);
    expect(nextFaqIndex('ArrowUp', 0, 4)).toBe(3);
  });

  it('jumps to the ends', () => {
    expect(nextFaqIndex('Home', 2, 4)).toBe(0);
    expect(nextFaqIndex('End', 1, 4)).toBe(3);
  });

  /**
   * `null` is not "do nothing" — it is "this is not our key", and the component
   * uses it to decide *not* to call `preventDefault`. Swallowing Tab or Enter
   * here would trap a keyboard reader in the question list.
   */
  it('declines keys it does not own', () => {
    expect(nextFaqIndex('Tab', 0, 4)).toBeNull();
    expect(nextFaqIndex('Enter', 0, 4)).toBeNull();
    expect(nextFaqIndex('a', 0, 4)).toBeNull();
  });
});

describe('<Faq>', () => {
  it('is a vertical tablist with one tab per question', () => {
    render(<Faq />);
    const tablist = screen.getByTestId('faq-tablist');
    expect(tablist.getAttribute('aria-orientation')).toBe('vertical');
    for (const entry of FAQ) {
      expect(tab(entry.slug).getAttribute('role')).toBe('tab');
      expect(tab(entry.slug).getAttribute('aria-controls')).toBe(`faq-panel-${entry.slug}`);
      expect(panel(entry.slug).getAttribute('aria-labelledby')).toBe(`faq-tab-${entry.slug}`);
    }
  });

  it('selects the first question by default', () => {
    render(<Faq />);
    expect(selectedSlug()).toBe(FAQ[0]!.slug);
    expect(panel(FAQ[0]!.slug).dataset.selected).toBe('true');
    expect(panel(FAQ[1]!.slug).dataset.selected).toBe('false');
  });

  it('keeps exactly one tab in the page tab order', () => {
    render(<Faq />);
    const focusable = FAQ.filter((entry) => tab(entry.slug).getAttribute('tabindex') === '0');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]!.slug).toBe(FAQ[0]!.slug);
  });

  it('moves selection with the arrow keys', () => {
    render(<Faq />);
    fireEvent.keyDown(tab(FAQ[0]!.slug), { key: 'ArrowDown' });
    expect(selectedSlug()).toBe(FAQ[1]!.slug);

    fireEvent.keyDown(tab(FAQ[1]!.slug), { key: 'ArrowUp' });
    expect(selectedSlug()).toBe(FAQ[0]!.slug);
  });

  it('wraps from the first question up to the last', () => {
    render(<Faq />);
    fireEvent.keyDown(tab(FAQ[0]!.slug), { key: 'ArrowUp' });
    expect(selectedSlug()).toBe(FAQ[FAQ.length - 1]!.slug);
  });

  it('jumps to the ends with Home and End', () => {
    render(<Faq />);
    fireEvent.keyDown(tab(FAQ[0]!.slug), { key: 'End' });
    expect(selectedSlug()).toBe(FAQ[FAQ.length - 1]!.slug);
    fireEvent.keyDown(tab(FAQ[FAQ.length - 1]!.slug), { key: 'Home' });
    expect(selectedSlug()).toBe(FAQ[0]!.slug);
  });

  /** Automatic activation: the arrow key selects *and* takes focus with it. */
  it('moves focus with the arrow key', () => {
    render(<Faq />);
    tab(FAQ[0]!.slug).focus();
    fireEvent.keyDown(tab(FAQ[0]!.slug), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tab(FAQ[1]!.slug));
  });

  it('selects on click', () => {
    render(<Faq />);
    const target = FAQ[2]!;
    fireEvent.click(tab(target.slug));
    expect(selectedSlug()).toBe(target.slug);
  });

  it('records the selection in the URL fragment', () => {
    render(<Faq />);
    const target = FAQ[3]!;
    fireEvent.click(tab(target.slug));
    expect(window.location.hash).toBe(`#faq-${target.slug}`);
  });

  it('selects the question a deep link names on load', () => {
    const target = FAQ[4]!;
    setHash(`#faq-${target.slug}`);
    render(<Faq />);
    expect(selectedSlug()).toBe(target.slug);
  });

  it('ignores a fragment that names no question', () => {
    setHash('#early-access');
    render(<Faq />);
    expect(selectedSlug()).toBe(FAQ[0]!.slug);
  });

  it('follows a hashchange after load', () => {
    render(<Faq />);
    const target = FAQ[5]!;
    setHash(`#faq-${target.slug}`);
    fireEvent(window, new Event('hashchange'));
    expect(selectedSlug()).toBe(target.slug);
  });

  /**
   * Every panel is in the DOM (that is what allows the cross-fade), so the
   * unselected ones must be hidden by `visibility` — which takes them out of
   * the accessibility tree and the tab order — rather than merely faded, which
   * would leave their links reachable by Tab and readable by a screen reader.
   */
  it('hides the unselected panels from assistive tech', () => {
    render(<Faq />);
    expect(panel(FAQ[0]!.slug).style.visibility).toBe('visible');
    expect(panel(FAQ[1]!.slug).style.visibility).toBe('hidden');
    expect(panel(FAQ[1]!.slug).getAttribute('tabindex')).toBe('-1');
  });

  it('renders every answer paragraph of the selected question', () => {
    render(<Faq />);
    for (const paragraph of FAQ[0]!.answer) {
      expect(panel(FAQ[0]!.slug).textContent).toContain(paragraph);
    }
  });
});
