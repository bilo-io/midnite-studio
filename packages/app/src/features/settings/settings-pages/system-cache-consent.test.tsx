import type { ReactNode } from 'react';

import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { useOptimizerStore } from '../../../store/optimizer-store';
import { useUiStore } from '../../../store/ui-store';
import { OptimizerSettingsPage } from './optimizer-settings-page';

function createWrapper() {
  return ({ children }: { children: ReactNode }) => <DialogHost>{children}</DialogHost>;
}

function installBridge(catalogue: { entryId: string; label: string; producer: string; ecosystem: string; reclaim: string }[] = []) {
  const systemCatalogue = vi.fn().mockResolvedValue({ ok: true, value: catalogue });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    optimizer: { systemCatalogue } as unknown as MidniteStudioBridge['optimizer'],
  } as Partial<MidniteStudioBridge>;
  return { systemCatalogue };
}

const CATALOGUE = [
  { entryId: 'cargo-registry', label: 'Cargo registry', producer: 'cargo build', ecosystem: 'rust', reclaim: 'costly' },
  { entryId: 'homebrew-cache', label: 'Homebrew cache', producer: 'brew install', ecosystem: 'multi', reclaim: 'costly' },
];

const reset = () => {
  useUiStore.setState({
    optimizerEnabled: false,
    allowSystemCacheClean: false,
    systemCacheConsentGiven: false,
  });
  useOptimizerStore.setState({ systemCatalogue: null });
};

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  reset();
});

describe('OptimizerSettingsPage — System caches (Phase 73 Theme C)', () => {
  it('renders no "System caches" section while the Optimizer is off', () => {
    reset();
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    expect(screen.queryByText('System caches')).toBeNull();
  });

  it('renders the section once optimizerEnabled is on, and fetches the catalogue', async () => {
    reset();
    useUiStore.setState({ optimizerEnabled: true });
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    expect(screen.getByText('System caches')).toBeTruthy();
    expect(await screen.findByText('Cargo registry')).toBeTruthy();
    expect(screen.getByText('Homebrew cache')).toBeTruthy();
  });

  it('clicking the unchecked box does not set allowSystemCacheClean until the dialog confirms', async () => {
    reset();
    useUiStore.setState({ optimizerEnabled: true });
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    const checkbox = screen.getByRole('checkbox', { name: 'Allow cleaning system caches' });
    fireEvent.click(checkbox);

    // Clicking opens the confirm dialog — the boolean stays false until
    // its own confirm button is clicked, not the settings-page checkbox.
    expect(useUiStore.getState().allowSystemCacheClean).toBe(false);
    expect(await screen.findByText('Allow Midnite to clean caches outside your repos?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'I understand — allow it' }));

    await waitFor(() => expect(useUiStore.getState().allowSystemCacheClean).toBe(true));
    expect(useUiStore.getState().systemCacheConsentGiven).toBe(true);
  });

  it('cancelling the dialog leaves both booleans false', async () => {
    reset();
    useUiStore.setState({ optimizerEnabled: true });
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow cleaning system caches' }));
    await screen.findByText('Allow Midnite to clean caches outside your repos?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useUiStore.getState().allowSystemCacheClean).toBe(false);
    expect(useUiStore.getState().systemCacheConsentGiven).toBe(false);
  });

  it('unchecking an already-allowed setting is immediate and asks nothing', () => {
    reset();
    useUiStore.setState({
      optimizerEnabled: true,
      allowSystemCacheClean: true,
      systemCacheConsentGiven: true,
    });
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow cleaning system caches' }));

    expect(useUiStore.getState().allowSystemCacheClean).toBe(false);
    // Consent is a fact about what the user was shown, not a live
    // permission — turning the switch off does not clear it.
    expect(useUiStore.getState().systemCacheConsentGiven).toBe(true);
    expect(screen.queryByText('Allow Midnite to clean caches outside your repos?')).toBeNull();
  });

  it('re-checking after consent was already given does not re-ask — no dialog, straight to true', () => {
    reset();
    useUiStore.setState({
      optimizerEnabled: true,
      allowSystemCacheClean: false,
      systemCacheConsentGiven: true, // consented previously, then toggled off
    });
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow cleaning system caches' }));

    expect(useUiStore.getState().allowSystemCacheClean).toBe(true);
    expect(screen.queryByText('Allow Midnite to clean caches outside your repos?')).toBeNull();
  });

  it('the enumeration in the confirm dialog names every catalogue label', async () => {
    reset();
    useUiStore.setState({ optimizerEnabled: true });
    installBridge(CATALOGUE);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    await screen.findByText('Cargo registry'); // catalogue loaded onto the page
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow cleaning system caches' }));

    for (const entry of CATALOGUE) {
      expect(await screen.findAllByText(entry.label)).not.toHaveLength(0);
    }
  });

  it("picks up Plex's two entries once the catalogue includes them, and no longer promises to never touch a media tool's cache (Phase 74 Theme A)", async () => {
    reset();
    useUiStore.setState({ optimizerEnabled: true });
    const plexCatalogue = [
      ...CATALOGUE,
      {
        entryId: 'plex-transcode-cache',
        label: 'Plex transcode cache',
        producer: 'Plex Media Server (regenerates on next transcode or thumbnail request)',
        ecosystem: 'media',
        reclaim: 'cheap',
      },
      {
        entryId: 'plex-plugin-http-cache',
        label: 'Plex metadata agent cache',
        producer: "Plex Media Server's metadata agents (re-fetch over the network on next library scan)",
        ecosystem: 'media',
        reclaim: 'costly',
      },
    ];
    installBridge(plexCatalogue);
    render(<OptimizerSettingsPage />, { wrapper: createWrapper() });

    expect(await screen.findByText('Plex transcode cache')).toBeTruthy();
    expect(screen.getByText('Plex metadata agent cache')).toBeTruthy();
    expect(screen.queryByText(/another media tool.s cache/)).toBeNull();
  });

  it('the pair survives a simulated reload — both keys are in the persisted partition', () => {
    reset();
    useUiStore.setState({
      optimizerEnabled: true,
      allowSystemCacheClean: true,
      systemCacheConsentGiven: true,
    });

    const persistedState = (
      useUiStore.persist.getOptions().partialize as (state: unknown) => Record<string, unknown>
    )(useUiStore.getState());

    expect(persistedState.allowSystemCacheClean).toBe(true);
    expect(persistedState.systemCacheConsentGiven).toBe(true);
  });
});
