import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_SETUP_STATE } from '../../../store/setup-state';
import { useUiStore } from '../../../store/ui-store';
import { ForgeCliPage } from './forge-cli-page';
import { ForgeSelectPage, toggleForge } from './forge-select-page';
import { installSetupBridge, wrapper } from './setup-eh-harness';

/** Phase 98 Theme E — forge multi-select and the CLI rows derived from it. */
beforeEach(() => useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE } }));
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('toggleForge', () => {
  it('adds and removes, keeping the catalogue order', () => {
    expect(toggleForge(['gitlab'], 'github')).toEqual(['github', 'gitlab']);
    expect(toggleForge(['github', 'gitlab'], 'github')).toEqual(['gitlab']);
  });
});

describe('ForgeSelectPage', () => {
  it('multi-selects and persists the choice in setupState', () => {
    render(<ForgeSelectPage />);
    fireEvent.click(screen.getByRole('button', { name: 'GitLab' }));
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
    expect(useUiStore.getState().setupState.forges).toEqual(['github', 'gitlab']);
    expect(screen.getByRole('button', { name: 'GitHub' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bitbucket' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ForgeCliPage', () => {
  it('asks for a selection first when none is made', () => {
    installSetupBridge({});
    render(<ForgeCliPage />, { wrapper: wrapper() });
    expect(screen.getByText(/No forge picked yet/)).toBeTruthy();
  });

  it('draws one row per selected forge and Bitbucket as no-CLI', async () => {
    useUiStore.setState({ setupState: { ...INITIAL_SETUP_STATE, forges: ['github', 'gitlab', 'bitbucket', 'azure'] } });
    installSetupBridge(
      { homebrew: 'Homebrew 4', gh: 'gh version 2.60.0' },
      { forge: { cliStatus: async () => ({ reason: 'not-authenticated', binPath: null, hint: 'gh auth login' }) } },
    );
    render(<ForgeCliPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getAllByTestId('setup-status-row')).toHaveLength(3));
    expect(screen.getByTestId('setup-forge-no-cli').textContent).toContain('Token-based, no CLI needed');
    await waitFor(() => expect(screen.getByText(/Not signed in — run gh auth login/)).toBeTruthy());
    expect(screen.getByText('GitLab — GitLab CLI')).toBeTruthy();
    expect(screen.getByText(/az extension add --name azure-devops|Azure CLI — not installed/)).toBeTruthy();
  });
});
