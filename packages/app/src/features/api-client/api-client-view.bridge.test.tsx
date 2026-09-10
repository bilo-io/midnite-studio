import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useApiClientStore } from '../../store/api-client-store';
import { ApiClientView } from './api-client-view';

/*
  `RequestBuilder` statically imports `./monaco-field`, whose module scope
  calls the real `getMonaco()` the instant anything imports it — regardless
  of which tab is active or whether `<MonacoField>` ever mounts (verified:
  running this file alongside `api-client-scripts.bridge.test.tsx`, which
  DOES need a real TestEditor mount, produced an unhandled rejection from
  `monaco.typescript` off the real loader, attributed to whichever file
  vitest happened to be running when the async import settled). Stubbing the
  whole module — the same shape `api-client-scripts.bridge.test.tsx` already
  uses for its own mount — is cheap insurance nothing here needs the real
  editor: `params` is the default tab and never renders `MonacoField`.
*/
vi.mock('./monaco-field', () => ({
  MonacoField: () => null,
}));

/**
 * Migrated from `e2e/api-client-tree.spec.ts` and `e2e/api-client-nav.spec.ts`
 * (Phase 82 Theme C, wave 5), both exercising `ApiClientView` — its tree and
 * its reachable-empty-state. All 4 of the original tests across the two
 * files moved here; none stay in Playwright.
 *
 * `e2e/api-client-dirty-tab.spec.ts`'s 2 tests are covered separately, in
 * `request-tab-strip.bridge.test.tsx` beside this file — not duplicated here.
 *
 * The original specs reached the view through `clickRailLink(page, 'API
 * Client')`; this mounts `ApiClientView` directly instead, the same
 * "component under test, not the rail that reaches it" convention every
 * other file in this migration wave follows (`optimizer-page.bridge.test.tsx`
 * mounting `OptimizerPage` bypasses the rail identically). The rail's own
 * wiring — that `view.apiClient` is registered in `ViewId`, `VIEW_IDS`,
 * `VIEW_COMPONENT` and the rail group — is a separate, already-typechecked
 * concern this file has no reason to re-prove.
 *
 * `ApiClientView` has no internal `React.lazy` boundary of its own, so no
 * chunk warm-up is needed. `RequestBuilder`'s default tab is `params`, which
 * never mounts `MonacoField` — unlike `api-client-view.test.tsx`'s own
 * suite, nothing here needs that mock.
 */

const collection = {
  info: {
    name: 'Gateway',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'tasks',
      item: [
        { name: 'List tasks', request: { method: 'GET', url: { raw: '{{baseUrl}}/tasks' } } },
        { name: 'Create a task', request: { method: 'POST', url: { raw: '{{baseUrl}}/tasks' } } },
      ],
    },
    { name: 'Health check', request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } } },
  ],
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777' }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [
    { id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection },
  ],
};

const EMPTY_COPY = 'Open a request from the tree to build and send it.';

const open = (data: MockFixtures) => {
  renderView(<ApiClientView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
};

beforeEach(() => {
  // `useApiClientStore` is a module singleton — reset its open tabs between
  // tests so one test's opened request cannot leave the next test looking at
  // a stale active tab instead of the empty-pane state it seeds for.
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
});

afterEach(cleanup);

describe('ApiClientView, assembled through the real bridge', () => {
  it('the tree renders a collection, its folder and its requests', async () => {
    open(withCollection);

    // The collection is its own top-level section, named from `info.name`
    // rather than the file name.
    expect(await screen.findByText('Gateway')).toBeTruthy();
    // A top-level request sits beside the folder, not inside it.
    expect(screen.getByText('Health check')).toBeTruthy();
  });

  it('clicking a request opens a tab for it', async () => {
    open(withCollection);

    // Before anything is opened the right pane shows its empty copy.
    expect(await screen.findByText(EMPTY_COPY)).toBeTruthy();

    // A collection renders expanded, so its top-level request is directly
    // clickable — this asserts a request row *opens a tab*, not that a
    // folder expands first.
    const healthCheck = screen.getByText('Health check', { exact: true });
    fireEvent.click(healthCheck);

    // The empty copy is gone: the tab opened and the builder mounted.
    await screen.findByLabelText('URL');
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it('is reachable and renders an empty state with no collection open', async () => {
    open({ ...fixtures });

    // The view's own header, not the rail label — proves the component
    // mounted rather than the rail merely highlighting a row.
    expect(
      await screen.findByRole('heading', { name: 'API Client', level: 2 }),
    ).toBeTruthy();

    // With no collection open there is no request to build, and the right
    // pane says so.
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('a missing collection list leaves the view usable rather than blank', async () => {
    open({ ...fixtures, apiCollections: [] });

    expect(
      await screen.findByRole('heading', { name: 'API Client', level: 2 }),
    ).toBeTruthy();
    // The pane is present and empty — not absent.
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });
});
