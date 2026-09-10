import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { ReposPanel } from '../repos/repos-panel';
import { GraphView } from './graph-view';

/**
 * Migrated from `e2e/stash-graph.spec.ts` (Phase 82 Theme C, wave 5) —
 * stashes drawn above the graph (Phase 22 Theme C): clicking a stash's own
 * pseudo-row opens its inspector, the sidebar's own stash list opens the
 * same inspector, and a repo with more entries than the visible cap
 * collapses the rest into an overflow row rather than pushing the real
 * commit history down the pane. All 3 of the original tests moved here;
 * none stay in Playwright.
 *
 * Mounted through `GraphView` directly (no `React.lazy` boundary of its
 * own — only the outer view-registry lazy-loads the *view*, bypassed here)
 * plus `ReposPanel` alongside it for the sidebar-parity test: both read the
 * identical `useUiStore` `graphSelection`/`selectStash` singleton
 * `repos-panel.tsx`'s own stash row already writes through, the same
 * cross-component proof `repos-panel.bridge.test.tsx` (a different file,
 * covering `remote-links`/`journal-undo`) relies on for its own toasts.
 *
 * Wrapped in `<ToastHost>`: `StashInspector`'s own action bar
 * (`use-stash-actions.ts`) calls `useToasts()` unconditionally, the same
 * requirement `stash-inspector.bridge.test.tsx` documents.
 */

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

const stash = (selector: string, message: string, sha: string) => ({
  selector,
  sha,
  parents: [SHA_A],
  message,
  authoredAt: Math.floor(Date.now() / 1000) - 3600,
  author: { name: 'Ada Lovelace', email: 'ada@example.com' },
});

const openGraph = (data: MockFixtures) => {
  renderView(
    <ToastHost>
      <GraphView />
    </ToastHost>,
    { fixtures: data, uiState: { selectedRepoId: 'repo-1' } },
  );
};

afterEach(cleanup);

describe('Stashes above the graph, assembled through the real bridge', () => {
  it('clicking a stash row opens its inspector', async () => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [stash('stash@{0}', 'WIP on main: refactor the sidebar tree', SHA_B)],
      stashDetails: {
        'stash@{0}': { tracked: [], index: [], untracked: [] },
      },
    };
    openGraph(data);

    fireEvent.click(await screen.findByRole('button', { name: /Stash: WIP on main/ }));
    expect(await screen.findByText('This stash changed no files.')).toBeTruthy();
  });

  it('the sidebar list opens the same inspector as the graph row', async () => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [stash('stash@{0}', 'WIP on main: refactor the sidebar tree', SHA_B)],
      stashDetails: {
        'stash@{0}': { tracked: [], index: [], untracked: [] },
      },
    };
    renderView(
      <ToastHost>
        <ReposPanel />
        <GraphView />
      </ToastHost>,
      { fixtures: data, uiState: { selectedRepoId: 'repo-1' } },
    );

    await screen.findByRole('heading', { name: 'Stashes' });
    // The sidebar row's own accessible name is the plain message — the graph
    // pseudo-row's is `Stash: <message>` (its `aria-label`), so this can only
    // match the sidebar's row.
    fireEvent.click(
      screen.getByRole('button', { name: 'WIP on main: refactor the sidebar tree' }),
    );
    expect(await screen.findByText('This stash changed no files.')).toBeTruthy();
  });

  it('collapses past two entries into an overflow row', async () => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        stash('stash@{0}', 'WIP on main: first', SHA_A),
        stash('stash@{1}', 'WIP on main: second', SHA_B),
        stash('stash@{2}', 'WIP on main: third', SHA_C),
      ],
    };
    openGraph(data);

    expect(await screen.findByRole('button', { name: /Stash: WIP on main: first/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stash: WIP on main: second/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Stash: WIP on main: third/ })).toBeNull();
    expect(screen.getByText('+1 more stash — see the sidebar')).toBeTruthy();
  });
});
