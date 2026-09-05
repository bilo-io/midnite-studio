import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFocusTrap } from './use-focus-trap';

/**
 * A trigger outside the trapped surface, plus the surface itself — the shape
 * every restoration case needs. The trigger holds focus before the hook
 * activates, which is what the hook captures.
 */
function mount(): { trigger: HTMLButtonElement; container: HTMLDivElement } {
  const trigger = document.createElement('button');
  trigger.textContent = 'open';
  document.body.appendChild(trigger);

  const container = document.createElement('div');
  container.tabIndex = -1;
  document.body.appendChild(container);

  return { trigger, container };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('useFocusTrap', () => {
  it('attaches keydown listener and gives focus to container when active', () => {
    const container = document.createElement('div');
    container.tabIndex = -1;
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    expect(document.activeElement).toBe(container);

    // Press Tab on last element -> wraps to first
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(btn1);

    // Press Shift+Tab on first element -> wraps to last
    btn1.focus();
    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(btn2);

    document.body.removeChild(container);
  });

  it('leaves focus alone when a child already holds it (e.g. autoFocus)', () => {
    // A ConfirmDialog's Cancel button sets `autoFocus`, which React applies
    // during commit — before this hook's effect runs. Grabbing the container
    // unconditionally would override that choice every time.
    const container = document.createElement('div');
    container.tabIndex = -1;
    const cancelBtn = document.createElement('button');
    container.appendChild(cancelBtn);
    document.body.appendChild(container);
    cancelBtn.focus();
    expect(document.activeElement).toBe(cancelBtn);

    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    expect(document.activeElement).toBe(cancelBtn);

    document.body.removeChild(container);
  });

  it('skips an inert subtree when wrapping Tab', () => {
    // `@bilo-io/ui`'s `Collapse` marks its clipped region `inert`, so a dialog
    // holding a closed accordion would otherwise Tab-wrap through buttons the
    // user cannot see. The attribute is on the region, not on the buttons.
    const { container } = mount();
    const first = document.createElement('button');
    const hiddenRegion = document.createElement('div');
    hiddenRegion.setAttribute('inert', '');
    const hidden = document.createElement('button');
    hiddenRegion.appendChild(hidden);
    const last = document.createElement('button');
    container.append(first, hiddenRegion, last);

    const ref = { current: container as HTMLElement };
    renderHook(() => useFocusTrap(ref, true));

    last.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });

  it('traps nothing while inactive', () => {
    const { container } = mount();
    const first = document.createElement('button');
    const last = document.createElement('button');
    container.append(first, last);

    const ref = { current: container as HTMLElement };
    renderHook(() => useFocusTrap(ref, false));

    expect(document.activeElement).not.toBe(container);

    last.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the previously-focused element on deactivate', () => {
    const { trigger, container } = mount();
    trigger.focus();

    const ref = { current: container as HTMLElement };
    const { rerender } = renderHook(({ active }) => useFocusTrap(ref, active), {
      initialProps: { active: true },
    });
    expect(document.activeElement).toBe(container);

    rerender({ active: false });
    expect(document.activeElement).toBe(trigger);
  });

  it('restores on unmount, not only on an active flip', () => {
    const { trigger, container } = mount();
    trigger.focus();

    const ref = { current: container as HTMLElement };
    const { unmount } = renderHook(() => useFocusTrap(ref, true));
    expect(document.activeElement).toBe(container);

    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not restore to a trigger that left the DOM', () => {
    // The palette navigates views, so the row it was opened from is routinely
    // gone by the time it closes. `.focus()` on a detached node is a silent
    // no-op; the point is that nothing throws and focus is not dumped on body.
    const { trigger, container } = mount();
    trigger.focus();

    const ref = { current: container as HTMLElement };
    const { rerender } = renderHook(({ active }) => useFocusTrap(ref, active), {
      initialProps: { active: true },
    });
    trigger.remove();

    rerender({ active: false });
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('captures nothing when <body> held focus', () => {
    // Opening the palette with Mod+k after clicking non-focusable chrome leaves
    // `document.activeElement === document.body`; "restoring" to it is a no-op
    // dressed as a fix.
    const { container } = mount();
    expect(document.activeElement).toBe(document.body);

    const ref = { current: container as HTMLElement };
    const { rerender } = renderHook(({ active }) => useFocusTrap(ref, active), {
      initialProps: { active: true },
    });
    expect(document.activeElement).toBe(container);

    rerender({ active: false });
    expect(document.activeElement).toBe(container);
  });

  it('does not steal focus that moved somewhere deliberate', () => {
    // A second overlay opened over the first, or a toast action took focus.
    // Yanking it back is an active regression, and this clause is what makes
    // the hook safe to switch on for every consumer at once.
    const { trigger, container } = mount();
    trigger.focus();

    const ref = { current: container as HTMLElement };
    const { rerender } = renderHook(({ active }) => useFocusTrap(ref, active), {
      initialProps: { active: true },
    });

    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    rerender({ active: false });
    expect(document.activeElement).toBe(elsewhere);
  });
});
