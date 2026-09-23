import type { ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgeAccountToken } from './forge-accounts';
import { runInShell } from './github/gh-shell';
import { listReachableRepos } from './reachable-repos';

vi.mock('./forge-accounts', () => ({ forgeAccountToken: vi.fn() }));
vi.mock('./github/gh-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./github/gh-shell')>()),
  runInShell: vi.fn(),
}));

function account(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return {
    id: 'gitlab:gitlab.example:me',
    kind: 'gitlab',
    host: 'gitlab.example',
    login: 'me',
    displayName: 'Me',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('listReachableRepos — gitlab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports unsupported for a kind with no adapter yet', async () => {
    const result = await listReachableRepos(account({ kind: 'bitbucket', id: 'bitbucket:x:me' }));
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports no-account when the vault has no token', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue(null);
    const result = await listReachableRepos(account());
    expect(result).toEqual({ ok: false, reason: 'no-account' });
  });

  it('lists reachable projects, splitting owner from name on the last slash', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue('glpat-x');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          {
            path_with_namespace: 'group/subgroup/project',
            http_url_to_repo: 'https://gitlab.example/group/subgroup/project.git',
            web_url: 'https://gitlab.example/group/subgroup/project',
            visibility: 'private',
            last_activity_at: '2026-08-30T08:00:00.000Z',
            star_count: 3,
            default_branch: 'develop',
          },
          {
            path_with_namespace: 'someone/public-repo',
            http_url_to_repo: 'https://gitlab.example/someone/public-repo.git',
            visibility: 'public',
          },
        ]),
      ),
    );

    const result = await listReachableRepos(account());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repos).toEqual([
      {
        owner: 'group/subgroup',
        name: 'project',
        fullName: 'group/subgroup/project',
        url: 'https://gitlab.example/group/subgroup/project.git',
        private: true,
        webUrl: 'https://gitlab.example/group/subgroup/project',
        updatedAt: '2026-08-30T08:00:00.000Z',
        stars: 3,
        defaultBranch: 'develop',
      },
      {
        owner: 'someone',
        name: 'public-repo',
        fullName: 'someone/public-repo',
        url: 'https://gitlab.example/someone/public-repo.git',
        private: false,
      },
    ]);
  });

  it('asks for the full project representation, which carries visibility', async () => {
    // `simple=true` omits `visibility`, so every project read as private.
    vi.mocked(forgeAccountToken).mockResolvedValue('glpat-x');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);

    await listReachableRepos(account());
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('membership=true');
    expect(requested).not.toContain('simple=');
  });

  it('reports the API error rather than throwing', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue('glpat-x');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: '401 Unauthorized' })));

    const result = await listReachableRepos(account());
    expect(result).toEqual({ ok: false, reason: 'error', message: '401 Unauthorized' });
  });
});

function azureAccount(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return account({ kind: 'azure', id: 'azure:dev.azure.com:me@contoso.com', host: 'dev.azure.com', ...overrides });
}

describe('listReachableRepos — azure', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports no-account when the vault has no token', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue(null);
    const result = await listReachableRepos(azureAccount());
    expect(result).toEqual({ ok: false, reason: 'no-account' });
  });

  it('walks orgs → projects → repositories and flattens them', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue('azure-pat');
    const fetchMock = vi.fn().mockImplementation((url: URL | string) => {
      const href = url.toString();
      if (href.includes('app.vssps.visualstudio.com/_apis/accounts')) {
        return Promise.resolve(jsonResponse(200, { value: [{ accountName: 'contoso' }] }));
      }
      if (href.includes('/contoso/_apis/projects')) {
        return Promise.resolve(jsonResponse(200, { value: [{ name: 'platform', visibility: 'private' }] }));
      }
      if (href.includes('/contoso/platform/_apis/git/repositories')) {
        return Promise.resolve(
          jsonResponse(200, {
            value: [
              {
                id: '5b1c2d3e-0000-4000-8000-000000000001',
                name: 'infra',
                remoteUrl: 'https://dev.azure.com/contoso/platform/_git/infra',
                webUrl: 'https://dev.azure.com/contoso/platform/_git/infra',
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listReachableRepos(azureAccount());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repos).toEqual([
      {
        owner: 'contoso/platform',
        name: 'infra',
        fullName: 'contoso/platform/infra',
        url: 'https://dev.azure.com/contoso/platform/_git/infra',
        private: true,
        webUrl: 'https://dev.azure.com/contoso/platform/_git/infra',
        id: '5b1c2d3e-0000-4000-8000-000000000001',
      },
    ]);
  });

  it('reports an error when the organizations listing itself fails', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue('azure-pat');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' })));

    const result = await listReachableRepos(azureAccount());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('error');
  });
});

describe('listReachableRepos — github', () => {
  const gh = account({ kind: 'github', id: 'github:github.com:me', host: 'github.com', delegated: 'gh', hasToken: false });

  function shellOutput(payload: unknown) {
    const output = JSON.stringify(payload);
    return { output, stdout: output, stderr: '', exitCode: 0 };
  }

  it('asks gh for the metadata fields in the same one listing call', async () => {
    vi.mocked(runInShell).mockResolvedValue(shellOutput([]));
    await listReachableRepos(gh);
    const command = vi.mocked(runInShell).mock.calls[0]?.[0] ?? '';
    expect(command).toContain('gh repo list --json nameWithOwner,url,isPrivate,pushedAt,stargazerCount,defaultBranchRef,languages');
  });

  it('maps pushedAt, stars, default branch and languages (largest first)', async () => {
    vi.mocked(runInShell).mockResolvedValue(
      shellOutput([
        {
          nameWithOwner: 'me/app',
          url: 'https://github.com/me/app',
          isPrivate: true,
          pushedAt: '2026-09-01T10:00:00Z',
          stargazerCount: 12,
          defaultBranchRef: { name: 'main' },
          languages: [
            { size: 100, node: { name: 'CSS' } },
            { size: 900, node: { name: 'TypeScript' } },
            { size: 5, node: {} },
          ],
        },
        // An empty repo: no default branch, no languages — the optional keys stay absent.
        { nameWithOwner: 'me/empty', url: 'https://github.com/me/empty', isPrivate: false, defaultBranchRef: null, languages: [] },
      ]),
    );
    const result = await listReachableRepos(gh);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repos[0]).toEqual({
      owner: 'me',
      name: 'app',
      fullName: 'me/app',
      url: 'https://github.com/me/app',
      private: true,
      webUrl: 'https://github.com/me/app',
      updatedAt: '2026-09-01T10:00:00Z',
      stars: 12,
      defaultBranch: 'main',
      languages: [
        { name: 'TypeScript', size: 900 },
        { name: 'CSS', size: 100 },
      ],
    });
    expect(Object.keys(result.repos[1] ?? {}).sort()).toEqual(['fullName', 'name', 'owner', 'private', 'url', 'webUrl']);
  });
});
