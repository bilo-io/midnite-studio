import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHashLanding } from './use-hash-landing';

const scrollIntoView = vi.fn();

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  useHashLanding(enabled);
  return <section id="faq" />;
};

describe('useHashLanding', () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 });
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('scrolls to the fragment, instantly, once the section exists', () => {
    window.location.hash = '#faq';
    render(<Harness />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  });

  it('does nothing without a fragment', () => {
    render(<Harness />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the fragment names no section', () => {
    window.location.hash = '#nope';
    render(<Harness />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves a restored scroll position alone', () => {
    window.location.hash = '#faq';
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 940 });
    render(<Harness />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    window.location.hash = '#faq';
    render(<Harness enabled={false} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
