import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../store/ui-store';

import { useDismiss, type DismissOptions } from './use-dismiss';

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

function register(onDismiss: () => void, options?: DismissOptions) {
  return renderHook(({ active }) => useDismiss(active, onDismiss, options), {
    initialProps: { active: true },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Every test unmounts what it registers; this asserts it rather than trusting
  // it, because the stack is module state shared by the whole file.
  expect(useUiStore.getState().occluders).toBe(0);
});

describe('useDismiss', () => {
  it('delivers Escape to the topmost entry only', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const first = register(lower, { layer: 'dialog' });
    const second = register(upper, { layer: 'dialog' });

    pressEscape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();

    second.unmount();
    first.unmount();
  });

  it('hands delivery to the next entry when the top deactivates', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const first = register(lower, { layer: 'dialog' });
    const second = register(upper, { layer: 'dialog' });

    second.unmount();
    pressEscape();
    expect(lower).toHaveBeenCalledTimes(1);
    expect(upper).not.toHaveBeenCalled();

    first.unmount();
  });

  it('ranks by layer before registration order', () => {
    const menu = vi.fn();
    const dialog = vi.fn();
    // The dialog registers first and the menu last; layer still wins.
    const first = register(dialog, { layer: 'dialog' });
    const second = register(menu, { layer: 'menu' });

    pressEscape();
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(menu).not.toHaveBeenCalled();

    second.unmount();
    first.unmount();
  });

  it('does not let a passive entry steal a blocking one\'s Escape', () => {
    // A toast paints above a dialog (z-toast 92 > z-dialog 90) but must not
    // swallow the Escape a user meant for a destructive confirm.
    const toast = vi.fn();
    const dialog = vi.fn();
    const first = register(dialog, { layer: 'dialog' });
    const second = register(toast, { layer: 'toast', blocking: false });

    pressEscape();
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();

    first.unmount();
    pressEscape();
    expect(toast).toHaveBeenCalledTimes(1);

    second.unmount();
  });

  it("does not let a tooltip steal an inline surface's Escape", () => {
    // Both are passive, so `blocking` cannot separate them — only the layer
    // order can. A pointer resting on the browser toggle leaves its tooltip
    // open for as long as the browser pane is up, and Escape means the pane.
    const tooltip = vi.fn();
    const pane = vi.fn();
    const first = register(pane, { layer: 'inline', blocking: false });
    const second = register(tooltip, { layer: 'tooltip', blocking: false });

    pressEscape();
    expect(pane).toHaveBeenCalledTimes(1);
    expect(tooltip).not.toHaveBeenCalled();

    first.unmount();
    pressEscape();
    expect(tooltip).toHaveBeenCalledTimes(1);

    second.unmount();
  });

  it('leaves the event entirely alone when the stack is empty', () => {
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops a sibling window handler that registered after it', () => {
    // The migration safety net: an un-migrated overlay's own `window` listener
    // goes up when that overlay opens, which is after the stack became
    // non-empty — so `stopImmediatePropagation` reaches it and Escape still
    // dismisses exactly one thing mid-migration.
    const onDismiss = vi.fn();
    const entry = register(onDismiss, { layer: 'dialog' });
    const legacy = vi.fn();
    window.addEventListener('keydown', legacy);

    const event = pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(legacy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    entry.unmount();
    window.removeEventListener('keydown', legacy);
  });

  it('reads the callback through a ref, so an inline arrow does not re-register', () => {
    const seen: string[] = [];
    const { rerender, unmount } = renderHook(
      ({ label }: { label: string }) =>
        useDismiss(true, () => seen.push(label), { layer: 'dialog' }),
      { initialProps: { label: 'first' } },
    );

    rerender({ label: 'second' });
    pressEscape();
    expect(seen).toEqual(['second']);

    unmount();
  });

  it('counts a blocking entry as an occluder and a passive one not at all', () => {
    expect(useUiStore.getState().occluders).toBe(0);

    const blocking = register(vi.fn(), { layer: 'dialog' });
    expect(useUiStore.getState().occluders).toBe(1);

    const passive = register(vi.fn(), { layer: 'tooltip', blocking: false });
    expect(useUiStore.getState().occluders).toBe(1);

    passive.unmount();
    expect(useUiStore.getState().occluders).toBe(1);

    blocking.unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });

  it('registers exactly one window keydown listener for three overlays', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    const one = register(vi.fn(), { layer: 'menu' });
    const two = register(vi.fn(), { layer: 'dialog' });
    const three = register(vi.fn(), { layer: 'toast', blocking: false });

    const keydownAdds = add.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);

    three.unmount();
    two.unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);

    one.unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
  });

  it('registers nothing while inactive', () => {
    const onDismiss = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ active }) => useDismiss(active, onDismiss, { layer: 'dialog' }),
      { initialProps: { active: false } },
    );

    expect(useUiStore.getState().occluders).toBe(0);
    expect(pressEscape().defaultPrevented).toBe(false);

    rerender({ active: true });
    expect(useUiStore.getState().occluders).toBe(1);
    pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);

    unmount();
  });
});
