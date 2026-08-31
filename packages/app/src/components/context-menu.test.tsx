import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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
