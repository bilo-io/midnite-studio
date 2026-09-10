import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useApiClientStore } from '../../store/api-client-store';
import { ApiClientView } from './api-client-view';

/**
 * Migrated from `e2e/api-client-scripts.spec.ts` (Phase 82 Theme C, wave 5)
 * — Phase 70 Themes B and C: the Scripts tab's own rendering of a passing
 * and a failing assertion, a script that throws rendering as an error row
 * rather than an error boundary, the consent bar's "Run once" path (and a
 * fresh mount asking again), and the collection runner's aggregate summary
 * plus a mid-run Stop. All 5 of the original tests moved here; none stay in
 * Playwright.
 *
 * Mounted through `ApiClientView` (not `TestResultsPanel`/`CollectionRunner`
 * standalone), the same "component under test, not the rail that reaches
 * it" convention `api-client-view.bridge.test.tsx` already follows for this
 * feature — the tree, the tab strip and the runner's own collection-picking
 * all matter here, not just the leaf panel.
 *
 * Reload is simulated by unmounting and re-rendering with a fresh
 * `useApiClientStore` reset — this suite's mock bridge is rebuilt fresh for
 * every `renderView` the same way `installMockBridge`'s `addInitScript`
 * reruns on a real page reload, so a `cleanup()` + a second `renderView`
 * call is the honest jsdom analogue of `page.reload()`.
 *
 * `TestEditor` (the Scripts tab's two script fields) mounts `MonacoField`
 * unconditionally, and its own `useEffect` calls the real
 * `lib/monaco/monaco-loader`'s `getMonaco()` to register the `pm.d.ts`
 * ambient lib — both mocked below, the same stand-ins
 * `request-builder.test.tsx` (`./monaco-field`) and `module-mocks.ts`
 * (`mockMonacoLoaderModule`) already use elsewhere in this feature; nothing
 * here exercises Monaco's own rendering, so replacing both is a no-op for
 * every assertion this file makes.
 */

/*
  A fuller shape than `module-mocks.ts`'s own `mockMonacoLoaderModule` —
  `test-editor.tsx`'s `ensurePmAmbientLib` (unlike the theme-only callers
  that helper was written for) also reaches `monaco.typescript
  .javascriptDefaults.addExtraLib`, which the shared stub does not provide
  and which otherwise throws inside an un-awaited `.then`, failing the file
  with an unhandled rejection regardless of which test happens to trigger
  the first `TestEditor` mount.
*/
vi.mock('../../lib/monaco/monaco-loader', () => ({
  getMonaco: async () => ({
    editor: { defineTheme: () => {}, setTheme: () => {} },
    typescript: { javascriptDefaults: { addExtraLib: () => {} } },
  }),
}));
vi.mock('./monaco-field', () => ({
  MonacoField: ({
    value,
    onChange,
    language,
  }: {
    value: string;
    onChange: (v: string) => void;
    language: string;
  }) => (
    <textarea
      data-testid="monaco-field"
      data-language={language}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const UI_STATE = { selectedRepoId: 'repo-1' };

const scriptedRequest = (name: string) => ({
  name,
  request: { method: 'GET', url: { raw: '{{baseUrl}}/things' } },
  event: [
    {
      listen: 'test',
      script: { exec: ["pm.test('placeholder', () => pm.expect(1).to.equal(1));"] },
    },
  ],
});

const open = (data: MockFixtures) => {
  renderView(<ApiClientView />, { fixtures: data, uiState: UI_STATE });
};

function resetStore() {
  useApiClientStore.setState({
    collections: [],
    collectionsRepoId: null,
    collectionsStatus: 'idle',
    collectionsError: null,
    dirtyCollectionIds: new Set(),
    environments: [],
    environmentsRepoId: null,
    environmentsStatus: 'idle',
    tabs: [],
    activeTabId: null,
    responses: {},
    inFlight: {},
    lastError: {},
    scriptRuns: {},
    runs: {},
    runnerCollectionId: null,
  });
}

beforeEach(resetStore);
afterEach(cleanup);

describe('ApiClientView Scripts tab and collection runner, assembled through the real bridge', () => {
  it('a passing and a failing assertion both render', async () => {
    const collection = {
      info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [scriptedRequest('List widgets')],
    };
    const fixture: MockFixtures = {
      ...fixtures,
      apiCollections: [
        { id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection },
      ],
      apiTrustedCollections: ['widgets.postman_collection.json'],
      apiScriptRun: {
        results: [
          { name: 'status is 200', passed: true },
          { name: 'has an id', passed: false, error: 'expected undefined to equal 1' },
        ],
        logs: [],
        error: null,
      },
    };
    open(fixture);

    fireEvent.click(await screen.findByText('List widgets', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Scripts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('status is 200')).toBeTruthy();
    expect(screen.getByText('has an id')).toBeTruthy();
    expect(screen.getByText('expected undefined to equal 1')).toBeTruthy();

    // Never an error boundary — a normal, renderable outcome. Unlike the
    // e2e original (which also has to rule out Monaco's own unlabelled
    // `role="alert"` regions), Monaco itself is mocked away here entirely,
    // so there is nothing unlabelled to exclude — a plain absence check is
    // the whole assertion.
    expect(screen.queryByRole('alert', { name: /stopped rendering/i })).toBeNull();
  });

  it('a script that throws renders as an error row, not an error boundary', async () => {
    const collection = {
      info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [scriptedRequest('Throws')],
    };
    const fixture: MockFixtures = {
      ...fixtures,
      apiCollections: [
        { id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection },
      ],
      apiTrustedCollections: ['widgets.postman_collection.json'],
      apiScriptRun: { results: [], logs: [], error: 'top-level boom' },
    };
    open(fixture);

    fireEvent.click(await screen.findByText('Throws', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Scripts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('top-level boom')).toBeTruthy();
    expect(screen.queryByRole('alert', { name: /stopped rendering/i })).toBeNull();
    // The rest of the shell is still there — nothing above the panel was
    // torn down by an uncaught render error.
    expect(screen.getByRole('button', { name: 'Select environment' })).toBeTruthy();
  });

  it('the consent bar appears for an untrusted collection, Run once runs the script, and a reload asks again', async () => {
    const collection = {
      info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [scriptedRequest('Ping')],
    };
    const fixture: MockFixtures = {
      ...fixtures,
      apiCollections: [
        { id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection },
      ],
      // No `apiTrustedCollections` — untrusted, exactly like a fresh checkout.
      apiScriptRun: { results: [{ name: 'ok', passed: true }], logs: [], error: null },
    };
    open(fixture);

    fireEvent.click(await screen.findByText('Ping', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Scripts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('This collection contains scripts. Run them?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Run once' }));
    await waitFor(() =>
      expect(screen.queryByText('This collection contains scripts. Run them?')).toBeNull(),
    );
    expect(screen.getByText('ok', { exact: true })).toBeTruthy();

    // Reload rather than re-send in place: a fresh mount is the honest
    // jsdom analogue of what a real reload does to the mock bridge's own
    // in-memory trust state — "Run once" never calls `setScriptTrust`, so a
    // fresh bridge is exactly as untrusted as the first one was.
    cleanup();
    resetStore();
    open(fixture);

    fireEvent.click(await screen.findByText('Ping', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Scripts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('This collection contains scripts. Run them?')).toBeTruthy();
  });

  const runItem = (
    name: string,
    status: 'passed' | 'failed' | 'error',
    overrides: Record<string, unknown> = {},
  ) => ({
    itemPath: [name],
    name,
    method: 'GET',
    status,
    durationMs: 12,
    response: {
      status: status === 'error' ? 0 : 200,
      statusText: status === 'error' ? '' : 'OK',
      headers: {},
      body: '{"ok":true}',
      bodyIsJson: true,
      durationMs: 12,
      sizeBytes: 11,
      truncated: false,
      warnings: [],
    },
    assertions: status === 'failed' ? [{ name: 'is ok', passed: false, error: 'boom' }] : [],
    error: status === 'error' ? 'transport failure' : null,
    ...overrides,
  });

  const runnerCollection = {
    info: { name: 'Suite', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [
      { name: 'One', request: { method: 'GET', url: { raw: '{{baseUrl}}/a' } } },
      { name: 'Two', request: { method: 'GET', url: { raw: '{{baseUrl}}/b' } } },
      { name: 'Three', request: { method: 'GET', url: { raw: '{{baseUrl}}/c' } } },
      { name: 'Four', request: { method: 'GET', url: { raw: '{{baseUrl}}/d' } } },
    ],
  };

  async function openRunner(): Promise<void> {
    fireEvent.contextMenu(await screen.findByText('One', { exact: true }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Run collection…' }));
  }

  it('running a four-request fixture collection shows the aggregate summary', async () => {
    const fixture: MockFixtures = {
      ...fixtures,
      apiCollections: [
        { id: 'suite.postman_collection.json', fileName: 'suite.postman_collection.json', collection: runnerCollection },
      ],
      apiTrustedCollections: ['suite.postman_collection.json'],
      apiRunItems: [
        runItem('One', 'passed'),
        runItem('Two', 'failed'),
        runItem('Three', 'passed'),
        runItem('Four', 'passed'),
      ],
      apiRunItemDelayMs: 15,
    };
    open(fixture);

    await openRunner();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('4/4')).toBeTruthy();
    expect(screen.getByText('3 passed')).toBeTruthy();
    expect(screen.getByText('1 failed')).toBeTruthy();
  });

  it('Stop mid-run leaves the remainder marked skipped', async () => {
    const fixture: MockFixtures = {
      ...fixtures,
      apiCollections: [
        { id: 'suite.postman_collection.json', fileName: 'suite.postman_collection.json', collection: runnerCollection },
      ],
      apiTrustedCollections: ['suite.postman_collection.json'],
      apiRunItems: [
        runItem('One', 'passed'),
        runItem('Two', 'passed'),
        runItem('Three', 'passed'),
        runItem('Four', 'passed'),
      ],
      // Slow enough that a click on Stop lands between two progress events.
      apiRunItemDelayMs: 250,
    };
    open(fixture);

    await openRunner();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // "One" has landed — the summary strip's live count is the unique
    // signal, since "One" itself renders in both the tree on the left and
    // the runner's own list.
    expect(await screen.findByText('1/4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Aborted')).toBeTruthy();
    expect(screen.getByText(/skipped$/)).toBeTruthy();
    // "One" is the only request that actually ran.
    expect(screen.getByText('1/4')).toBeTruthy();
  });
});
