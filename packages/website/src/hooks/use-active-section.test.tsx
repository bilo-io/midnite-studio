import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useActiveSection } from './use-active-section';
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  latestObserver,
  restoreRects,
} from '../test-support/fake-intersection-observer';

/** Where each section's top edge sits, in the coordinate space the hook reads. */
let tops: Record<string, number> = {};

const Harness = ({ ids }: { ids: readonly string[] }) => {
  const active = useActiveSection(ids);
  return (
    <>
      <span data-testid="active">{active ?? 'none'}</span>
      {ids.map((id) => (
        <section key={id} id={id} />
      ))}
    </>
  );
};

const activeId = () => screen.getByTestId('active').textContent;

const IDS = ['features', 'services', 'faq'] as const;

describe('useActiveSection', () => {
  beforeEach(() => {
    tops = {};
    installFakeIntersectionObserver(tops);
  });

  afterEach(() => {
    restoreRects();
    window.location.hash = '';
  });

  it('observes every id, once, with the upper-middle band', () => {
    render(<Harness ids={IDS} />);
    expect(latestObserver().targets.map((target) => target.id)).toEqual([...IDS]);
    expect(latestObserver().rootMargin).toBe('-40% 0px -55% 0px');
    expect(latestObserver().threshold).toBe(0);
  });

  it('follows the intersecting entry', () => {
    render(<Harness ids={IDS} />);
    expect(activeId()).toBe('none');

    latestObserver().emit([{ id: 'services', isIntersecting: true }]);
    expect(activeId()).toBe('services');

    // The browser reports the leave and the enter as one change set.
    latestObserver().emit([
      { id: 'services', isIntersecting: false },
      { id: 'faq', isIntersecting: true },
    ]);
    expect(activeId()).toBe('faq');
  });

  it('picks the last section above the midline when several intersect', () => {
    Object.assign(tops, { features: -900, services: 120, faq: 640 });
    render(<Harness ids={IDS} />);

    latestObserver().emit([
      { id: 'features', isIntersecting: true },
      { id: 'services', isIntersecting: true },
      { id: 'faq', isIntersecting: true },
    ]);
    // features and services are above the 500px midline; faq is not.
    expect(activeId()).toBe('services');
  });

  it('falls back to the last section above the midline when none intersect', () => {
    Object.assign(tops, { features: -1200, services: -300, faq: 700 });
    render(<Harness ids={IDS} />);

    latestObserver().emit([{ id: 'services', isIntersecting: true }]);
    expect(activeId()).toBe('services');

    // Nothing is in the band any more — a boundary is crossing it — and the
    // highlight must not blank out.
    latestObserver().emit([{ id: 'services', isIntersecting: false }]);
    expect(activeId()).toBe('services');
  });

  it('is nothing at the top of the page, before any section reaches the midline', () => {
    Object.assign(tops, { features: 900, services: 1800, faq: 2600 });
    render(<Harness ids={IDS} />);

    latestObserver().emit([{ id: 'features', isIntersecting: false }]);
    expect(activeId()).toBe('none');
  });

  it('takes the topmost hit when the band is full but nothing has passed the midline', () => {
    Object.assign(tops, { features: 700, services: 1800, faq: 2600 });
    render(<Harness ids={IDS} />);

    latestObserver().emit([
      { id: 'features', isIntersecting: true },
      { id: 'services', isIntersecting: true },
    ]);
    expect(activeId()).toBe('features');
  });

  it('starts on the deep-linked section, before the first observer tick', () => {
    window.location.hash = '#faq';
    render(<Harness ids={IDS} />);
    expect(activeId()).toBe('faq');
  });

  it('ignores a fragment that is not one of the ids', () => {
    window.location.hash = '#nope';
    render(<Harness ids={IDS} />);
    expect(activeId()).toBe('none');
  });

  it('observes nothing, and is never active, when handed no ids', () => {
    window.location.hash = '#faq';
    render(<Harness ids={[]} />);
    expect(activeId()).toBe('none');
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('disconnects on unmount', () => {
    const view = render(<Harness ids={IDS} />);
    const observer = latestObserver();
    view.unmount();
    expect(observer.disconnected).toBe(true);
  });
});
