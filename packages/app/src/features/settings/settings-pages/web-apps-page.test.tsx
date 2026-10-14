import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { WebAppsPage } from './web-apps-page';

describe('WebAppsPage', () => {
  beforeEach(() => {
    useUiStore.setState({
      enabledWebApps: [],
      webAppDiscardIdle: { spotify: false, 'google-calendar': false, youtube: false },
    });
  });
  afterEach(cleanup);

  it('renders app enable toggles and shows discard toggle only when enabled', () => {
    render(<WebAppsPage />);

    const spotifyToggle = screen.getByTestId('web-apps-settings-toggle-spotify') as HTMLInputElement;
    expect(spotifyToggle.checked).toBe(false);
    expect(screen.queryByTestId('web-apps-settings-discard-toggle-spotify')).toBeNull();

    // Enable Spotify
    fireEvent.click(spotifyToggle);
    expect(useUiStore.getState().enabledWebApps).toContain('spotify');

    // Discard toggle appears
    const discardToggle = screen.getByTestId('web-apps-settings-discard-toggle-spotify') as HTMLInputElement;
    expect(discardToggle.checked).toBe(false);

    // Toggle discard opt-in
    fireEvent.click(discardToggle);
    expect(useUiStore.getState().webAppDiscardIdle.spotify).toBe(true);
  });
});
