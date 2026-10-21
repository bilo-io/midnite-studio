// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCoderRepos } from './repos';

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'coder-repos-')));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const checkout = (name: string) => {
  mkdirSync(join(dir, name, '.git'), { recursive: true });
  return join(dir, name);
};

describe('createCoderRepos', () => {
  it('admits a folder once per offer, by its real path, with a stable id', () => {
    const repo = checkout('a');
    const link = join(dir, 'link');
    symlinkSync(repo, link);
    const repos = createCoderRepos({ userData: join(dir, 'ud') });
    repos.offer(link);
    const first = repos.admit(link);
    expect(first).toMatchObject({ ok: true, repo: { path: repo, name: 'a' } });
    expect(repos.admit(link)).toMatchObject({ ok: false });
    repos.offer(repo);
    expect(repos.admit(repo)).toEqual(first);
    expect(repos.list()).toHaveLength(1);
  });

  it('removes by id and survives a reload from disk', () => {
    const repos = createCoderRepos({ userData: join(dir, 'ud') });
    for (const name of ['a', 'b']) {
      repos.offer(checkout(name));
      repos.admit(join(dir, name));
    }
    const [a] = repos.list();
    repos.remove(a!.id);
    expect(createCoderRepos({ userData: join(dir, 'ud') }).list().map((r) => r.name)).toEqual(['b']);
  });

  it('resolves a path only for a repo it holds', () => {
    const repos = createCoderRepos({ userData: join(dir, 'ud') });
    expect(repos.pathOf('nope')).toBeNull();
  });
});
