import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { BrowserLauncher } from './browser-launcher';

/**
 * The launcher is a keyboard surface first — the common path is `Mod+B`
 * followed by `Enter`, with the arrows only involved when the remembered
 * answer is not today's answer. So these tests are mostly about what a
 * keystroke selects and what actually commits.
 */
afterEach(cleanup);

const openLauncher = () =>
  useUiStore.setState({ browserLauncherOpen: true, browserOpen: false });

const group = () => screen.getByRole('radiogroup', { name: 'Browser layout' });

const optionsChecked = () =>
  screen
    .getAllByRole('radio')
    .filter((el) => el.getAttribute('aria-checked') === 'true')
    .map((el) => el.getAttribute('data-testid'));

describe('BrowserLauncher', () => {
  beforeEach(() => {
    useUiStore.setState({
      browserOpen: false,
      browserLauncherOpen: false,
      browserLayout: 'full',
      occluders: 0,
    });
  });

  it('renders nothing while closed', () => {
    render(<BrowserLauncher />);
    expect(screen.queryByTestId('browser-launcher')).toBeNull();
  });

  it('offers the three layouts, each with its own drawing', () => {
    openLauncher();
    const { container } = render(<BrowserLauncher />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('browser-layout-full')).toBeTruthy();
    expect(screen.getByTestId('browser-layout-left')).toBeTruthy();
    expect(screen.getByTestId('browser-layout-right')).toBeTruthy();
    // An illustration per option — the whole reason the modal exists rather
    // than three words in a menu.
    expect(container.querySelectorAll('svg')).toHaveLength(3);
  });

  it('pre-selects the layout used last time, and focuses it so Enter commits', () => {
    useUiStore.setState({ browserLayout: 'right' });
    openLauncher();
    render(<BrowserLauncher />);

    expect(optionsChecked()).toEqual(['browser-layout-right']);
    expect(document.activeElement).toBe(screen.getByTestId('browser-layout-right'));
  });

  it('moves the selection with the arrows, clamped at both ends', () => {
    openLauncher();
    render(<BrowserLauncher />);

    fireEvent.keyDown(group(), { key: 'ArrowRight' });
    expect(optionsChecked()).toEqual(['browser-layout-left']);
    fireEvent.keyDown(group(), { key: 'ArrowRight' });
    expect(optionsChecked()).toEqual(['browser-layout-right']);
    // Clamped, not wrapped: a row whose end jumps back to the start reads as
    // the selection having been lost.
    fireEvent.keyDown(group(), { key: 'ArrowRight' });
    expect(optionsChecked()).toEqual(['browser-layout-right']);

    fireEvent.keyDown(group(), { key: 'ArrowLeft' });
    fireEvent.keyDown(group(), { key: 'ArrowLeft' });
    fireEvent.keyDown(group(), { key: 'ArrowLeft' });
    expect(optionsChecked()).toEqual(['browser-layout-full']);
  });

  it('selects by digit without committing — Enter is the only key that opens', () => {
    openLauncher();
    render(<BrowserLauncher />);

    fireEvent.keyDown(group(), { key: '3' });
    expect(optionsChecked()).toEqual(['browser-layout-right']);
    expect(useUiStore.getState().browserOpen).toBe(false);

    // `Enter` on the focused radio is a plain button activation.
    fireEvent.click(screen.getByTestId('browser-layout-right'));
    expect(useUiStore.getState()).toMatchObject({
      browserOpen: true,
      browserLayout: 'right',
      browserLauncherOpen: false,
    });
  });

  it('opens straight from a click — a mouse user has already aimed', () => {
    openLauncher();
    render(<BrowserLauncher />);

    fireEvent.click(screen.getByTestId('browser-layout-left'));
    expect(useUiStore.getState()).toMatchObject({ browserOpen: true, browserLayout: 'left' });
  });

  it('the Open button commits whatever the keyboard selected', () => {
    openLauncher();
    render(<BrowserLauncher />);

    fireEvent.keyDown(group(), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(useUiStore.getState()).toMatchObject({ browserOpen: true, browserLayout: 'left' });
  });

  it('Escape leaves everything as it was', () => {
    useUiStore.setState({ browserLayout: 'left' });
    openLauncher();
    render(<BrowserLauncher />);

    fireEvent.keyDown(group(), { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useUiStore.getState()).toMatchObject({
      browserOpen: false,
      browserLauncherOpen: false,
      // The arrow moved a local selection, never the stored preference.
      browserLayout: 'left',
    });
  });

  it('registers as an occluder, so it paints over a live page rather than under it', () => {
    openLauncher();
    const { unmount } = render(<BrowserLauncher />);

    expect(useUiStore.getState().occluders).toBe(1);
    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });
});
