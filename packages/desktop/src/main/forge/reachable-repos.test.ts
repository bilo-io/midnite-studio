import type { ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgeAccountToken } from './forge-accounts';
import { listReachableRepos } from './reachable-repos';

vi.mock('./forge-accounts', () => ({ forgeAccountToken: vi.fn() }));

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
            visibility: 'private',
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

  it('reports the API error rather than throwing', async () => {
    vi.mocked(forgeAccountToken).mockResolvedValue('glpat-x');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: '401 Unauthorized' })));

    const result = await listReachableRepos(account());
    expect(result).toEqual({ ok: false, reason: 'error', message: '401 Unauthorized' });
  });
});
