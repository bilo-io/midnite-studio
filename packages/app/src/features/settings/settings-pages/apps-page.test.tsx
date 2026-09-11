import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { AppsPage } from './apps-page';

describe('AppsPage', () => {
  beforeEach(() => {
    useUiStore.setState({
      enabledApps: [],
      appDiscardIdle: { spotify: false, 'google-calendar': false, youtube: false },
    });
  });
  afterEach(cleanup);

  it('renders app enable toggles and shows discard toggle only when enabled', () => {
    render(<AppsPage />);

    const spotifyToggle = screen.getByTestId('apps-settings-toggle-spotify') as HTMLInputElement;
    expect(spotifyToggle.checked).toBe(false);
    expect(screen.queryByTestId('apps-settings-discard-toggle-spotify')).toBeNull();

    // Enable Spotify
    fireEvent.click(spotifyToggle);
    expect(useUiStore.getState().enabledApps).toContain('spotify');

    // Discard toggle appears
    const discardToggle = screen.getByTestId('apps-settings-discard-toggle-spotify') as HTMLInputElement;
    expect(discardToggle.checked).toBe(false);

    // Toggle discard opt-in
    fireEvent.click(discardToggle);
    expect(useUiStore.getState().appDiscardIdle.spotify).toBe(true);
  });
});
