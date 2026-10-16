// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';
import { FEATURE_PACKAGE_FOLDERS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { CoderApp } from './coder-app';
import { CODER_APP } from './coder-manifest';
import { coderStore } from './coder-store';

const CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const REPO = { id: 'r1', path: '/Users/me/widgets', name: 'widgets', headRef: 'main', worktrees: [] };

function stubBridge() {
  const discover = vi.fn(async () => ({ repoId: 'r1', packages: [], generatedAt: 1 }));
  window.midniteStudio = {
    repos: { list: async () => [REPO], pickDirectory: async () => null, open: vi.fn(), close: vi.fn() },
    remotes: { list: async () => [{ name: 'origin', fetchUrl: '', pushUrl: '', forge: { kind: 'github', host: 'github.com', owner: 'me', repo: 'widgets' } }] },
    forge: {
      cliStatus: async () => CLI,
      pulls: async () => ({ cli: CLI, pulls: [], error: null }),
      runs: async () => ({ cli: CLI, runs: [], error: null }),
      subscribe: () => undefined,
      unsubscribe: () => undefined,
      onChanged: () => () => undefined,
    },
    forgeAccounts: { capabilities: async () => ({}) },
    tests: { discover, onOutput: () => () => undefined, onResult: () => () => undefined },
  } as unknown as typeof window.midniteStudio;
  return { discover };
}

let bridge: ReturnType<typeof stubBridge>;
beforeEach(() => {
  bridge = stubBridge();
  coderStore.setState({ selectedRepoId: null, view: 'reviews', writesEnabled: false });
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Coder composition', () => {
  it('is the owner the placement map names for forge, reviews, actions and tests', () => {
    for (const folder of [...FEATURE_PACKAGE_FOLDERS.forge, 'tests'] as const) {
      expect(placementOwners(FEATURE_PLACEMENT[folder])[0]).toBe(CODER_APP.id);
    }
    expect(CODER_APP.features).toEqual([forgeManifest.feature, testsManifest.feature]);
  });

  it("wears the launcher catalog's accent and opens on Reviews", () => {
    expect(CODER_APP.accent).toBe('#2e7cfa');
    expect(CODER_APP.home).toBe('reviews');
  });

  it('lists the repositories main holds and selects the first', async () => {
    render(<CoderApp />);
    expect(await screen.findByText('widgets')).toBeTruthy();
    await waitFor(() => expect(coderStore.getState().selectedRepoId).toBe('r1'));
  });

  it('switches to Tests and asks main to discover the selected repository', async () => {
    render(<CoderApp />);
    await screen.findByText('widgets');
    fireEvent.click(screen.getByTestId('coder-tab-tests'));
    await waitFor(() => expect(bridge.discover).toHaveBeenCalledWith({ repoId: 'r1' }));
    expect(coderStore.getState().view).toBe('tests');
  });

  it('keeps review actions off until the switch is turned on', () => {
    render(<CoderApp />);
    const toggle = screen.getByLabelText('Review actions') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(coderStore.getState().writesEnabled).toBe(true);
  });
});
