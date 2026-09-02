import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWindowFocused } from './use-window-focus';

/**
 * Driven through React and real `window` events rather than by reaching into the
 * module: the thing worth asserting is the shared subscription's behaviour
 * across mounts, and `useSyncExternalStore` is part of that behaviour, not
 * scaffolding to be mocked away.
 *
 * `window.addEventListener('blur')` is the right hook and not a hazard — `blur`
 * does not bubble, so no child element losing focus can be mistaken for the
 * window losing it.
 */
function Probe({ id }: { id: string }) {
  const focused = useWindowFocused();
  return <span data-testid={id}>{focused ? 'focused' : 'blurred'}</span>;
}

const read = (id = 'a') => screen.getByTestId(id).textContent;
const fire = (type: 'focus' | 'blur') =>
  act(() => {
    window.dispatchEvent(new Event(type));
  });

afterEach(cleanup);

describe('useWindowFocused', () => {
  /**
   * jsdom reports `document.hasFocus()` as **false** — there is no real window
   * to focus — so the resting state under test is "blurred". That is the honest
   * assertion, and it is also why `is-pulsing` cannot be asserted in a
   * component test: the gate is off before an event ever arrives.
   */
  it('starts from document.hasFocus(), which is false under jsdom', () => {
    expect(document.hasFocus()).toBe(false);
    render(<Probe id="a" />);
    expect(read()).toBe('blurred');
  });

  it('takes its initial value from document.hasFocus(), not from a default', () => {
    const spy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    render(<Probe id="a" />);
    expect(read()).toBe('focused');
    spy.mockRestore();
  });

  it('follows blur and focus', () => {
    render(<Probe id="a" />);
    fire('blur');
    expect(read()).toBe('blurred');
    fire('focus');
    expect(read()).toBe('focused');
  });

  it('publishes to every subscriber from the one listener pair', () => {
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    );
    fire('blur');
    expect(read('a')).toBe('blurred');
    expect(read('b')).toBe('blurred');
  });

  /**
   * The teardown is ref-counted: the listeners come off only when the LAST
   * subscriber leaves. A remount then re-reads `document.hasFocus()` rather than
   * trusting module state that went stale while nothing was listening — which is
   * the case that would otherwise leave a permanently "blurred" app after the
   * status bar was unmounted and brought back at `collapsed` density.
   */
  it('re-reads the real focus state on a remount after the last unsubscribe', () => {
    const spy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const first = render(<Probe id="a" />);
    expect(read()).toBe('focused');
    fire('blur');
    expect(read()).toBe('blurred');
    first.unmount();

    // Nothing is listening, so the module's cached value is stale by
    // construction. The remount must ask the document again rather than trust
    // it — otherwise unmounting the status bar (which happens at `collapsed`
    // density) and bringing it back would leave the app permanently "blurred".
    render(<Probe id="a" />);
    expect(read()).toBe('focused');
    spy.mockRestore();
  });

  it('keeps one subscriber live when a sibling unmounts', () => {
    const { unmount } = render(<Probe id="a" />);
    render(<Probe id="b" />);
    unmount();
    fire('blur');
    expect(read('b')).toBe('blurred');
  });
});
