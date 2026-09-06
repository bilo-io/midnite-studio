import type { ApiResponse, MidniteStudioBridge, PostmanItem } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiTabId, isTabDirty, useApiClientStore, type ApiTabRef } from './api-client-store';
import { useUiStore } from './ui-store';

function installBridge(overrides: Partial<MidniteStudioBridge['apiClient']> = {}) {
  const apiClient = {
    listCollections: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    readCollection: vi.fn(),
    saveCollection: vi.fn().mockResolvedValue({ ok: true }),
    importCollection: vi.fn(),
    deleteCollection: vi.fn().mockResolvedValue({ ok: true }),
    exportCollection: vi.fn().mockResolvedValue({ ok: true }),
    sendRequest: vi.fn(),
    cancelRequest: vi.fn().mockResolvedValue({ ok: true }),
    listEnvironments: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    readEnvironment: vi.fn(),
    saveEnvironment: vi.fn().mockResolvedValue({ ok: true, value: { status: 'saved' } }),
    deleteEnvironment: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as MidniteStudioBridge['apiClient'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    apiClient,
  } as Partial<MidniteStudioBridge>;
  return {
    sendRequest: apiClient.sendRequest,
    cancelRequest: apiClient.cancelRequest,
    deleteCollection: apiClient.deleteCollection,
    saveCollection: apiClient.saveCollection,
    exportCollection: apiClient.exportCollection,
    listEnvironments: apiClient.listEnvironments,
    saveEnvironment: apiClient.saveEnvironment,
    deleteEnvironment: apiClient.deleteEnvironment,
  };
}

const requestItem = (name: string): PostmanItem => ({
  name,
  request: { method: 'GET', url: 'https://example.com' },
});

const refFor = (repoId: string, collectionId: string, name: string): ApiTabRef => ({
  repoId,
  collectionId,
  itemPath: [name],
  item: requestItem(name),
});

describe('api-client-store', () => {
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
      environmentsError: null,
      tabs: [],
      activeTabId: null,
      responses: {},
      inFlight: {},
      lastError: {},
    });
    useUiStore.setState({ activeEnvironmentByRepo: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  describe('open/focus/close lifecycle', () => {
    it('opens a new tab and focuses it', () => {
      const ref = refFor('repo1', 'col1', 'Get user');
      useApiClientStore.getState().openTab(ref);

      const state = useApiClientStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe(apiTabId(ref));
      expect(state.tabs[0]?.draft.url).toBe('https://example.com');
    });

    it('re-opening an already-open request focuses it without touching its draft', () => {
      const ref = refFor('repo1', 'col1', 'Get user');
      useApiClientStore.getState().openTab(ref);
      const id = apiTabId(ref);
      useApiClientStore.getState().editDraft(id, { url: 'https://edited.example.com' });

      useApiClientStore.getState().openTab(ref);

      const state = useApiClientStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe(id);
      expect(state.tabs[0]?.draft.url).toBe('https://edited.example.com');
    });

    it('openTab seeds draft.params from the URL\'s own query string (Theme D — the URL is authoritative)', () => {
      const ref: ApiTabRef = {
        repoId: 'repo1',
        collectionId: 'col1',
        itemPath: ['Search'],
        item: { name: 'Search', request: { method: 'GET', url: 'https://example.com/search?q=hello&page=2' } },
      };
      useApiClientStore.getState().openTab(ref);

      const draft = useApiClientStore.getState().tabs[0]?.draft;
      expect(draft?.params).toEqual([
        { key: 'q', value: 'hello', enabled: true },
        { key: 'page', value: '2', enabled: true },
      ]);
    });

    it('focusTab moves the active tab without changing the tab list', () => {
      const refA = refFor('repo1', 'col1', 'A');
      const refB = refFor('repo1', 'col1', 'B');
      useApiClientStore.getState().openTab(refA);
      useApiClientStore.getState().openTab(refB);

      useApiClientStore.getState().focusTab(apiTabId(refA));

      expect(useApiClientStore.getState().activeTabId).toBe(apiTabId(refA));
      expect(useApiClientStore.getState().tabs).toHaveLength(2);
    });

    it('closing the active tab selects its left neighbour', () => {
      const refA = refFor('repo1', 'col1', 'A');
      const refB = refFor('repo1', 'col1', 'B');
      const refC = refFor('repo1', 'col1', 'C');
      useApiClientStore.getState().openTab(refA);
      useApiClientStore.getState().openTab(refB);
      useApiClientStore.getState().openTab(refC);
      // Active is C (most recently opened); close it.
      useApiClientStore.getState().closeTab(apiTabId(refC));

      const state = useApiClientStore.getState();
      expect(state.tabs.map((t) => t.id)).toEqual([apiTabId(refA), apiTabId(refB)]);
      expect(state.activeTabId).toBe(apiTabId(refB));
    });

    it('closing the first tab while it is active leaves no tab focused', () => {
      const refA = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(refA);
      useApiClientStore.getState().closeTab(apiTabId(refA));

      const state = useApiClientStore.getState();
      expect(state.tabs).toHaveLength(0);
      expect(state.activeTabId).toBeNull();
    });

    it('closing an inactive tab leaves the active tab untouched', () => {
      const refA = refFor('repo1', 'col1', 'A');
      const refB = refFor('repo1', 'col1', 'B');
      useApiClientStore.getState().openTab(refA);
      useApiClientStore.getState().openTab(refB);
      useApiClientStore.getState().focusTab(apiTabId(refA));

      useApiClientStore.getState().closeTab(apiTabId(refB));

      const state = useApiClientStore.getState();
      expect(state.tabs.map((t) => t.id)).toEqual([apiTabId(refA)]);
      expect(state.activeTabId).toBe(apiTabId(refA));
    });
  });

  describe('editDraft / markSaved', () => {
    it('editDraft flips derived-dirty and markSaved clears it', () => {
      const ref = refFor('repo1', 'col1', 'Get user');
      useApiClientStore.getState().openTab(ref);
      const id = apiTabId(ref);

      let tab = useApiClientStore.getState().tabs[0]!;
      expect(isTabDirty(tab)).toBe(false);

      useApiClientStore.getState().editDraft(id, { url: 'https://changed.example.com' });
      tab = useApiClientStore.getState().tabs.find((t) => t.id === id)!;
      expect(isTabDirty(tab)).toBe(true);
      expect(tab.draft.url).toBe('https://changed.example.com');

      useApiClientStore.getState().markSaved(id);
      tab = useApiClientStore.getState().tabs.find((t) => t.id === id)!;
      expect(isTabDirty(tab)).toBe(false);
      expect(tab.savedDraft.url).toBe('https://changed.example.com');
    });

    it('editDraft on an undo back to the saved value is clean again', () => {
      const ref = refFor('repo1', 'col1', 'Get user');
      useApiClientStore.getState().openTab(ref);
      const id = apiTabId(ref);

      useApiClientStore.getState().editDraft(id, { url: 'https://changed.example.com' });
      useApiClientStore.getState().editDraft(id, { url: 'https://example.com' });

      const tab = useApiClientStore.getState().tabs.find((t) => t.id === id)!;
      expect(isTabDirty(tab)).toBe(false);
    });
  });

  describe('closeRepoTabs', () => {
    it('drops only the named repo\'s tabs and leaves another repo\'s alone', () => {
      const refRepo1 = refFor('repo1', 'col1', 'A');
      const refRepo2 = refFor('repo2', 'col2', 'B');
      useApiClientStore.getState().openTab(refRepo1);
      useApiClientStore.getState().openTab(refRepo2);

      useApiClientStore.getState().closeRepoTabs('repo1');

      const state = useApiClientStore.getState();
      expect(state.tabs.map((t) => t.id)).toEqual([apiTabId(refRepo2)]);
      expect(state.activeTabId).toBe(apiTabId(refRepo2));
    });

    it('resets activeTabId when the active tab belonged to the closed repo', () => {
      const refRepo1 = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(refRepo1);

      useApiClientStore.getState().closeRepoTabs('repo1');

      expect(useApiClientStore.getState().activeTabId).toBeNull();
    });

    it('cancels an in-flight request belonging to the closed repo', async () => {
      const { sendRequest, cancelRequest } = installBridge({
        sendRequest: vi.fn(() => new Promise<never>(() => {})),
      });
      const ref = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(ref);
      void useApiClientStore.getState().sendRequest(apiTabId(ref));
      await Promise.resolve();
      expect(sendRequest).toHaveBeenCalled();
      expect(useApiClientStore.getState().inFlight[apiTabId(ref)]).toBeDefined();

      useApiClientStore.getState().closeRepoTabs('repo1');

      expect(cancelRequest).toHaveBeenCalledTimes(1);
      expect(useApiClientStore.getState().inFlight[apiTabId(ref)]).toBeUndefined();
    });
  });

  describe('renameCollection', () => {
    const summary = {
      id: 'col1',
      fileName: 'demo.postman_collection.json',
      collection: { info: { name: 'Old Name' }, item: [] },
    };

    it('persists via saveCollection and updates the in-memory name', async () => {
      const { saveCollection } = installBridge();
      useApiClientStore.setState({ collections: [summary], collectionsRepoId: 'repo1' });

      await useApiClientStore.getState().renameCollection('col1', 'New Name');

      expect(saveCollection).toHaveBeenCalledWith({
        repoId: 'repo1',
        collectionId: 'col1',
        collection: { info: { name: 'New Name' }, item: [] },
      });
      expect(useApiClientStore.getState().collections[0]?.collection.info.name).toBe('New Name');
    });

    it('leaves the name unchanged when saveCollection fails', async () => {
      installBridge({ saveCollection: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'nope' }) });
      useApiClientStore.setState({ collections: [summary], collectionsRepoId: 'repo1' });

      await useApiClientStore.getState().renameCollection('col1', 'New Name');

      expect(useApiClientStore.getState().collections[0]?.collection.info.name).toBe('Old Name');
    });
  });

  describe('sendRequest', () => {
    it('records a successful response in the tab\'s history', async () => {
      const response: ApiResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{}',
        bodyIsJson: true,
        contentType: 'application/json',
        durationMs: 12,
        sizeBytes: 2,
        truncated: false,
        warnings: [],
      };
      installBridge({ sendRequest: vi.fn().mockResolvedValue({ ok: true, value: response }) });
      const ref = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(ref);
      const id = apiTabId(ref);

      await useApiClientStore.getState().sendRequest(id);

      const state = useApiClientStore.getState();
      expect(state.responses[id]).toEqual([response]);
      expect(state.inFlight[id]).toBeUndefined();
      expect(state.lastError[id]).toBeUndefined();
    });

    it('records a failure envelope without throwing', async () => {
      installBridge({
        sendRequest: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'Timed out' }),
      });
      const ref = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(ref);
      const id = apiTabId(ref);

      await useApiClientStore.getState().sendRequest(id);

      const state = useApiClientStore.getState();
      expect(state.lastError[id]).toBe('Timed out');
      expect(state.inFlight[id]).toBeUndefined();
      expect(state.responses[id]).toBeUndefined();
    });

    it('sends the repo\'s active environment id, read from ui-store at send time', async () => {
      const { sendRequest } = installBridge({
        sendRequest: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '',
            bodyIsJson: false,
            contentType: null,
            durationMs: 1,
            sizeBytes: 0,
            truncated: false,
            warnings: [],
          },
        }),
      });
      useUiStore.setState({ activeEnvironmentByRepo: { repo1: 'prod.postman_environment.json' } });
      const ref = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(ref);

      await useApiClientStore.getState().sendRequest(apiTabId(ref));

      expect(sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({ environmentId: 'prod.postman_environment.json' }),
      );
    });

    it('sends environmentId: null for a repo with no environment selected', async () => {
      const { sendRequest } = installBridge({
        sendRequest: vi.fn().mockResolvedValue({
          ok: false,
          kind: 'error',
          message: 'nope',
        }),
      });
      const ref = refFor('repo1', 'col1', 'A');
      useApiClientStore.getState().openTab(ref);

      await useApiClientStore.getState().sendRequest(apiTabId(ref));

      expect(sendRequest).toHaveBeenCalledWith(expect.objectContaining({ environmentId: null }));
    });
  });

  describe('environments', () => {
    const summary = {
      id: 'local.postman_environment.json',
      fileName: 'local.postman_environment.json',
      environment: { id: 'env-1', name: 'Local', values: [] },
    };

    it('loadEnvironments populates the list on success', async () => {
      installBridge({ listEnvironments: vi.fn().mockResolvedValue({ ok: true, value: [summary] }) });

      await useApiClientStore.getState().loadEnvironments('repo1');

      const state = useApiClientStore.getState();
      expect(state.environmentsStatus).toBe('ready');
      expect(state.environments).toEqual([summary]);
      expect(state.environmentsRepoId).toBe('repo1');
    });

    it('loadEnvironments records the message on failure', async () => {
      installBridge({
        listEnvironments: vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'nope' }),
      });

      await useApiClientStore.getState().loadEnvironments('repo1');

      expect(useApiClientStore.getState().environmentsStatus).toBe('error');
      expect(useApiClientStore.getState().environmentsError).toBe('nope');
    });

    it('saveEnvironment returns the needs-confirm outcome and refreshes nothing', async () => {
      const { saveEnvironment, listEnvironments } = installBridge({
        saveEnvironment: vi.fn().mockResolvedValue({
          ok: true,
          value: { status: 'needs-confirm', secretCount: 1, gitignorePath: '.midnite/api/.gitignore' },
        }),
      });
      useApiClientStore.setState({ environmentsRepoId: 'repo1' });

      const result = await useApiClientStore
        .getState()
        .saveEnvironment('repo1', null, { id: 'e', name: 'Local', values: [] });

      expect(saveEnvironment).toHaveBeenCalledWith({
        repoId: 'repo1',
        environmentId: null,
        environment: { id: 'e', name: 'Local', values: [] },
        confirmed: false,
      });
      expect(result).toEqual({
        ok: true,
        value: { status: 'needs-confirm', secretCount: 1, gitignorePath: '.midnite/api/.gitignore' },
      });
      // needs-confirm wrote nothing on disk, so nothing to re-read yet.
      expect(listEnvironments).not.toHaveBeenCalled();
    });

    it('saveEnvironment refreshes the list once the outcome is saved', async () => {
      const { listEnvironments } = installBridge({
        saveEnvironment: vi.fn().mockResolvedValue({ ok: true, value: { status: 'saved' } }),
        listEnvironments: vi.fn().mockResolvedValue({ ok: true, value: [summary] }),
      });
      useApiClientStore.setState({ environmentsRepoId: 'repo1' });

      const result = await useApiClientStore
        .getState()
        .saveEnvironment('repo1', null, { id: 'e', name: 'Local', values: [] }, true);

      expect(result).toEqual({ ok: true, value: { status: 'saved' } });
      expect(listEnvironments).toHaveBeenCalledWith({ repoId: 'repo1' });
      expect(useApiClientStore.getState().environments).toEqual([summary]);
    });

    it('removeEnvironment drops it from the in-memory list on success', async () => {
      installBridge({ deleteEnvironment: vi.fn().mockResolvedValue({ ok: true }) });
      useApiClientStore.setState({ environments: [summary] });

      await useApiClientStore.getState().removeEnvironment('repo1', summary.id);

      expect(useApiClientStore.getState().environments).toEqual([]);
    });
  });
});
