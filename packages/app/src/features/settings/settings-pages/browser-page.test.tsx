import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { DialogHost } from '../../../components/dialog-host';
import { fixtures } from '../../../../test-support/fixtures';
import { installMockBridgeJsdom } from '../../../../test-support/mock-bridge';
import { useUiStore } from '../../../store/ui-store';
import { BrowserPage } from './browser-page';

function renderWithChrome(ui: React.ReactElement) {
  const chrome = createFrameChrome().chrome;
  return render(
    <FrameChromeProvider chrome={chrome}>
      <DialogHost>{ui}</DialogHost>
    </FrameChromeProvider>,
  );
}

describe('BrowserPage (Phase 117 Theme B)', () => {
  beforeEach(() => {
    installMockBridgeJsdom(fixtures);
    useUiStore.setState({
      browserSpellcheck: false,
    });
  });
  afterEach(cleanup);

  it('renders spellcheck toggle and toggles spellchecker', () => {
    const setSpellcheckSpy = vi.fn();
    (window as unknown as { midniteStudio: { browser: { setSpellcheck: typeof setSpellcheckSpy } } }).midniteStudio.browser.setSpellcheck = setSpellcheckSpy;

    renderWithChrome(<BrowserPage />);

    const toggle = screen.getByTestId('browser-settings-spellcheck-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);
    expect(useUiStore.getState().browserSpellcheck).toBe(true);
    expect(setSpellcheckSpy).toHaveBeenCalledWith({ enabled: true });
  });

  it('Site safety: the proceed switch is off by default, flips the store and tells main (Phase 117 Theme C)', () => {
    const setSiteSafetySpy = vi.fn();
    (window as unknown as { midniteStudio: { browser: { setSiteSafety: typeof setSiteSafetySpy } } }).midniteStudio.browser.setSiteSafety = setSiteSafetySpy;
    useUiStore.setState({ browserAllowSiteProceed: false, browserReputationFeeds: { urlhaus: true, openphish: false } });
    renderWithChrome(<BrowserPage />);

    const toggle = screen.getByTestId('browser-settings-site-proceed-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(useUiStore.getState().browserAllowSiteProceed).toBe(true);
    // No browser pane is mounted here, so this push is the only way main hears about it.
    expect(setSiteSafetySpy).toHaveBeenCalledWith({ allowProceed: true, feeds: { urlhaus: true, openphish: false } });
  });

  it('defaults downloads off and privacy on, and flips each switch (Phase 117 Themes D + E)', () => {
    useUiStore.setState({
      browserDownloads: { enabled: false, folder: '' },
      browserPrivacy: { blockTrackers: true, blockThirdPartyCookies: true, trimReferrer: true, reduceUserAgent: true },
    });
    renderWithChrome(<BrowserPage />);

    const downloads = screen.getByTestId('browser-settings-downloads-toggle') as HTMLInputElement;
    expect(downloads.checked).toBe(false);
    expect((screen.getByTestId('browser-settings-downloads-folder') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(downloads);
    expect(useUiStore.getState().browserDownloads.enabled).toBe(true);

    const trackers = screen.getByTestId('browser-settings-privacy-blockTrackers') as HTMLInputElement;
    expect(trackers.checked).toBe(true);
    fireEvent.click(trackers);
    expect(useUiStore.getState().browserPrivacy).toMatchObject({ blockTrackers: false, blockThirdPartyCookies: true });
  });

  it('lists remembered permissions and allows revoking an individual permission', async () => {
    const permissionsListSpy = vi.fn().mockResolvedValue([
      { origin: 'https://example.com', permission: 'geolocation', value: 'allow', grantedAt: 123456789 },
    ]);
    const permissionRevokeSpy = vi.fn().mockResolvedValue({ ok: true });

    const mockBrowser = (window as unknown as { midniteStudio: { browser: Record<string, unknown> } }).midniteStudio.browser;
    mockBrowser.permissionsList = permissionsListSpy;
    mockBrowser.permissionRevoke = permissionRevokeSpy;

    renderWithChrome(<BrowserPage />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeDefined();
    });
    expect(screen.getByText(/geolocation/)).toBeDefined();
    expect(screen.getByText('allow')).toBeDefined();

    // Revoke
    const revokeBtn = screen.getByTestId('revoke-permission-https://example.com-geolocation');
    fireEvent.click(revokeBtn);

    expect(permissionRevokeSpy).toHaveBeenCalledWith({
      origin: 'https://example.com',
      permission: 'geolocation',
    });
  });

  it('resets all permissions on confirm', async () => {
    const permissionsListSpy = vi.fn().mockResolvedValue([
      { origin: 'https://example.com', permission: 'camera', value: 'deny', grantedAt: 123456789 },
    ]);
    const permissionsResetSpy = vi.fn().mockResolvedValue({ ok: true });

    const mockBrowser = (window as unknown as { midniteStudio: { browser: Record<string, unknown> } }).midniteStudio.browser;
    mockBrowser.permissionsList = permissionsListSpy;
    mockBrowser.permissionsReset = permissionsResetSpy;

    renderWithChrome(<BrowserPage />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeDefined();
    });

    const resetBtn = screen.getByTestId('reset-all-permissions-btn');
    fireEvent.click(resetBtn);

    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Reset all' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(permissionsResetSpy).toHaveBeenCalled();
    });
  });
});
