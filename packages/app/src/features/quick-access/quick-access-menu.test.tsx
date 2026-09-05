import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { QuickAccessMenu } from './quick-access-menu';

beforeEach(() => {
  useUiStore.setState({
    quickAccessOpen: false,
    notesOpen: false,
    fabPanelOpen: false,
  });
});

afterEach(cleanup);

describe('QuickAccessMenu', () => {
  it('renders the four rows, in order, behind one separator', () => {
    render(<QuickAccessMenu onClose={() => {}} />);

    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('Loops');
    expect(rows[1]?.textContent).toContain('Notes');
    expect(rows[2]?.textContent).toContain('Report Issue');
    expect(rows[3]?.textContent).toContain('Guided tour');

    expect(screen.getByTestId('quick-access-menu').querySelectorAll('hr')).toHaveLength(1);
  });

  it('a mnemonic activates its row and closes the menu', () => {
    const onClose = vi.fn();
    render(<QuickAccessMenu onClose={onClose} />);

    fireEvent.keyDown(screen.getByTestId('quick-access-menu'), { key: 'n' });

    expect(useUiStore.getState().notesOpen).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a disabled row is reachable and its mnemonic no-ops without closing', () => {
    const onClose = vi.fn();
    render(<QuickAccessMenu onClose={onClose} />);

    fireEvent.keyDown(screen.getByTestId('quick-access-menu'), { key: 'i' });

    expect(onClose).not.toHaveBeenCalled();
    expect(useUiStore.getState().notesOpen).toBe(false);
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
    expect(screen.queryByText('Coming soon')).not.toBeNull();
    expect(screen.getByTestId('quick-access-row-i').getAttribute('aria-disabled')).toBe('true');
  });

  it('ArrowDown/ArrowUp roam between rows, disabled ones included', () => {
    render(<QuickAccessMenu onClose={() => {}} />);
    const menu = screen.getByTestId('quick-access-menu');

    // Mounts with focus on the first row.
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-l'));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-n'));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-i'));

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-n'));
  });

  /*
    `quickAccessOpen` gates `use-keybindings.ts`'s global dispatcher AND is
    the flag both entry points render off — this component deliberately does
    not also set it itself. It used to (mount → true, unmount → false), which
    reads correct in isolation but is what mounted a second, unwanted instance
    the moment either caller's own conditional saw the flag flip: with the
    FAB reading the same `quickAccessOpen` the assistant-menu's mount had just
    set true, both rendered at once. One shared gate that only a caller's own
    open/close toggles is what keeps exactly one instance mounted — see
    `quick-access-menu.spec.ts`'s "the assistant menu opens the same
    component" e2e spec, which is what caught the double-mount.
  */
  it('does not touch quickAccessOpen itself — that stays the caller-owned render gate', () => {
    useUiStore.setState({ quickAccessOpen: true });

    const { unmount } = render(<QuickAccessMenu onClose={() => {}} />);
    expect(useUiStore.getState().quickAccessOpen).toBe(true);

    unmount();
    expect(useUiStore.getState().quickAccessOpen).toBe(true);
  });

  it('clicking the Loops row opens the Loops panel and closes the menu', () => {
    const onClose = vi.fn();
    render(<QuickAccessMenu onClose={onClose} />);

    fireEvent.click(screen.getByTestId('quick-access-row-l'));

    expect(useUiStore.getState().fabPanelOpen).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
