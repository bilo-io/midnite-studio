import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { ReposPanel } from './repos-panel';

/**
 * Migrated from `e2e/repo-favourites.spec.ts` (Phase 82 Theme C, wave 5) —
 * both of the original tests, verbatim: adding a repo to Favourites from the
 * ellipsis lifecycle menu (and removing it again), and the same round trip
 * through the row's right-click context menu. Both tests moved; none stay in
 * Playwright.
 *
 * `ReposPanel` has no internal `React.lazy` boundary of its own, so no
 * chunk warm-up is needed (the same conclusion every other wave-5 file in
 * this batch reached). Favourite status lives in `ui-store`'s
 * `favouriteRepoIds`, read synchronously — no bridge round trip to await.
 *
 * `ReposPanel` also reaches `useToasts()` (via `useRepoActions`'s
 * `useTargetedGitOp`), which `renderView`'s own provider stack does not
 * supply — `repos-panel-popout.test.tsx` wraps it for the same reason — so
 * this file wraps it in `ToastHost` itself rather than touching
 * `test-support/render.tsx`.
 */

const REPO = 'midnite-studio';

afterEach(cleanup);

describe('repo favourites', () => {
  it('adds repo to favourites, shows Favourites section at top, and removes from favourites', async () => {
    renderView(
      <ToastHost>
        <ReposPanel />
      </ToastHost>,
      { fixtures },
    );

    // Initially, no Favourites section is present.
    expect(screen.queryByTestId('repo-favourites-section')).toBeNull();

    // Wait for the repo list to load before opening its lifecycle menu.
    await screen.findByRole('button', { name: REPO });

    // Open repo lifecycle actions menu (the ellipsis button).
    fireEvent.click(
      screen.getByRole('button', { name: `Set up, install, build, test or launch ${REPO}` }),
    );

    // "Add to Favourites" is offered; click it.
    const addFavItem = await screen.findByRole('menuitem', { name: 'Add to Favourites' });
    fireEvent.click(addFavItem);

    // Favourites section is now visible at the top.
    const favSection = await screen.findByTestId('repo-favourites-section');
    expect(within(favSection).getByText('Favourites')).toBeTruthy();

    // The favourite repo item is rendered inside the favourites section.
    expect(within(favSection).getByRole('button', { name: REPO })).toBeTruthy();

    // Open the ellipsis menu on the favourite repo inside the favourites section.
    fireEvent.click(
      within(favSection).getByRole('button', {
        name: `Set up, install, build, test or launch ${REPO}`,
      }),
    );

    // Option now says "Remove from Favourites".
    const removeFavItem = await screen.findByRole('menuitem', { name: 'Remove from Favourites' });
    fireEvent.click(removeFavItem);

    // Favourites section disappears when there are no favourites left.
    expect(screen.queryByTestId('repo-favourites-section')).toBeNull();
  });

  it('context menu on repo also offers Add to Favourites / Remove from Favourites', async () => {
    renderView(
      <ToastHost>
        <ReposPanel />
      </ToastHost>,
      { fixtures },
    );

    const repoBtn = await screen.findByRole('button', { name: REPO });
    fireEvent.contextMenu(repoBtn);

    const addFavItem = await screen.findByRole('menuitem', { name: 'Add to Favourites' });
    fireEvent.click(addFavItem);

    const favSection = await screen.findByTestId('repo-favourites-section');

    // Right click the repo inside the favourites section.
    const favRepoBtn = within(favSection).getByRole('button', { name: REPO });
    fireEvent.contextMenu(favRepoBtn);
    const removeFavItem = await screen.findByRole('menuitem', { name: 'Remove from Favourites' });
    fireEvent.click(removeFavItem);

    expect(screen.queryByTestId('repo-favourites-section')).toBeNull();
  });
});
