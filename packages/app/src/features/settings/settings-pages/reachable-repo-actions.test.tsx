import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openLinkFromEvent } from '../../../services/open-in-midnite';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { ReachableRepoActions } from './reachable-repo-actions';

vi.mock('../../../services/open-in-midnite', () => ({ openLinkFromEvent: vi.fn() }));

const account: ForgeAccount = {
  id: 'github:github.com:octocat',
  kind: 'github',
  host: 'github.com',
  login: 'octocat',
  displayName: '',
  avatarUrl: null,
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

const repo: ReachableRepo = {
  owner: 'octocat',
  name: 'hello',
  fullName: 'octocat/hello',
  url: 'https://github.com/octocat/hello',
  webUrl: 'https://github.com/octocat/hello',
  private: false,
};

describe('ReachableRepoActions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the repo's web page through the app's link router", () => {
    render(<ReachableRepoActions account={account} repo={repo} />);
    fireEvent.click(screen.getByRole('button', { name: /Open octocat\/hello in the browser/ }));
    expect(openLinkFromEvent).toHaveBeenCalledWith('https://github.com/octocat/hello', expect.anything());
  });

  it('types the delete command into a new terminal without pressing Return', () => {
    render(<ReachableRepoActions account={account} repo={repo} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete octocat\/hello/ }));

    expect(useUiStore.getState().terminalOpen).toBe(true);
    const inputs = Object.values(useTerminalStore.getState().pendingInput);
    expect(inputs).toContain('gh repo delete octocat/hello');
    expect(inputs.some((input) => /[\r\n]/.test(input))).toBe(false);
  });

  it('disables delete with a reason where no CLI command can be built', () => {
    render(<ReachableRepoActions account={{ ...account, kind: 'bitbucket', host: 'bitbucket.org' }} repo={repo} />);
    const del = screen.getByRole('button', { name: /Delete octocat\/hello/ });
    expect(del.getAttribute('aria-disabled')).toBe('true');
    // No "typed into a terminal" promise on a button that types nothing.
    expect(del.getAttribute('aria-label') ?? '').not.toMatch(/typed into a terminal/);
    const before = Object.keys(useTerminalStore.getState().pendingInput).length;
    fireEvent.click(del);
    expect(Object.keys(useTerminalStore.getState().pendingInput).length).toBe(before);
  });
});
