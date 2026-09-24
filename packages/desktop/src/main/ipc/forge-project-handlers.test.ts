import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Same arrangement `fs-handlers.test.ts` uses: `ipcMain.handle` is captured so
  each registered handler can be invoked directly, with the rest of the module
  graph mocked at the seams `forge-project-handlers.ts` actually depends on.
*/
const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
}));

const { resolveWorkdir } = vi.hoisted(() => ({ resolveWorkdir: vi.fn() }));
vi.mock('../repo-registry', () => ({ resolveWorkdir }));

const { listRemotes } = vi.hoisted(() => ({ listRemotes: vi.fn() }));
vi.mock('@midnite/studio-git-engine', () => ({ listRemotes }));

const { listProjects, projectFields, projectItems } = vi.hoisted(() => ({
  listProjects: vi.fn(),
  projectFields: vi.fn(),
  projectItems: vi.fn(),
}));
vi.mock('../forge/github/gh-project', () => ({ listProjects, projectFields, projectItems }));

const { setItemFieldValue, addProjectItem, clearItemFieldValue, createProject, editProject, deleteProject, removeProjectItem } =
  vi.hoisted(() => ({
    setItemFieldValue: vi.fn(),
    addProjectItem: vi.fn(),
    clearItemFieldValue: vi.fn(),
    createProject: vi.fn(),
    editProject: vi.fn(),
    deleteProject: vi.fn(),
    removeProjectItem: vi.fn(),
  }));
vi.mock('../forge/github/gh-project-write', () => ({
  setItemFieldValue,
  addProjectItem,
  clearItemFieldValue,
  createProject,
  editProject,
  deleteProject,
  removeProjectItem,
}));

/*
  Parts of the import graph no test here exercises, stubbed. The registry and
  its adapters stay real, since every handler dispatches through `adapterFor`,
  but the account store/vault and `window-manager` behind `forge-handlers.ts`
  only added cold-import time. On a loaded machine that pushed the first test
  past vitest's 5 s timeout.
*/
vi.mock('../forge/forge-accounts', () => ({ activeAccountFor: vi.fn(async () => null) }));
vi.mock('../window-manager', () => ({ resolveWindow: vi.fn(() => null) }));

const OK_CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const githubRemote = {
  name: 'origin',
  url: 'https://github.com/acme/widgets.git',
  pushUrl: 'https://github.com/acme/widgets.git',
  forge: { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' as const },
};

// Imported once for the file rather than once per test behind
// `vi.resetModules()`: the module holds no state of its own (every seam it
// touches is a hoisted mock reset below), and re-evaluating its import graph
// per test only multiplied the cold-import cost this file used to time out on.
let registerForgeProjectHandlers: () => void;
beforeAll(async () => {
  ({ registerForgeProjectHandlers } = await import('./forge-project-handlers'));
});

function loadHandlers() {
  registerForgeProjectHandlers();
  return handlers;
}

beforeEach(() => {
  handlers.clear();
  resolveWorkdir.mockReset();
  listRemotes.mockReset();
  listProjects.mockReset();
  projectFields.mockReset();
  projectItems.mockReset();
  setItemFieldValue.mockReset();
  addProjectItem.mockReset();
  clearItemFieldValue.mockReset();
  createProject.mockReset();
  editProject.mockReset();
  deleteProject.mockReset();
  removeProjectItem.mockReset();
});

describe('forgeProjectList', () => {
  it('resolves the repo forge from repoId and forwards to listProjects', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([githubRemote]);
    listProjects.mockResolvedValue({ cli: OK_CLI, projects: [], error: null, kind: 'ok' });

    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:list')?.(null, { repoId: 'r1' });

    expect(listProjects).toHaveBeenCalledWith(githubRemote.forge);
    expect(result).toEqual({ cli: OK_CLI, projects: [], error: null, kind: 'ok' });
  });

  it('answers with no-forge status, not an error, for a repo with no GitHub remote', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([]);

    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:list')?.(null, { repoId: 'r1' });

    expect(listProjects).not.toHaveBeenCalled();
    expect(result).toMatchObject({ projects: [], error: null });
  });

  it('rejects a malformed repoId at the boundary rather than reaching listProjects', async () => {
    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:list')?.(null, {});

    expect(listProjects).not.toHaveBeenCalled();
    expect(result).toMatchObject({ projects: [], kind: 'error' });
  });
});

describe('forgeProjectFields / forgeProjectItems — node id validation', () => {
  it('accepts a well-formed, url-safe-base64 projectId', async () => {
    projectFields.mockResolvedValue({ cli: OK_CLI, fields: [], error: null, kind: 'ok' });
    const registered = loadHandlers();
    const result = await registered
      .get('mstudio:forge-project:fields')
      ?.(null, { projectId: 'PVT_abc123-_=' });

    expect(projectFields).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'github.com' }),
      'PVT_abc123-_=',
    );
    expect(result).toMatchObject({ fields: [] });
  });

  it('refuses a projectId carrying shell metacharacters', async () => {
    const registered = loadHandlers();
    const result = await registered
      .get('mstudio:forge-project:fields')
      ?.(null, { projectId: "PVT_abc; rm -rf /" });

    expect(projectFields).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fields: [], kind: 'error' });
  });

  it('items forwards the optional cursor through to projectItems', async () => {
    projectItems.mockResolvedValue({
      cli: OK_CLI,
      items: [],
      nextCursor: null,
      error: null,
      kind: 'ok',
    });
    const registered = loadHandlers();
    await registered
      .get('mstudio:forge-project:items')
      ?.(null, { projectId: 'PVT_abc', cursor: 'cursor-1' });

    expect(projectItems).toHaveBeenCalledWith(expect.anything(), 'PVT_abc', 'cursor-1');
  });

  it('refuses an items cursor carrying shell metacharacters', async () => {
    const registered = loadHandlers();
    const result = await registered
      .get('mstudio:forge-project:items')
      ?.(null, { projectId: 'PVT_abc', cursor: '$(rm -rf /)' });

    expect(projectItems).not.toHaveBeenCalled();
    expect(result).toMatchObject({ items: [], kind: 'error' });
  });
});

describe('forgeProjectSetField / forgeProjectAddItem (Theme E)', () => {
  it('forwards a well-formed set-field request to setItemFieldValue', async () => {
    setItemFieldValue.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();
    const value = { fieldId: 'f1', dataType: 'text' as const, text: 'hello' };

    const result = await registered
      .get('mstudio:forge-project:set-field')
      ?.(null, { projectId: 'PVT_abc', itemId: 'PVTI_abc', fieldId: 'f1', value });

    expect(setItemFieldValue).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      itemId: 'PVTI_abc',
      fieldId: 'f1',
      value,
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('refuses a set-field request whose itemId carries shell metacharacters', async () => {
    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:set-field')?.(null, {
      projectId: 'PVT_abc',
      itemId: '$(rm -rf /)',
      fieldId: 'f1',
      value: { fieldId: 'f1', dataType: 'text', text: 'hello' },
    });

    expect(setItemFieldValue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('forwards a well-formed add-item request to addProjectItem', async () => {
    addProjectItem.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();

    const result = await registered
      .get('mstudio:forge-project:add-item')
      ?.(null, { projectId: 'PVT_abc', contentId: 'I_abc' });

    expect(addProjectItem).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      contentId: 'I_abc',
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('refuses an add-item request whose contentId carries shell metacharacters', async () => {
    const registered = loadHandlers();
    const result = await registered
      .get('mstudio:forge-project:add-item')
      ?.(null, { projectId: 'PVT_abc', contentId: '; rm -rf /' });

    expect(addProjectItem).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });
});

describe('forge project CRUD and drafts (Phase 95 Theme D)', () => {
  it('resolves the repo forge for create, like list does', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([githubRemote]);
    createProject.mockResolvedValue({ ok: true, kind: 'ok', project: { id: 'P1', number: 1, title: 'T', url: 'https://x', closed: false, linkedToRepo: false } });

    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:create')?.(null, { repoId: 'r1', title: 'T' });

    expect(createProject).toHaveBeenCalledWith(githubRemote.forge, 'T');
    expect(result).toMatchObject({ ok: true, kind: 'ok' });
  });

  it('answers no-forge for create on a repo with no supported remote', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([]);

    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:create')?.(null, { repoId: 'r1', title: 'T' });

    expect(createProject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('forwards edit to editProject against the fixed GitHub target', async () => {
    editProject.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();

    const result = await registered
      .get('mstudio:forge-project:edit')
      ?.(null, { projectId: 'PVT_abc', title: 'New title' });

    expect(editProject).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      title: 'New title',
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('forwards delete to deleteProject', async () => {
    deleteProject.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();

    const result = await registered.get('mstudio:forge-project:delete')?.(null, { projectId: 'PVT_abc' });

    expect(deleteProject).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), 'PVT_abc');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('forwards a draft-item add to addProjectItem with draftTitle/draftBody', async () => {
    addProjectItem.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();

    const result = await registered
      .get('mstudio:forge-project:add-draft-item')
      ?.(null, { projectId: 'PVT_abc', title: 'A draft', body: 'body text' });

    expect(addProjectItem).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      draftTitle: 'A draft',
      draftBody: 'body text',
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('forwards remove-item to removeProjectItem', async () => {
    removeProjectItem.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();

    const result = await registered
      .get('mstudio:forge-project:remove-item')
      ?.(null, { projectId: 'PVT_abc', itemId: 'PVTI_abc' });

    expect(removeProjectItem).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      itemId: 'PVTI_abc',
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });
});

describe('forgeProjectClearField (Phase 50 Theme C)', () => {
  it('forwards a well-formed clear-field request to clearItemFieldValue', async () => {
    clearItemFieldValue.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = loadHandlers();

    const result = await registered
      .get('mstudio:forge-project:clear-field')
      ?.(null, { projectId: 'PVT_abc', itemId: 'PVTI_abc', fieldId: 'f1' });

    expect(clearItemFieldValue).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      itemId: 'PVTI_abc',
      fieldId: 'f1',
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('refuses a clear-field request whose fieldId carries shell metacharacters', async () => {
    const registered = loadHandlers();
    const result = await registered.get('mstudio:forge-project:clear-field')?.(null, {
      projectId: 'PVT_abc',
      itemId: 'PVTI_abc',
      fieldId: '$(rm -rf /)',
    });

    expect(clearItemFieldValue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });
});
