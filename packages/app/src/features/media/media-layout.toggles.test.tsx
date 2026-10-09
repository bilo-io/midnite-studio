import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { MediaLayout } from './media-layout';

/** vitest/jsdom: structure, labels, aria and store state only; no browser capability is needed. */
afterEach(() => {
  cleanup();
  act(() => {
    useUiStore.getState().setMediaPaneCollapsed('image', 'explorer', false);
    useUiStore.getState().setMediaPaneCollapsed('image', 'detail', false);
  });
});

const ui = (detail?: boolean) => (
  <MediaLayout
    tab="image"
    explorer={<div>ex</div>}
    content={<div>ct</div>}
    detail={detail === false ? undefined : <div>dt</div>}
  />
);

describe('MediaLayout floating side-panel toggles', () => {
  it('renders both buttons, open by default', () => {
    render(ui());
    expect(screen.getByRole('button', { name: 'Hide explorer' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hide composer' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles each pane, flipping label and aria-expanded, in step with the store', () => {
    const { container } = render(ui());
    fireEvent.click(screen.getByRole('button', { name: 'Hide explorer' }));
    expect(useUiStore.getState().mediaPaneCollapsed.image?.explorer).toBe(true);
    const show = screen.getByRole('button', { name: 'Show explorer' });
    expect(show.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-media-pane="explorer"]')?.hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Hide composer' }));
    expect(useUiStore.getState().mediaPaneCollapsed.image?.detail).toBe(true);
    expect(screen.getByRole('button', { name: 'Show composer' }).getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(show);
    expect(useUiStore.getState().mediaPaneCollapsed.image?.explorer).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide explorer' })).toBeTruthy();
  });

  it('follows a collapse made elsewhere (a divider double-click writes the same state)', () => {
    render(ui());
    act(() => useUiStore.getState().setMediaPaneCollapsed('image', 'detail', true));
    expect(screen.getByRole('button', { name: 'Show composer' })).toBeTruthy();
  });

  it('has no detail button for a two-pane tab', () => {
    render(ui(false));
    expect(screen.getByRole('button', { name: 'Hide explorer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /composer/ })).toBeNull();
  });
});
