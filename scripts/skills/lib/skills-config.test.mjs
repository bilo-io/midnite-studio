import { describe, expect, it } from 'vitest';

import { ghToken, loadSkillsConfig, slugFromRemote } from './skills-config.mjs';

const git = (remote) => (args) => (args[0] === 'rev-parse' ? '/r' : args[0] === 'remote' ? remote : '');
const file = (obj) => (p) => {
  if (obj === undefined) throw Object.assign(new Error('nope'), { code: 'ENOENT' });
  expect(p).toBe('/r/.midnite/skills.json');
  return typeof obj === 'string' ? obj : JSON.stringify(obj);
};

describe('slugFromRemote', () => {
  it.each([
    ['git@github.com:o/r.git', 'o/r'],
    ['https://github.com/o/r', 'o/r'],
    ['https://github.com/o/r.git', 'o/r'],
    ['ssh://git@github.com/o/r', 'o/r'],
    ['https://gitlab.com/o/r.git', null],
    ['', null],
  ])('%s -> %s', (url, slug) => expect(slugFromRemote(url)).toBe(slug));
});

describe('loadSkillsConfig', () => {
  it('falls back to the origin remote and no account, board or gate', () => {
    const c = loadSkillsConfig({ env: {}, git: git('git@github.com:acme/app.git'), readFile: file(undefined) });
    expect(c).toEqual({ root: '/r', repo: 'acme/app', ghUser: null, project: null, issueRepos: [{ id: 'repo', repo: 'acme/app', labelFilter: null, boost: 0 }], gate: null });
  });

  it('reads .midnite/skills.json', () => {
    const c = loadSkillsConfig({
      env: {},
      git: git('git@github.com:acme/app.git'),
      readFile: file({ repo: 'o/r', ghUser: 'me', project: 3, gate: ['make', 'check'], issueRepos: [{ repo: 'o/r' }, { id: 'x', repo: 'o/x', labelFilter: 'l', boost: 2 }] }),
    });
    expect(c).toMatchObject({ repo: 'o/r', ghUser: 'me', project: 3, gate: ['make', 'check'] });
    expect(c.issueRepos).toEqual([{ id: 'repo1', repo: 'o/r', labelFilter: null, boost: 0 }, { id: 'x', repo: 'o/x', labelFilter: 'l', boost: 2 }]);
  });

  it('lets the environment win over the file', () => {
    const c = loadSkillsConfig({ env: { MIDNITE_REPO: 'e/r', MIDNITE_GH_USER: 'eu', MIDNITE_TRACKER_PROJECT: '9' }, git: git(''), readFile: file({ repo: 'o/r', ghUser: 'me', project: 3 }) });
    expect(c).toMatchObject({ repo: 'e/r', ghUser: 'eu', project: 9 });
  });

  it('ignores malformed values rather than guessing', () => {
    const c = loadSkillsConfig({ env: { MIDNITE_TRACKER_PROJECT: 'eight' }, git: git(''), readFile: file({ project: -1, gate: 'moon', ghUser: 7 }) });
    expect(c).toMatchObject({ repo: null, ghUser: null, project: null, gate: null, issueRepos: [] });
    expect(loadSkillsConfig({ env: {}, git: git(''), readFile: file('{not json') }).repo).toBeNull();
  });
});

describe('ghToken', () => {
  it('asks gh for the configured account, else the active one', () => {
    const calls = [];
    const run = (args) => (calls.push(args), 'tok');
    expect(ghToken({ ghUser: 'me', run })).toBe('tok');
    expect(ghToken({ ghUser: null, run })).toBe('tok');
    expect(calls).toEqual([['auth', 'token', '-u', 'me'], ['auth', 'token']]);
  });
});
