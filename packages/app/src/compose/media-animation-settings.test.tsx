import { SKETCHFAB_TOKEN_URL } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../test-support/fixtures';
import { renderView } from '../../test-support/render';
import { AnimationSettingsSection } from './media-animation-settings';

afterEach(cleanup);

describe('AnimationSettingsSection', () => {
  it('saves the Sketchfab token through the vault, as a password field, and offers where to get one', async () => {
    renderView(<AnimationSettingsSection />, { fixtures });
    const set = vi.spyOn(window.midniteStudio!.secrets, 'set');
    const openExternal = vi.spyOn(window.midniteStudio!.shell, 'openExternal');
    const field = (await screen.findByLabelText('Sketchfab API token')) as HTMLInputElement;
    expect(field.type).toBe('password');
    fireEvent.change(field, { target: { value: 'fake-token-for-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ key: 'media.sketchfabApiToken', value: 'fake-token-for-test' }));
    fireEvent.click(screen.getByRole('button', { name: /Get a token on Sketchfab/ }));
    expect(openExternal).toHaveBeenCalledWith({ url: SKETCHFAB_TOKEN_URL });
  });
});
