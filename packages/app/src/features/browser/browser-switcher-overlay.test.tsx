import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { BrowserSwitcherOverlay } from './browser-switcher-overlay';

describe('BrowserSwitcherOverlay', () => {
  beforeEach(() => {
    useUiStore.setState({
      browserOpen: false,
      browserLayout: 'full',
      browserSwitcherOpen: false,
      browserSwitcherSelected: 'full',
      occluders: 0,
    });
  });

  afterEach(cleanup);

  it('renders nothing when browserSwitcherOpen is false', () => {
    const { container } = render(<BrowserSwitcherOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('renders 3 options with the selected one active when open', () => {
    useUiStore.setState({ browserSwitcherOpen: true, browserSwitcherSelected: 'left' });
    render(<BrowserSwitcherOverlay />);

    expect(screen.getByTestId('browser-switcher-overlay')).toBeDefined();
    expect(screen.getByTestId('browser-switcher-option-full').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('browser-switcher-option-left').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('browser-switcher-option-right').getAttribute('aria-checked')).toBe('false');
  });

  it('cycles selection on ArrowRight and ArrowLeft', () => {
    useUiStore.setState({ browserSwitcherOpen: true, browserSwitcherSelected: 'full' });
    render(<BrowserSwitcherOverlay />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('left');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('right');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('full');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('right');
  });

  it('selects option directly using number keys 1-3', () => {
    useUiStore.setState({ browserSwitcherOpen: true, browserSwitcherSelected: 'full' });
    render(<BrowserSwitcherOverlay />);

    fireEvent.keyDown(window, { key: '2' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('left');

    fireEvent.keyDown(window, { key: '3' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('right');

    fireEvent.keyDown(window, { key: '1' });
    expect(useUiStore.getState().browserSwitcherSelected).toBe('full');
  });

  it('commits and opens browser on Enter', () => {
    useUiStore.setState({
      browserOpen: false,
      browserSwitcherOpen: true,
      browserSwitcherSelected: 'right',
    });
    render(<BrowserSwitcherOverlay />);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(useUiStore.getState()).toMatchObject({
      browserOpen: true,
      browserLayout: 'right',
      browserSwitcherOpen: false,
    });
  });

  it('cancels without switching on Escape', () => {
    useUiStore.setState({
      browserOpen: false,
      browserLayout: 'full',
      browserSwitcherOpen: true,
      browserSwitcherSelected: 'right',
    });
    render(<BrowserSwitcherOverlay />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState()).toMatchObject({
      browserOpen: false,
      browserLayout: 'full',
      browserSwitcherOpen: false,
    });
  });

  it('commits on keyup of Meta (Mod on macOS)', () => {
    useUiStore.setState({
      browserOpen: false,
      browserLayout: 'full',
      browserSwitcherOpen: true,
      browserSwitcherSelected: 'left',
    });
    render(<BrowserSwitcherOverlay />);

    fireEvent.keyUp(window, { key: 'Meta' });
    expect(useUiStore.getState()).toMatchObject({
      browserOpen: true,
      browserLayout: 'left',
      browserSwitcherOpen: false,
    });
  });

  it('commits on keyup of Control (Mod on Linux/Windows)', () => {
    useUiStore.setState({
      browserOpen: false,
      browserLayout: 'full',
      browserSwitcherOpen: true,
      browserSwitcherSelected: 'right',
    });
    render(<BrowserSwitcherOverlay />);

    fireEvent.keyUp(window, { key: 'Control' });
    expect(useUiStore.getState()).toMatchObject({
      browserOpen: true,
      browserLayout: 'right',
      browserSwitcherOpen: false,
    });
  });

  it('clicking an option selects it and opens the browser', () => {
    useUiStore.setState({
      browserOpen: false,
      browserLayout: 'full',
      browserSwitcherOpen: true,
      browserSwitcherSelected: 'full',
    });
    render(<BrowserSwitcherOverlay />);

    fireEvent.click(screen.getByTestId('browser-switcher-option-left'));
    expect(useUiStore.getState()).toMatchObject({
      browserOpen: true,
      browserLayout: 'left',
      browserSwitcherOpen: false,
    });
  });

  it('registers and unregisters as an occluder during its lifecycle', () => {
    expect(useUiStore.getState().occluders).toBe(0);

    useUiStore.setState({ browserSwitcherOpen: true });
    const { unmount } = render(<BrowserSwitcherOverlay />);
    expect(useUiStore.getState().occluders).toBe(1);

    unmount();
    expect(useUiStore.getState().occluders).toBe(0);
  });
});
