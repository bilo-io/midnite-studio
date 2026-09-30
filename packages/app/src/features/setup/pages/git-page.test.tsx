import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitPage } from './git-page';
import { installSetupBridge, wrapper } from './setup-eh-harness';

/** Phase 98 Theme E — the git page over the catalogue probe and the install planner. */
const submitCommand = vi.hoisted(() => vi.fn(() => 'session-1'));
vi.mock('../../terminal/submit-command', () => ({ submitCommand }));

afterEach(() => {
  cleanup();
  submitCommand.mockClear();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('GitPage', () => {
  it('shows a ready row for a current git', async () => {
    installSetupBridge({ git: 'git version 2.45.0', homebrew: 'Homebrew 4.4.0' });
    render(<GitPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByTestId('setup-status-row').dataset.status).toBe('ready'));
    expect(screen.getByText('git version 2.45.0')).toBeTruthy();
  });

  it('treats a git older than the recommended minimum as missing and offers the brew install', async () => {
    installSetupBridge({ git: 'git version 2.20.1', homebrew: 'Homebrew 4.4.0' });
    render(<GitPage />, { wrapper: wrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Install with Homebrew' }));
    expect(submitCommand).toHaveBeenCalledWith('brew install git', 'Install with Homebrew');
  });

  it('offers Homebrew first and the Command Line Tools fallback when brew and git are missing', async () => {
    installSetupBridge({});
    render(<GitPage />, { wrapper: wrapper() });
    expect(await screen.findByRole('button', { name: 'Install Homebrew first' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Install Apple's Command Line Tools" })).toBeTruthy();
    expect(screen.getAllByTestId('setup-status-row')).toHaveLength(2);
  });
});
