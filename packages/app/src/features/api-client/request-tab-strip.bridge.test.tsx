import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useApiClientStore } from '../../store/api-client-store';
import { ApiClientView } from './api-client-view';

/*
  Same stub `api-client-view.bridge.test.tsx` carries, for the same reason:
  `RequestBuilder` statically imports `./monaco-field`, whose module scope
  calls the real `getMonaco()` on import regardless of the active tab, which
  leaked an unhandled rejection into an unrelated file's run when this suite
  didn't stub it. `params` is the default tab here too — nothing in this
  file needs the real editor.
*/
vi.mock('./monaco-field', () => ({
  MonacoField: () => null,
}));

/**
 * Migrated from `e2e/api-client-dirty-tab.spec.ts` (Phase 82 Theme C, wave 5)
 * — editing a request marks its tab dirty, and closing a dirty tab prompts
 * before discarding; closing a clean one does not. Both original tests moved
 * here.
 *
 * Mounted through `ApiClientView` (not a bare `<RequestTabStrip>`), the same
 * reasoning `diff-view.bridge.test.tsx` gives for `CommitDetail`: the thing
 * actually under test is that a real edit inside `RequestBuilder` derives
 * `isTabDirty` and that derivation reaches the tab strip's glyph and the
 * close confirm, which only the assembled view proves. `DialogHost` (already
 * in `renderView`'s own provider stack) is what renders the confirm.
 *
 * No `React.lazy` boundary anywhere in this path (see
 * `api-client-view.bridge.test.tsx`'s own note), so no chunk warm-up needed.
 */

const collection = {
  info: {
    name: 'Gateway',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'Health check',
      request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } },
    },
  ],
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777' }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [
    { id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection },
  ],
};

function resetStore(): void {
  useApiClientStore.setState({
    collections: [],
    collectionsRepoId: null,
    collectionsStatus: 'idle',
    collectionsError: null,
    dirtyCollectionIds: new Set(),
    tabs: [],
    activeTabId: null,
    responses: {},
    inFlight: {},
    lastError: {},
  });
}

async function openHealthCheckTab(): Promise<void> {
  renderView(<ApiClientView />, { fixtures: withCollection, uiState: { selectedRepoId: 'repo-1' } });
  const row = await screen.findByText('Health check', { exact: true });
  fireEvent.click(row);
  await screen.findByLabelText('URL');
}

beforeEach(resetStore);
afterEach(cleanup);

describe('RequestTabStrip dirty tracking, assembled through the real bridge', () => {
  it('editing the URL marks the tab dirty and closing it prompts to discard', async () => {
    await openHealthCheckTab();

    // A freshly-opened tab is clean: no dirty glyph.
    expect(screen.queryByTitle('Unsaved changes')).toBeNull();

    // Edit the URL. `editDraft` diverges `draft` from `savedDraft`, and the
    // glyph follows from that derivation rather than from any flag being set.
    const url = screen.getByLabelText('URL');
    fireEvent.change(url, { target: { value: 'http://127.0.0.1:7777/health?verbose=1' } });
    expect(await screen.findByTitle('Unsaved changes')).toBeTruthy();

    // Closing a dirty tab must not discard silently.
    fireEvent.click(screen.getByLabelText('Close Health check'));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText('Discard unsaved changes to "Health check"?')).toBeTruthy();

    // Confirming discards: the tab goes, and the pane returns to its empty copy.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(
        screen.getByText('Open a request from the tree to build and send it.'),
      ).toBeTruthy(),
    );
  });

  it('closing a clean tab closes it without prompting', async () => {
    await openHealthCheckTab();

    // No edit, so no prompt — a confirm on every close would train the user
    // to dismiss it, which is how the dirty one stops being read.
    fireEvent.click(screen.getByLabelText('Close Health check'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByText('Open a request from the tree to build and send it.'),
    ).toBeTruthy();
  });
});
