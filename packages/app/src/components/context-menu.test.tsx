import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextMenu } from './context-menu';
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
