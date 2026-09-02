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
