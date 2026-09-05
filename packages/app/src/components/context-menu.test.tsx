import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextMenu, type MenuItem } from './context-menu';
import { useUiStore } from '../store/ui-store';

/**
 * A loaded browser tab's page is an Electron `WebContentsView` — an
 * OS-composited layer that paints above the whole renderer window regardless
 * of DOM `z-index`. The only way a portalled overlay like `ContextMenu` can
 * appear above it is by registering as an occluder, which hides that native
 * view for as long as the overlay is open (see `use-browser-bounds.ts`).
 */
describe('ContextMenu occluder registration', () => {
  afterEach(cleanup);

  it('increments occluders on mount and decrements on unmount', () => {
    expect(useUiStore.getState().occluders).toBe(0);

    const { unmount } = render(
      <ContextMenu
        position={{ x: 0, y: 0 }}
        items={[{ label: 'Reload', onSelect: () => {} }]}
        onClose={() => {}}
      />,
    );

    expect(useUiStore.getState().occluders).toBe(1);

    unmount();

    expect(useUiStore.getState().occluders).toBe(0);
  });
});

/**
 * Phase 62 Theme B — Escape is delivered by the shared dismissal stack, and the
 * menu's own callback holds the two-step rule: an open submenu is a surface of
 * its own, so it closes first and the menu survives the keypress.
 */
describe('ContextMenu Escape', () => {
  afterEach(cleanup);

  const items = [
    { label: 'Copy', onSelect: () => {} },
    { label: 'Open with', submenu: [{ label: 'Editor', onSelect: () => {} }] },
  ];

  it('closes an open submenu first, and the menu only once there is none', () => {
    const onClose = vi.fn();
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);

    // Hover is what opens a submenu here — there is no click affordance.
    fireEvent.mouseEnter(screen.getByText('Open with').closest('div.relative')!);
    expect(screen.queryByText('Editor')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Editor')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Phase 68 Theme C — the menu has always declared `role="menu"` and
 * `role="menuitem"`; these are the keyboard half of that contract, which it
 * advertised for its whole life and did not implement.
 */
describe('ContextMenu keyboard navigation', () => {
  afterEach(cleanup);

  /*
    Indices matter to every assertion below, so they are named once:
    0 Copy · 1 Paste (disabled) · 2 separator · 3 Open with (submenu) · 4 Delete.
    Two unselectable rows back to back is the case a naive `index ± 1` gets
    wrong, which is why the separator sits directly after the disabled row.
  */
  const items: MenuItem[] = [
    { label: 'Copy', onSelect: () => {} },
    { label: 'Paste', disabled: true, onSelect: () => {} },
    { type: 'separator' },
    {
      label: 'Open with',
      submenu: [
        { label: 'Editor', onSelect: () => {} },
        { label: 'Terminal', onSelect: () => {} },
      ],
    },
    { label: 'Delete', danger: true, onSelect: () => {} },
  ];

  const item = (name: string) => screen.getByRole('menuitem', { name });
  /** Keystrokes are aimed at whatever holds focus, as a real one would be. */
  const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });

  function open(onClose: () => void = () => {}) {
    render(<ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={onClose} />);
  }

  it('focuses the first selectable item on open', () => {
    open();
    expect(document.activeElement).toBe(item('Copy'));
    expect(item('Copy').tabIndex).toBe(0);
    expect(item('Delete').tabIndex).toBe(-1);
  });

  it('skips disabled items and separators, and wraps at both ends', () => {
    open();

    press('ArrowDown');
    expect(document.activeElement).toBe(item('Open with'));

    press('ArrowDown');
    expect(document.activeElement).toBe(item('Delete'));

    // Past the end, back to the top.
    press('ArrowDown');
    expect(document.activeElement).toBe(item('Copy'));

    // And past the top, back to the end.
    press('ArrowUp');
    expect(document.activeElement).toBe(item('Delete'));
  });

  it('jumps to either end with Home and End', () => {
    open();

    press('End');
    expect(document.activeElement).toBe(item('Delete'));

    press('Home');
    expect(document.activeElement).toBe(item('Copy'));
  });

  it('enters a submenu with ArrowRight and leaves it with ArrowLeft', () => {
    open();

    press('ArrowDown');
    expect(item('Open with').getAttribute('aria-expanded')).toBe('false');

    press('ArrowRight');
    expect(document.activeElement).toBe(item('Editor'));
    expect(item('Open with').getAttribute('aria-expanded')).toBe('true');

    // The submenu navigates on its own indices, not the parent's.
    press('ArrowDown');
    expect(document.activeElement).toBe(item('Terminal'));

    press('ArrowLeft');
    expect(screen.queryByText('Terminal')).toBeNull();
    expect(document.activeElement).toBe(item('Open with'));
  });

  it('does not move the keyboard into a submenu the pointer opened', () => {
    open();

    fireEvent.mouseEnter(screen.getByText('Open with').closest('div.relative')!);
    expect(screen.queryByText('Editor')).not.toBeNull();
    // Hover opened the surface; focus stayed where the keyboard left it.
    expect(document.activeElement).toBe(item('Copy'));
  });

  it('returns focus to the row that opened it (Theme A, through the trap)', () => {
    function Harness() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" data-testid="row" onClick={() => setShown(true)}>
            Row
          </button>
          {shown ? (
            <ContextMenu position={{ x: 0, y: 0 }} items={items} onClose={() => setShown(false)} />
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const row = screen.getByTestId('row');
    row.focus();
    fireEvent.click(row);

    expect(document.activeElement).toBe(item('Copy'));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
