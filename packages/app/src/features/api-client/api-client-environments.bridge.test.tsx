import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useApiClientStore } from '../../store/api-client-store';
import { useUiStore } from '../../store/ui-store';
import { ApiClientView } from './api-client-view';

/**
 * Migrated from `e2e/api-client-environments.spec.ts` (Phase 82 Theme C,
 * wave 5) — Phase 70 Theme A: the environment editor's own masked row and
 * the blast-radius confirm before the first secret this app writes for a
 * repo, the switcher reflecting a newly-created environment as the active
 * one, an environment with no secret rows never needing the confirm, and a
 * request's resolved-URL preview updating on an environment switch without
 * reopening the tab. All 3 of the original tests moved here; none stay in
 * Playwright.
 *
 * **The e2e original's own real-browser bug does not apply here.** Its doc
 * comment records that a plain mouse `.click()` on "Select environment"
 * closes the popover within the same tick, because a mouse-driven focus on
 * that specific trigger reliably fires a benign `scroll` event elsewhere on
 * the page that `Popover`'s own capture-phase listener reads as "dismissed"
 * — traced to an interaction between `Popover` and `@bilo-io/shell`'s nav
 * rail, real infrastructure the spec works around with keyboard activation
 * (`focus()` + `Enter`) instead. jsdom fires no such scroll event from a
 * `fireEvent.click`, so a plain click opens the popover reliably here — the
 * helper below uses `fireEvent.click`, not a manufactured keyboard path,
 * since there is no bug in this harness to route around.
 *
 * `ApiClientView` has no internal `React.lazy` boundary, so no chunk
 * warm-up is needed.
 */

const UI_STATE = { selectedRepoId: 'repo-1' };

const collection = {
  info: { name: 'Gateway', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [{ name: 'Health check', request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } } }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [{ id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection }],
};

const open = (data: MockFixtures) => {
  renderView(<ApiClientView />, { fixtures: data, uiState: UI_STATE });
};

function openEnvironmentSwitcher(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Select environment' }));
}

function dialogByName(name: string): HTMLElement {
  return screen.getByRole('dialog', { name });
}

beforeEach(() => {
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
  // `activeEnvironmentByRepo` lives in `useUiStore`, a separate module
  // singleton — a prior test's "switching it updates the switcher"
  // assertion writes into it via `setActiveEnvironment`, and it outlives a
  // fresh `renderView` the same way `useApiClientStore`'s own fields would
  // without the reset above.
  useUiStore.setState({ activeEnvironmentByRepo: {} });
});

afterEach(cleanup);

describe('ApiClientView environments, assembled through the real bridge', () => {
  it('a secret row masks its value, and saving an unprotected repo needs the blast-radius confirm', async () => {
    open(withCollection);
    await screen.findByText('Gateway');

    openEnvironmentSwitcher();
    fireEvent.click(screen.getByText('New environment…'));

    const dialog = dialogByName('New environment');
    fireEvent.change(within(dialog).getByLabelText('Environment name'), {
      target: { value: 'Local' },
    });

    // One plain row, one secret row — the phase doc's own wording.
    const addVariable = within(dialog).getByRole('button', { name: 'Add variable' });
    fireEvent.click(addVariable);
    fireEvent.click(addVariable);

    const rows = within(dialog).getByRole('table').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const row0 = within(rows[0] as HTMLElement);
    const row1 = within(rows[1] as HTMLElement);

    fireEvent.change(row0.getByLabelText('Key'), { target: { value: 'baseUrl' } });
    fireEvent.change(row0.getByLabelText('Value'), {
      target: { value: 'http://127.0.0.1:7777' },
    });

    fireEvent.change(row1.getByLabelText('Key'), { target: { value: 'apiKey' } });
    fireEvent.change(row1.getByLabelText('Value'), { target: { value: 'sk-super-secret' } });
    // Toggles the row's type from Default to Secret. Re-queried fresh
    // rather than reusing a captured input reference — the value input is
    // keyed on `isSecret` via its own `type` attribute flip in place, but
    // querying live off `row1` (a `within` bound to the row's container
    // element, not a snapshot of its children) always reads the current DOM.
    fireEvent.click(row1.getByRole('button', { name: 'Default' }));

    const secretValue = () => row1.getByLabelText('Value') as HTMLInputElement;
    expect(secretValue().type).toBe('password');

    // Hold-to-reveal: the value is plain text only while the button is held.
    const reveal = row1.getByRole('button', { name: 'Hold to reveal' });
    fireEvent.mouseDown(reveal);
    expect(secretValue().type).toBe('text');
    fireEvent.mouseUp(reveal);
    expect(secretValue().type).toBe('password');

    // The plain row never masks.
    expect((row0.getByLabelText('Value') as HTMLInputElement).type).toBe('text');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    // One secret row in a repo nothing has protected yet — the confirm fires
    // before anything is written (`environment-io.ts`'s own once-per-repo
    // gate, mirrored by the mock's `apiEnvGitignoreProtected` default of
    // `false`).
    const confirm = await screen.findByRole('dialog', {
      name: 'Write secret values to this repository?',
    });
    expect(
      within(confirm).getByText(
        '1 secret value will be written to a local, gitignored overlay file, never committed.',
      ),
    ).toBeTruthy();

    fireEvent.click(within(confirm).getByRole('button', { name: 'Write secrets' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Write secret values to this repository?' }),
      ).toBeNull(),
    );
    expect(screen.queryByRole('dialog', { name: 'New environment' })).toBeNull();

    // A brand-new environment becomes the repo's active one immediately.
    expect(screen.getByRole('button', { name: 'Select environment' }).textContent).toContain(
      'Local',
    );
  });

  it('an environment with no secret rows never needs the confirm, and switching it updates the switcher', async () => {
    open({
      ...withCollection,
      apiEnvironments: [
        {
          id: 'prod.postman_environment.json',
          fileName: 'prod.postman_environment.json',
          environment: {
            id: 'env-prod',
            name: 'Prod',
            values: [
              { key: 'baseUrl', value: 'https://api.prod.example.com', type: 'default', enabled: true },
            ],
          },
        },
      ],
    });
    await screen.findByText('Gateway');

    const switcher = screen.getByRole('button', { name: 'Select environment' });
    expect(switcher.textContent).toContain('No environment');

    openEnvironmentSwitcher();
    fireEvent.click(await screen.findByText('Prod', { exact: true }));
    expect(switcher.textContent).toContain('Prod');

    // Editing it back to empty and saving needs no confirm at all.
    openEnvironmentSwitcher();
    fireEvent.click(screen.getByLabelText('Edit Prod'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit environment "Prod"' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove row' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit environment "Prod"' })).toBeNull(),
    );
    expect(
      screen.queryByRole('dialog', { name: 'Write secret values to this repository?' }),
    ).toBeNull();
  });

  it('switching environments changes the URL preview without reopening the tab', async () => {
    open({
      ...withCollection,
      apiEnvironments: [
        {
          id: 'dev.postman_environment.json',
          fileName: 'dev.postman_environment.json',
          environment: {
            id: 'env-dev',
            name: 'Dev',
            values: [{ key: 'baseUrl', value: 'https://dev.example.com', type: 'default', enabled: true }],
          },
        },
        {
          id: 'prod.postman_environment.json',
          fileName: 'prod.postman_environment.json',
          environment: {
            id: 'env-prod',
            name: 'Prod',
            values: [
              { key: 'baseUrl', value: 'https://api.prod.example.com', type: 'default', enabled: true },
            ],
          },
        },
      ],
    });

    fireEvent.click(await screen.findByText('Health check', { exact: true }));

    const urlInput = screen.getByLabelText('URL', { exact: true }) as HTMLInputElement;
    expect(urlInput.value).toBe('{{baseUrl}}/health');

    // No environment selected: `{{baseUrl}}` resolves against nothing (the
    // collection carries no `variable[]` of its own), so there is nothing to
    // preview and the line stays absent.
    expect(screen.queryByTestId('url-preview')).toBeNull();

    openEnvironmentSwitcher();
    fireEvent.click(await screen.findByText('Dev', { exact: true }));
    expect(await screen.findByTestId('url-preview')).toBeTruthy();
    expect(screen.getByTestId('url-preview').textContent).toContain(
      'https://dev.example.com/health',
    );
    // The raw draft is untouched — the preview is a read-only derived line.
    expect(urlInput.value).toBe('{{baseUrl}}/health');

    // Same tab, same request — switching again just re-renders the preview.
    openEnvironmentSwitcher();
    fireEvent.click(await screen.findByText('Prod', { exact: true }));
    expect(screen.getByTestId('url-preview').textContent).toContain(
      'https://api.prod.example.com/health',
    );
    expect(urlInput.value).toBe('{{baseUrl}}/health');
  });
});
