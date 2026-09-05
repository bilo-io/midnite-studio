import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_ROLE_TITLE, PageDetachMark } from './page-detach-mark';
import { useUiStore } from '../store/ui-store';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  detach: vi.fn(),
  dock: vi.fn(),
  focusRole: vi.fn(),
}));

vi.mock('../services/bridge', () => ({
  bridge: () => ({
    windowRole: mocks.windowRole,
    window: { detach: mocks.detach, dock: mocks.dock, focusRole: mocks.focusRole },
  }),
}));

describe('PageDetachMark', () => {
  beforeEach(() => {
    mocks.windowRole = 'main';
    mocks.detach.mockReset();
    mocks.dock.mockReset();
    mocks.focusRole.mockReset();
    useUiStore.setState({ detachedPages: [] });
  });

  afterEach(cleanup);

  it('opens a popout for the page when none is open', () => {
    render(<PageDetachMark role="graph" />);

    fireEvent.click(screen.getByLabelText('Detach Graph into its own window'));
    expect(mocks.detach).toHaveBeenCalledWith({ role: 'graph' });
  });

  /*
    The one-instance-per-page rule, seen from the renderer. `windowForRole`
    would focus the existing window anyway, so the point of this branch is the
    LABEL: a button that says "detach" and instead raises a window you already
    had is a control that lied about what it does.
  */
  it('focuses the existing popout instead of offering a second one', () => {
    useUiStore.setState({ detachedPages: ['graph'] });
    render(<PageDetachMark role="graph" />);

    expect(screen.queryByLabelText('Detach Graph into its own window')).toBeNull();
    fireEvent.click(screen.getByLabelText('Focus the detached Graph window'));
    expect(mocks.focusRole).toHaveBeenCalledWith({ role: 'graph' });
    expect(mocks.detach).not.toHaveBeenCalled();
  });

  it('offers close, not dock, inside the page popout itself', () => {
    mocks.windowRole = 'files';
    useUiStore.setState({ detachedPages: ['files'] });
    render(<PageDetachMark role="files" />);

    fireEvent.click(screen.getByLabelText('Close the File Explorer window'));
    expect(mocks.dock).toHaveBeenCalledWith({ role: 'files' });
  });

  /*
    A page popout hosts exactly one page, so a mark for a DIFFERENT page inside
    it must still be the ordinary detach control — otherwise the Changes window
    would offer to close itself from the Graph's mark.
  */
  it('keeps the ordinary detach affordance for other pages inside a popout', () => {
    mocks.windowRole = 'files';
    render(<PageDetachMark role="graph" />);

    expect(screen.getByLabelText('Detach Graph into its own window')).toBeDefined();
  });

  it('names every detachable page', () => {
    expect(Object.keys(PAGE_ROLE_TITLE).sort()).toEqual([
      'actions',
      'changes',
      'database',
      'files',
      'graph',
    ]);
  });
});
