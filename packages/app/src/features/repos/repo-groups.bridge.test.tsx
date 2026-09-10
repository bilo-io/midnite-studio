import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import { ReposPanel } from './repos-panel';

/**
 * Migrated from `e2e/repo-group-actions.spec.ts` (Phase 82 Theme C, wave 5) —
 * the group header's own per-group Collapse-all and Fetch-all affordances,
 * reached the way a user reaches them: by creating a group through
 * `NewGroupButton`'s real prompt dialog (`repo-groups.tsx`) rather than by
 * seeding `useUiStore.repoGroups` directly, which would skip the one wiring
 * the original test was about. **The single original test moved here, so
 * `e2e/repo-group-actions.spec.ts` is deleted** — it existed for this test
 * alone, and nothing in it needed a real browser: the two affordances are
 * asserted as DOM presence, exactly as the Playwright original did (its
 * `toBeVisible()` already passed against the `opacity-0
 * group-hover:opacity-100` class these buttons carry, since opacity is not
 * visibility).
 *
 * Mounted inside `ToastHost` as well as `renderView`'s own provider stack:
 * `RepoItem`'s `useRepoActions` → `useTargetedGitOp` calls `useToasts()`,
 * which throws outside a host — the same reason
 * `status-panel.bridge.test.tsx` wraps its own subject.
 *
 * The e2e original scoped every query to `getByRole('complementary', {name:
 * 'Repositories'})`. That `aria-label`led `<aside>` lives one level up in
 * `app.tsx`, not inside `ReposPanel`, so there is nothing to scope against
 * here and nothing to disambiguate from — the panel is the only thing
 * mounted.
 *
 * `ReposPanel` has no internal `React.lazy` boundary (only the outer
 * `view-registry.tsx` lazy-loads whole *views*, which mounting a component
 * directly bypasses), so no chunk warm-up is needed — the same conclusion
 * `actions-view.bridge.test.tsx` reached for `ActionsView`.
 */

/**
 * `repoGroups` is persisted `useUiStore` state, and the store is a module
 * singleton shared by every test in the file — so a group one test creates is
 * still there for the next one unless it is cleared, and the `/^Work Group
 * \d+$/` toggle would then match two rows.
 */
beforeEach(() => {
  useUiStore.setState({ repoGroups: [], repoGroupMembership: {}, favouriteRepoIds: [] });
});

afterEach(cleanup);

describe('repo groups, assembled through the real bridge', () => {
  it('a group header renders collapse/expand-all and fetch-all buttons', async () => {
    renderView(
      <ToastHost>
        <ReposPanel />
      </ToastHost>,
      { fixtures },
    );
    await screen.findByRole('heading', { name: 'Worktrees' });

    // Create a group, through the real prompt dialog.
    fireEvent.click(screen.getByRole('button', { name: 'New repo group' }));
    const name = await screen.findByLabelText('Group name');
    fireEvent.change(name, { target: { value: 'Work Group' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // The group's own toggle row, carrying its name and its repo count — a
    // regex, because the accessible name is "Work Group" followed by that
    // count, and Testing Library matches the WHOLE name by default (unlike
    // Playwright's own substring default).
    expect(await screen.findByRole('button', { name: /^Work Group \d+$/ })).toBeTruthy();

    // The two per-group affordances the original test exists for.
    expect(
      screen.getByRole('button', { name: 'Collapse all repositories in Work Group' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Fetch all repositories in Work Group' }),
    ).toBeTruthy();
  });
});
