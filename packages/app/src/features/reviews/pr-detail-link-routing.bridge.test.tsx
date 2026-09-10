import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useBrowserStore } from '../../store/browser-store';
import { useUiStore } from '../../store/ui-store';
import { PrDetail } from './pr-detail';

/**
 * Migrated from `e2e/link-routing.spec.ts` (Phase 82 Theme C wave 5) — Phase
 * 71 Theme B's link-routing migration, proved on a real call site. The unit
 * tests (`open-in-midnite.test.ts`) already cover `resolveLinkTarget`/
 * `openInMidnite` against a bare store; what this file proves is that
 * `PrDetail`'s "Open on GitHub" button is actually wired to them: with the
 * stored preference on Midnite's own browser the click reaches `openTab` and
 * never `shell.openExternal`, flipping the preference reverses which one
 * fires, and Shift always overrides to the system browser. 3 of the original
 * 4 tests moved here; 1 stays in Playwright, below.
 *
 * Mounted through `PrDetail` directly (`repoId`/`number` props), the same
 * pattern `pr-detail.bridge.test.tsx` already uses for the write path — this
 * is a different concern (link routing, not review actions), so it gets its
 * own file rather than growing that one.
 *
 * **1 of the original 4 stays in Playwright**: "a PR opened from repo A's
 * Reviews view and one from repo B land in two different tab groups" needs
 * the real sidebar's repo tree (two repos, each with its own Reviews
 * section), the full-screen `BrowserPane` overlay and its "Close browser"
 * button, and the tab-group buttons the strip derives — none of which
 * mounting `PrDetail` alone reaches. It is a genuine cross-component/whole-
 * shell flow, not a property of `PrDetail` itself.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  checks: 'passing',
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
};

const pullDetail = {
  body: 'Why this exists.',
  headSha: 'a'.repeat(40),
  baseBranch: 'main',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  mergeable: 'MERGEABLE',
};

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: { '42': pullDetail },
  },
};

const externalUrls = (): string[] =>
  (window as unknown as { __mstudioExternalUrls?: string[] }).__mstudioExternalUrls ?? [];

/** Mount `PrDetail` on #42 and return its "Open on GitHub" button. */
async function openPullDetail(): Promise<HTMLElement> {
  renderView(<PrDetail repoId="repo-1" number={42} />, { fixtures: data });
  await screen.findByRole('region', { name: 'Pull request #42' });
  return screen.getByRole('button', { name: 'Open #42 on GitHub' });
}

afterEach(() => {
  cleanup();
  useUiStore.setState({ linkTarget: 'in-app' });
  useBrowserStore.setState({ tabs: [], activeTabId: null });
});

describe('PrDetail — link routing, assembled through the real bridge', () => {
  it('with Midnite browser selected, opening a pull request opens a tab and never reaches openExternal', async () => {
    // 'in-app' is the default, so no seeding needed — this is the state a
    // fresh install starts in.
    const openOnGitHub = await openPullDetail();
    fireEvent.click(openOnGitHub);

    await waitFor(() => expect(useBrowserStore.getState().tabs).toHaveLength(1));
    expect(useBrowserStore.getState().tabs[0]?.url).toMatch(/github\.com/);
    expect(externalUrls()).toEqual([]);
  });

  it('with System browser selected, the same click reaches openExternal instead', async () => {
    useUiStore.setState({ linkTarget: 'system' });
    const openOnGitHub = await openPullDetail();
    fireEvent.click(openOnGitHub);

    await waitFor(() =>
      expect(externalUrls()).toEqual(['https://github.com/bilo-io/midnite-studio/pull/42']),
    );
    // No browser pane raised, and nothing in its tab strip — 'system' means the
    // link left the app rather than landing in a tab nobody asked to see.
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('shift-click always reaches openExternal, regardless of the stored preference', async () => {
    // The default preference is 'in-app' — proving Shift overrides it, rather
    // than merely agreeing with it, is the point of this case.
    const openOnGitHub = await openPullDetail();
    fireEvent.click(openOnGitHub, { shiftKey: true });

    await waitFor(() =>
      expect(externalUrls()).toEqual(['https://github.com/bilo-io/midnite-studio/pull/42']),
    );
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });
});
