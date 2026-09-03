import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../forge/gh-project', () => ({ listProjects, projectFields, projectItems }));

const { setItemFieldValue, addItemToProject, clearItemFieldValue } = vi.hoisted(() => ({
  setItemFieldValue: vi.fn(),
  addItemToProject: vi.fn(),
  clearItemFieldValue: vi.fn(),
}));
vi.mock('../forge/gh-project-write', () => ({ setItemFieldValue, addItemToProject, clearItemFieldValue }));

const OK_CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const githubRemote = {
  name: 'origin',
  url: 'https://github.com/acme/widgets.git',
  pushUrl: 'https://github.com/acme/widgets.git',
  forge: { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' as const },
};

async function loadHandlers() {
  const { registerForgeProjectHandlers } = await import('./forge-project-handlers');
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
  addItemToProject.mockReset();
  clearItemFieldValue.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe('forgeProjectList', () => {
  it('resolves the repo forge from repoId and forwards to listProjects', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([githubRemote]);
    listProjects.mockResolvedValue({ cli: OK_CLI, projects: [], error: null, kind: 'ok' });

    const registered = await loadHandlers();
    const result = await registered.get('mstudio:forge-project:list')?.(null, { repoId: 'r1' });

    expect(listProjects).toHaveBeenCalledWith(githubRemote.forge);
    expect(result).toEqual({ cli: OK_CLI, projects: [], error: null, kind: 'ok' });
  });

  it('answers with no-forge status, not an error, for a repo with no GitHub remote', async () => {
    resolveWorkdir.mockResolvedValue('/repo');
    listRemotes.mockResolvedValue([]);

    const registered = await loadHandlers();
    const result = await registered.get('mstudio:forge-project:list')?.(null, { repoId: 'r1' });

    expect(listProjects).not.toHaveBeenCalled();
    expect(result).toMatchObject({ projects: [], error: null });
  });

  it('rejects a malformed repoId at the boundary rather than reaching listProjects', async () => {
    const registered = await loadHandlers();
    const result = await registered.get('mstudio:forge-project:list')?.(null, {});

    expect(listProjects).not.toHaveBeenCalled();
    expect(result).toMatchObject({ projects: [], kind: 'error' });
  });
});

describe('forgeProjectFields / forgeProjectItems — node id validation', () => {
  it('accepts a well-formed, url-safe-base64 projectId', async () => {
    projectFields.mockResolvedValue({ cli: OK_CLI, fields: [], error: null, kind: 'ok' });
    const registered = await loadHandlers();
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
    const registered = await loadHandlers();
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
    const registered = await loadHandlers();
    await registered
      .get('mstudio:forge-project:items')
      ?.(null, { projectId: 'PVT_abc', cursor: 'cursor-1' });

    expect(projectItems).toHaveBeenCalledWith(expect.anything(), 'PVT_abc', 'cursor-1');
  });

  it('refuses an items cursor carrying shell metacharacters', async () => {
    const registered = await loadHandlers();
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
    const registered = await loadHandlers();
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
    const registered = await loadHandlers();
    const result = await registered.get('mstudio:forge-project:set-field')?.(null, {
      projectId: 'PVT_abc',
      itemId: '$(rm -rf /)',
      fieldId: 'f1',
      value: { fieldId: 'f1', dataType: 'text', text: 'hello' },
    });

    expect(setItemFieldValue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('forwards a well-formed add-item request to addItemToProject', async () => {
    addItemToProject.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = await loadHandlers();

    const result = await registered
      .get('mstudio:forge-project:add-item')
      ?.(null, { projectId: 'PVT_abc', contentId: 'I_abc' });

    expect(addItemToProject).toHaveBeenCalledWith(expect.objectContaining({ host: 'github.com' }), {
      projectId: 'PVT_abc',
      contentId: 'I_abc',
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('refuses an add-item request whose contentId carries shell metacharacters', async () => {
    const registered = await loadHandlers();
    const result = await registered
      .get('mstudio:forge-project:add-item')
      ?.(null, { projectId: 'PVT_abc', contentId: '; rm -rf /' });

    expect(addItemToProject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });
});

describe('forgeProjectClearField (Phase 50 Theme C)', () => {
  it('forwards a well-formed clear-field request to clearItemFieldValue', async () => {
    clearItemFieldValue.mockResolvedValue({ ok: true, kind: 'ok' });
    const registered = await loadHandlers();

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
    const registered = await loadHandlers();
    const result = await registered.get('mstudio:forge-project:clear-field')?.(null, {
      projectId: 'PVT_abc',
      itemId: 'PVTI_abc',
      fieldId: '$(rm -rf /)',
    });

    expect(clearItemFieldValue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });
});
