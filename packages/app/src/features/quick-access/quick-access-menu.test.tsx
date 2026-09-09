import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { resetCompanionPorts, setCompanionPorts } from '../companion/companion-ports';
import { QuickAccessMenu } from './quick-access-menu';

beforeEach(() => {
  useUiStore.setState({
    quickAccessOpen: false,
    notesOpen: false,
    fabPanelOpen: false,
    companionPanelOpen: false,
    // The default. Named explicitly because half of this file's assertions are
    // about what the `C` leaf and the companion strip look like on either side
    // of this switch, and a leaked `true` from another suite would flip them.
    companionEnabled: false,
  });
  useCompanionStore.setState({ state: 'off', transcript: [] });
  resetCompanionPorts();
});

afterEach(cleanup);

describe('QuickAccessMenu', () => {
  it('renders the five rows, in order, behind one separator', () => {
    render(<QuickAccessMenu onClose={() => {}} />);

    // `L · C · N · —— · I · G` (Phase 79 Theme C) — the companion sits between
    // Loops and Notes. Five, not four: `Repeat` is absent with no companion
    // turn to repeat, which is the state a fresh store is in.
    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]?.textContent).toContain('Loops');
    expect(rows[1]?.textContent).toContain('Companion');
    expect(rows[2]?.textContent).toContain('Notes');
    expect(rows[3]?.textContent).toContain('Report Issue');
    expect(rows[4]?.textContent).toContain('Guided tour');

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
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-c'));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-n'));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-i'));

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('quick-access-row-n'));
  });

  /*
    `quickAccessOpen` gates `use-keybindings.ts`'s global dispatcher AND is
    the flag the FAB button renders off — this component deliberately does
    not also set it itself. It used to (mount → true, unmount → false), which
    reads correct in isolation but is what mounted a second, unwanted instance
    back when a second trigger (the statusbar's `assistant-menu.tsx`, since
    removed — see its own doc comment) read the same flag: with the FAB
    reading the same `quickAccessOpen` the other trigger's mount had just set
    true, both rendered at once. One shared gate that only the caller's own
    open/close toggles is what keeps exactly one instance mounted.
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

  /* --- Phase 79 Themes C + H ------------------------------------------- */

  it('the C leaf is disabled with its reason while the companion is switched off', () => {
    const onClose = vi.fn();
    render(<QuickAccessMenu onClose={onClose} />);

    const row = screen.getByTestId('quick-access-row-c');
    expect(row.getAttribute('aria-disabled')).toBe('true');

    fireEvent.keyDown(screen.getByTestId('quick-access-menu'), { key: 'c' });

    expect(useUiStore.getState().companionPanelOpen).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Enable in Settings ▸ Companion')).not.toBeNull();
  });

  it('the C leaf opens the companion panel once the companion is enabled', () => {
    useUiStore.setState({ companionEnabled: true });
    const onClose = vi.fn();
    render(<QuickAccessMenu onClose={onClose} />);

    fireEvent.keyDown(screen.getByTestId('quick-access-menu'), { key: 'c' });

    expect(useUiStore.getState().companionPanelOpen).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the popover shows the enable row while the companion is off', () => {
    render(<QuickAccessMenu onClose={() => {}} />);
    expect(screen.getByTestId('companion-strip').textContent).toContain(
      'Enable the companion in Settings',
    );
  });

  it('the popover shows the state label and the last companion turn once enabled', () => {
    useUiStore.setState({ companionEnabled: true });
    useCompanionStore.setState({
      state: 'speaking',
      transcript: [
        { id: 'a', role: 'user', text: 'start an adhoc task', at: 1, spoken: false },
        { id: 'b', role: 'companion', text: 'Here we are — one session, typed and waiting.', at: 2, spoken: true },
      ],
    });

    render(<QuickAccessMenu onClose={() => {}} />);

    const strip = screen.getByTestId('companion-strip');
    expect(strip.textContent).toContain('Speaking…');
    expect(strip.textContent).toContain('one session, typed and waiting');
  });

  it('offers Repeat only when there is a companion turn, and routes it through the port', () => {
    useUiStore.setState({ companionEnabled: true });
    render(<QuickAccessMenu onClose={() => {}} />);
    expect(screen.queryByTestId('quick-access-row-r')).toBeNull();
    cleanup();

    const repeat = vi.fn();
    setCompanionPorts({ repeat });
    useCompanionStore.setState({
      transcript: [{ id: 'b', role: 'companion', text: 'Here we are.', at: 2, spoken: true }],
    });

    const onClose = vi.fn();
    render(<QuickAccessMenu onClose={onClose} />);
    fireEvent.click(screen.getByTestId('quick-access-row-r'));

    expect(repeat).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
