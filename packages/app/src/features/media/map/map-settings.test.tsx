import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { MapPanel } from './map-panel';
import { MapSettingsSection } from './map-settings';
import { defaultMapProject } from '@midnite/studio-shared';

afterEach(cleanup);

describe('MapSettingsSection', () => {
  it('saves the MapTiler key through the vault, never anywhere else', async () => {
    renderView(<MapSettingsSection />, { fixtures });
    const set = vi.spyOn(window.midniteStudio!.secrets, 'set');
    fireEvent.change(await screen.findByLabelText('MapTiler API key'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ key: 'media.mapTilerApiKey', value: 'abc123' }));
  });

  it('shows the cache size and a Clear that confirms with the size first', async () => {
    renderView(<MapSettingsSection />, { fixtures: { ...fixtures, media: { map: { cacheBytes: 312 * 1024 * 1024 } } } });
    await waitFor(() => expect(screen.getByTestId('map-cache-readout').textContent).toContain('312 MB'));
    const slider = screen.getByLabelText('Map cache size limit') as HTMLInputElement;
    expect(slider.step).toBe('256');
    fireEvent.click(screen.getByRole('button', { name: 'Clear map cache' }));
    expect(await screen.findByText('Clear 312 MB of cached map tiles?')).toBeTruthy();
  });
});

describe('MapPanel sources', () => {
  it('flips MapTiler to available once a key exists', async () => {
    const { unmount } = renderView(<MapPanel map={defaultMapProject()} project="maps" repoId="r1" />, { fixtures });
    expect((await screen.findAllByText('Add a MapTiler key in Settings ▸ Media.')).length).toBe(3);
    unmount();
    renderView(<MapPanel map={defaultMapProject()} project="maps" repoId="r1" />, { fixtures: { ...fixtures, media: { map: { keySet: true } } } });
    await screen.findByText('MapTiler Satellite');
    await waitFor(() => expect(screen.queryByText('Add a MapTiler key in Settings ▸ Media.')).toBeNull());
  });
});
