import type { ApiCollectionSummary, MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useApiClientStore } from '../../store/api-client-store';
import { DEFAULT_LAYOUT, useUiStore } from '../../store/ui-store';
import { ApiClientView } from './api-client-view';

// `monaco-field.tsx` needs a real DOM layout engine jsdom does not provide —
// same stand-in `response-viewer.test.tsx` uses.
vi.mock('./monaco-field', () => ({
  MonacoField: ({ value, language }: { value: string; language: string }) => (
    <div data-testid="monaco-field" data-language={language}>
      {value}
    </div>
  ),
}));

function renderView() {
  return render(
    <DialogHost>
      <ApiClientView />
    </DialogHost>,
  );
}

const collection: ApiCollectionSummary = {
  id: 'col-1',
  fileName: 'demo.postman_collection.json',
  collection: {
    info: { name: 'Demo API' },
    item: [{ name: 'Get user', request: { method: 'GET', url: 'https://example.com/user' } }],
  },
};

describe('ApiClientView', () => {
  beforeEach(() => {
    useUiStore.setState({ layout: DEFAULT_LAYOUT, selectedRepoId: 'repo-1' });
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

  afterEach(() => {
    cleanup();
    useUiStore.setState({ selectedRepoId: null });
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders nothing when no repository is selected — the view registry substitutes EmptyWorkspace', () => {
    useUiStore.setState({ selectedRepoId: null });
    const { container } = renderView();
    expect(container.textContent).toBe('');
  });

  it('shows the no-collections state when the repo has none', async () => {
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      apiClient: {
        listCollections: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      } as unknown as MidniteStudioBridge['apiClient'],
    };
    renderView();
    await waitFor(() => expect(screen.getByText('No collections yet')).toBeDefined());
  });

  it('shows the placeholder right pane with no tab open', () => {
    renderView();
    expect(screen.getByText('Open a request from the tree to build and send it.')).toBeDefined();
  });

  it('opens a request as a tab, showing its RequestBar and an empty response pane', async () => {
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      apiClient: {
        listCollections: vi.fn().mockResolvedValue({ ok: true, value: [collection] }),
      } as unknown as MidniteStudioBridge['apiClient'],
    };
    renderView();

    await waitFor(() => expect(screen.getByText('Get user')).toBeDefined());
    screen.getByText('Get user').click();

    expect(await screen.findByLabelText('URL')).toHaveProperty('value', 'https://example.com/user');
    expect(screen.getByText('Send the request to see a response.')).toBeDefined();
  });
});
