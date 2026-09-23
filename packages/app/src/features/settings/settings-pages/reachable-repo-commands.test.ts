import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { reachableRepoDeleteCommand, reachableRepoWebUrl } from './reachable-repo-commands';

function account(overrides: Partial<ForgeAccount>): ForgeAccount {
  return {
    id: 'x',
    kind: 'github',
    host: 'github.com',
    login: 'octocat',
    displayName: '',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

function repo(overrides: Partial<ReachableRepo> = {}): ReachableRepo {
  return {
    owner: 'octocat',
    name: 'hello',
    fullName: 'octocat/hello',
    url: 'https://github.com/octocat/hello.git',
    private: false,
    ...overrides,
  };
}

const azureRepo = repo({
  owner: 'contoso/Platform Team',
  name: 'infra',
  fullName: 'contoso/Platform Team/infra',
  url: 'https://dev.azure.com/contoso/Platform%20Team/_git/infra',
});

describe('reachableRepoWebUrl', () => {
  it("prefers the provider's own webUrl", () => {
    expect(reachableRepoWebUrl(account({}), repo({ webUrl: 'https://github.com/octocat/hello' }))).toBe(
      'https://github.com/octocat/hello',
    );
  });

  it('falls back to host + fullName for GitHub and GitLab', () => {
    expect(reachableRepoWebUrl(account({ host: 'ghe.corp' }), repo())).toBe('https://ghe.corp/octocat/hello');
    expect(
      reachableRepoWebUrl(account({ kind: 'gitlab', host: 'gitlab.com' }), repo({ fullName: 'group/sub/proj' })),
    ).toBe('https://gitlab.com/group/sub/proj');
  });

  it("builds Azure's _git page, encoding the project", () => {
    expect(reachableRepoWebUrl(account({ kind: 'azure', host: 'dev.azure.com' }), azureRepo)).toBe(
      'https://dev.azure.com/contoso/Platform%20Team/_git/infra',
    );
  });
});

describe('reachableRepoDeleteCommand', () => {
  it('GitHub token account: a bare gh repo delete, no --yes', () => {
    const cmd = reachableRepoDeleteCommand(account({}), repo());
    expect(cmd).toMatchObject({ ok: true, command: 'gh repo delete octocat/hello' });
  });

  it('GitHub gh-delegated account pins its gh login without switching gh', () => {
    const cmd = reachableRepoDeleteCommand(account({ delegated: 'gh', hasToken: false }), repo());
    expect(cmd).toMatchObject({
      ok: true,
      command: 'GH_TOKEN="$(gh auth token --hostname github.com --user octocat)" gh repo delete octocat/hello',
    });
  });

  it('GitHub Enterprise host goes through GH_HOST', () => {
    const cmd = reachableRepoDeleteCommand(account({ host: 'ghe.corp' }), repo());
    expect(cmd).toMatchObject({ ok: true, command: 'GH_HOST=ghe.corp gh repo delete octocat/hello' });
  });

  it('GitLab: glab repo delete, GITLAB_HOST only off gitlab.com', () => {
    const gl = repo({ fullName: 'group/sub/proj' });
    expect(reachableRepoDeleteCommand(account({ kind: 'gitlab', host: 'gitlab.com' }), gl)).toMatchObject({
      ok: true,
      command: 'glab repo delete group/sub/proj',
    });
    expect(reachableRepoDeleteCommand(account({ kind: 'gitlab', host: 'gl.corp' }), gl)).toMatchObject({
      ok: true,
      command: 'GITLAB_HOST=gl.corp glab repo delete group/sub/proj',
    });
  });

  it('Azure: az repos delete by id, quoting a spaced project', () => {
    const cmd = reachableRepoDeleteCommand(
      account({ kind: 'azure', host: 'dev.azure.com' }),
      { ...azureRepo, id: '5b1c2d3e-0000-4000-8000-000000000001' },
    );
    expect(cmd).toMatchObject({
      ok: true,
      command:
        "az repos delete --id 5b1c2d3e-0000-4000-8000-000000000001 --org https://dev.azure.com/contoso --project 'Platform Team'",
    });
  });

  it('Azure without an id is unavailable rather than guessed', () => {
    expect(reachableRepoDeleteCommand(account({ kind: 'azure', host: 'dev.azure.com' }), azureRepo).ok).toBe(false);
  });

  it('Bitbucket is unavailable', () => {
    const result = reachableRepoDeleteCommand(account({ kind: 'bitbucket', host: 'bitbucket.org' }), repo());
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/no official CLI.*on Bitbucket/) });
  });

  it('quotes a name carrying shell metacharacters', () => {
    const cmd = reachableRepoDeleteCommand(account({}), repo({ fullName: "o/it's;rm" }));
    expect(cmd).toMatchObject({ ok: true, command: String.raw`gh repo delete 'o/it'\''s;rm'` });
  });
});
