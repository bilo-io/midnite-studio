import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readGrep, type GrepOptions } from './grep';

const OPTS: GrepOptions = {
  query: '',
  mode: 'fixed',
  caseSensitive: false,
  wholeWord: false,
  maxPerFile: 50,
};

describe('readGrep', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.commitFile('a.txt', 'foo\nbar\nFOO again\n', 'a');
    await repo.commitFile('b.txt', 'baz\n', 'b');
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('finds matches across files, case-insensitive by default', async () => {
    const result = await readGrep(repo.path, { ...OPTS, query: 'foo' });
    expect(result).toEqual({
      ok: true,
      matches: [
        { path: 'a.txt', line: 1, text: 'foo' },
        { path: 'a.txt', line: 3, text: 'FOO again' },
      ],
    });
  });

  it('respects caseSensitive', async () => {
    const result = await readGrep(repo.path, { ...OPTS, query: 'foo', caseSensitive: true });
    expect(result).toEqual({ ok: true, matches: [{ path: 'a.txt', line: 1, text: 'foo' }] });
  });

  it('respects wholeWord', async () => {
    await repo.commitFile('c.txt', 'football\n', 'c');
    const result = await readGrep(repo.path, { ...OPTS, query: 'foo', wholeWord: true });
    expect(result.ok).toBe(true);
    expect(result.ok && result.matches.map((m) => m.path)).toEqual(['a.txt', 'a.txt']);
  });

  it('returns an empty, ok result for no matches', async () => {
    const result = await readGrep(repo.path, { ...OPTS, query: 'zzz-nowhere' });
    expect(result).toEqual({ ok: true, matches: [] });
  });

  it('supports regex mode', async () => {
    const result = await readGrep(repo.path, { ...OPTS, query: '^ba[rz]$', mode: 'regex' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.matches.map((m) => m.text)).toEqual(['bar', 'baz']);
  });

  it('a fixed-string query with regex metacharacters matches itself literally', async () => {
    await repo.commitFile('d.txt', 'a.b\nadb\n', 'd');
    const result = await readGrep(repo.path, { ...OPTS, query: 'a.b', mode: 'fixed' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.matches).toEqual([{ path: 'd.txt', line: 1, text: 'a.b' }]);
  });

  it('surfaces a malformed regex as an error rather than throwing', async () => {
    const result = await readGrep(repo.path, { ...OPTS, query: '(unterminated', mode: 'regex' });
    expect(result.ok).toBe(false);
    expect(result.ok || result.message.length > 0).toBe(true);
  });

  it('caps matches per file at maxPerFile', async () => {
    await repo.commitFile('many.txt', Array.from({ length: 10 }, () => 'needle').join('\n'), 'e');
    const result = await readGrep(repo.path, { ...OPTS, query: 'needle', maxPerFile: 3 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.matches.filter((m) => m.path === 'many.txt')).toHaveLength(3);
  });
});
