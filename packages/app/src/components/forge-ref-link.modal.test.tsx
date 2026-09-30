// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBrowserStore } from '../store/browser-store';
import { useIssueModalStore } from '../store/issue-modal-store';
import { forgeRegistryKey, useRepoForgeRegistry } from '../services/repo-forge-registry';
import { ForgeRefLink } from './forge-ref-link';

vi.mock('../services/queries', () => ({ openExternal: vi.fn() }));

const ISSUE_URL = 'https://github.com/bilo-io/midnite-studio/issues/9';

describe('ForgeRefLink, unmocked seam: an issue ref opens the issue modal', () => {
  beforeEach(() => {
    useIssueModalStore.setState({ target: null });
    useBrowserStore.setState({ tabs: [], groups: [], activeTabId: null, recentlyClosed: [] });
    useRepoForgeRegistry.setState({
      byForgeKey: { [forgeRegistryKey('github.com', 'bilo-io', 'midnite-studio')]: 'repo-1' },
    });
  });
  afterEach(cleanup);

  it('plain click opens the modal', () => {
    render(<ForgeRefLink url={ISSUE_URL} number={9} />);
    fireEvent.click(screen.getByRole('link', { name: '#9' }));
    expect(useIssueModalStore.getState().target).toEqual({ repoId: 'repo-1', number: 9 });
  });

  it('Cmd-click does not open the modal', () => {
    render(<ForgeRefLink url={ISSUE_URL} number={9} />);
    fireEvent.click(screen.getByRole('link', { name: '#9' }), { metaKey: true });
    expect(useIssueModalStore.getState().target).toBeNull();
  });
});
