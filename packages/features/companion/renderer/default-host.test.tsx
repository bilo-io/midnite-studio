import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompanionLauncher } from './companion-launcher';
import { createDefaultCompanionHost } from './default-host';
import { CompanionHostProvider } from './host';

/**
 * The default host (Phase 123 Theme F): what an app that composes no Studio views gets. Preferences
 * come from suite-prefs, so a setting made in one app is the setting in every other.
 */
type Snapshot = { prefs: { companion: { enabled: boolean; voices: { system: null; local: null }; sttEngine: 'server'; sttProvider: null } } };

function fakePrefs(enabled: boolean) {
  const snapshot: Snapshot = { prefs: { companion: { enabled, voices: { system: null, local: null }, sttEngine: 'server', sttProvider: null } } };
  const set = vi.fn();
  const bridge = () =>
    ({ suitePrefs: { get: () => Promise.resolve(snapshot), onChanged: () => () => undefined, set } }) as never;
  return { bridge, set };
}

afterEach(cleanup);

describe('the default companion host', () => {
  it('two hosts read companion.enabled from the same suite-prefs', async () => {
    const prefs = fakePrefs(true);
    const first = createDefaultCompanionHost({ getBridge: prefs.bridge });
    const second = createDefaultCompanionHost({ getBridge: prefs.bridge });
    await vi.waitFor(() => {
      expect(first.ui.getState().companionEnabled).toBe(true);
      expect(second.ui.getState().companionEnabled).toBe(true);
    });
  });

  it('writes a changed preference back as one group', async () => {
    const prefs = fakePrefs(true);
    const host = createDefaultCompanionHost({ getBridge: prefs.bridge });
    await vi.waitFor(() => expect(host.ui.getState().companionEnabled).toBe(true));
    host.ui.setState({ companionEnabled: false });
    expect(prefs.set).toHaveBeenCalledWith({
      key: 'companion',
      value: expect.objectContaining({ enabled: false }),
    });
  });

  it('renders the launcher under it, disabled with its hint while the companion is off', async () => {
    const prefs = fakePrefs(false);
    const host = createDefaultCompanionHost({ getBridge: prefs.bridge });
    render(
      <CompanionHostProvider host={host}>
        <CompanionLauncher />
      </CompanionHostProvider>,
    );
    await vi.waitFor(() => expect(host.ui.getState().companionEnabled).toBe(false));
    const button = screen.getByTestId('companion-launcher');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toContain('Disabled in Settings');
  });

  it('answers every reveal as unavailable and lists no source', () => {
    const host = createDefaultCompanionHost();
    expect(host.revealers).toEqual({});
    expect(host.sources).toEqual([]);
  });
});

describe('the first read of suite-prefs', () => {
  it('does not overwrite a change made before it resolves', async () => {
    const snapshot = { prefs: { companion: { enabled: false, voices: { system: null, local: null }, sttEngine: 'server', sttProvider: null } } };
    let resolveGet: (value: typeof snapshot) => void = () => undefined;
    const bridge = () =>
      ({
        suitePrefs: { get: () => new Promise((resolve) => (resolveGet = resolve)), onChanged: () => () => undefined, set: vi.fn() },
      }) as never;
    const host = createDefaultCompanionHost({ getBridge: bridge });
    host.ui.setState({ companionEnabled: true });
    resolveGet(snapshot);
    await Promise.resolve();
    await Promise.resolve();
    expect(host.ui.getState().companionEnabled).toBe(true);
  });
});
