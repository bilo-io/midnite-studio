// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readGitConfigRemotes, remotesFromGitConfig } from './git-config-remotes';
import { forgeFromRemotes } from './repo-forge';

const CONFIG = `[core]
\trepositoryformatversion = 0
[remote "origin"]
\turl = git@github.com:bilo-io/midnite-studio.git # the fork's upstream
\tfetch = +refs/heads/*:refs/remotes/origin/*
[remote "my.fork"]
\tURL = "https://gitlab.example.com/me/fork.git"
\tpushurl = ssh://git@gitlab.example.com/me/fork.git
[url "https://github.com/"]
\tinsteadOf = gh:
[remote "short"]
\turl = gh:acme/tool
`;

describe('remotesFromGitConfig', () => {
  it('reads url and pushurl per remote, in file order, and derives the forge', () => {
    const remotes = remotesFromGitConfig(CONFIG);
    expect(remotes.map((r) => r.name)).toEqual(['origin', 'my.fork', 'short']);
    expect(remotes[0]).toMatchObject({
      fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
      pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
      forge: { kind: 'github', host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio' },
    });
    expect(remotes[1]).toMatchObject({
      fetchUrl: 'https://gitlab.example.com/me/fork.git',
      pushUrl: 'ssh://git@gitlab.example.com/me/fork.git',
    });
  });

  it('applies url.<base>.insteadOf the way git does', () => {
    const short = remotesFromGitConfig(CONFIG).find((r) => r.name === 'short');
    expect(short?.fetchUrl).toBe('https://github.com/acme/tool');
    expect(short?.forge).toMatchObject({ kind: 'github', owner: 'acme', repo: 'tool' });
  });

  it('picks origin as the forge, like Studio does', () => {
    expect(forgeFromRemotes(remotesFromGitConfig(CONFIG))).toMatchObject({ owner: 'bilo-io' });
  });

  it('answers no remotes for an empty or remote-less config', () => {
    expect(remotesFromGitConfig('')).toEqual([]);
    expect(remotesFromGitConfig('[core]\n\tbare = false\n')).toEqual([]);
  });
});

describe('readGitConfigRemotes', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'forge-gitconfig-'));

  it('reads a checkout’s .git/config', async () => {
    const repo = tmp();
    mkdirSync(join(repo, '.git'));
    writeFileSync(join(repo, '.git', 'config'), CONFIG);
    expect((await readGitConfigRemotes(repo)).length).toBe(3);
  });

  it('follows a linked worktree’s .git file to the common config', async () => {
    const main = tmp();
    mkdirSync(join(main, '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileSync(join(main, '.git', 'config'), CONFIG);
    writeFileSync(join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
    const wt = tmp();
    writeFileSync(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'wt')}\n`);
    expect((await readGitConfigRemotes(wt)).map((r) => r.name)).toContain('origin');
  });

  it('answers [] for a folder that is not a repository', async () => {
    expect(await readGitConfigRemotes(tmp())).toEqual([]);
  });
});
