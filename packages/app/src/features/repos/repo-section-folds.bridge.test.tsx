import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { useUiStore } from '../../store/ui-store';
import { ReposPanel } from './repos-panel';

/**
 * Migrated from `e2e/repo-section-folds.spec.ts` (Phase 82 Theme C, wave 5) —
 * Phase 28 Theme D's own claim: a repo's folded sidebar sections live in
 * `ui-store`'s `collapsedRepoSections`/`collapsedRefGroups` rather than a
 * per-mount `useState`, so they survive `RepoTree` unmounting and remounting
 * when the repo row itself is collapsed and re-expanded.
 *
 * **Both original tests stay in Playwright too, unweakened** — each also
 * asserts the fold state survives a real `page.reload()`, which is
 * `zustand/persist` rehydrating a *fresh* store from `localStorage`; `render.tsx`'s
 * own doc comment explains why that is unreachable here (`useUiStore` is a
 * module singleton hydrated once, at import time, so nothing after that
 * point can re-run its rehydration). This is the same reasoning
 * `commit-detail.bridge.test.tsx`'s and `settings-view.bridge.test.tsx`'s own
 * reload stragglers give. What follows is a **new** test — not a weakened
 * substitute — proving the non-reload half both e2e tests already cover:
 * a section's fold surviving the repo row's own unmount/remount, and one
 * remote group's fold staying independent of the `Remotes` section it lives
 * inside.
 *
 * `ReposPanel` has no internal `React.lazy` boundary, so no chunk warm-up is
 * needed. It also reaches `useToasts()` (via `useRepoActions`'s
 * `useTargetedGitOp`), which `renderView`'s provider stack does not supply —
 * wrapped here in `ToastHost` directly, the same fix
 * `repo-favourites.bridge.test.tsx` needed.
 */

const remoteRef = (remote: string, branch: string) => ({
  name: `${remote}/${branch}`,
  fullName: `refs/remotes/${remote}/${branch}`,
  kind: 'remoteBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
});

const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: 'a'.repeat(40),
    upstream: null,
    isHead: true,
    worktreePath: null,
  },
  remoteRef('origin', 'main'),
];

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const withRemotes: MockFixtures = { ...fixtures, refs: REFS, remotes: REMOTES };

const open = async () => {
  renderView(
    <ToastHost>
      <ReposPanel />
    </ToastHost>,
    { fixtures: withRemotes },
  );
  await screen.findByRole('heading', { name: 'Remotes' });
};

/** A section's fold toggle. Its accessible name is the title, plus a count. */
const section = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });

beforeEach(() => {
  // `collapsedRepoSections` lives on `ui-store`'s module singleton, which
  // outlives any one test — reset it so a fold from one test cannot leak
  // into the next the way a per-mount `useState` never could.
  useUiStore.setState({ collapsedRepoSections: {} });
});

afterEach(cleanup);

describe('repo section folds', () => {
  it('folding Remotes survives collapsing and re-expanding the repo row', async () => {
    await open();

    fireEvent.click(section('Remotes'));
    expect(section('Remotes').getAttribute('aria-expanded')).toBe('false');

    // Collapsing the repo row unmounts `RepoTree` outright — the regression a
    // per-mount `useState` could not survive.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse midnite-studio' }));
    expect(screen.queryByRole('heading', { name: 'Remotes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand midnite-studio' }));
    await screen.findByRole('heading', { name: 'Remotes' });
    expect(section('Remotes').getAttribute('aria-expanded')).toBe('false');
  });

  it("a remote group's own fold is independent of Remotes", async () => {
    await open();

    fireEvent.click(section('origin'));
    expect(section('origin').getAttribute('aria-expanded')).toBe('false');
    // Folding one remote group must not touch the section it lives inside.
    expect(section('Remotes').getAttribute('aria-expanded')).toBe('true');
  });
});
