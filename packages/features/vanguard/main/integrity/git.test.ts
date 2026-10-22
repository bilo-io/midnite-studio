import { describe, expect, it } from 'vitest';

import { listedInStatus, parsePorcelainZ, resolveGitCommonDir, uncommittedPaths } from './git';
import type { IntegrityRunProcess } from './run-process';

const ok = (stdout: string, exitCode = 0) => ({ ok: true as const, stdout, stderr: '', exitCode });

describe('parsePorcelainZ', () => {
  it('reads NUL-delimited entries, including names with spaces and newlines', () => {
    const listed = parsePorcelainZ(' M .githooks/pre-commit\0?? .claude/a b\nc.sh\0!! .env\0');
    expect([...listed]).toEqual(['.githooks/pre-commit', '.claude/a b\nc.sh', '.env']);
  });

  it('takes both sides of a rename', () => {
    expect([...parsePorcelainZ('R  .mcp.json\0old.json\0 M package.json\0')]).toEqual(['.mcp.json', 'old.json', 'package.json']);
  });

  it('is empty for a clean tree', () => {
    expect(parsePorcelainZ('').size).toBe(0);
  });
});

describe('listedInStatus', () => {
  it('matches a path or any listed ancestor directory', () => {
    const listed = new Set(['.cursor/', 'package.json']);
    expect(listedInStatus(listed, '.cursor/mcp.json')).toBe(true);
    expect(listedInStatus(listed, 'package.json')).toBe(true);
    expect(listedInStatus(listed, '.claude/settings.json')).toBe(false);
  });
});

describe('uncommittedPaths', () => {
  it('asks git without optional locks, NUL-delimited, with literal pathspecs', async () => {
    const calls: Array<readonly string[]> = [];
    const run: IntegrityRunProcess = async (_cmd, args) => {
      calls.push(args);
      return ok(' M .githooks/pre-commit\0');
    };
    const dirty = await uncommittedPaths(run, '/r', ['.githooks/pre-commit', '.mcp.json']);
    expect([...dirty!]).toEqual(['.githooks/pre-commit']);
    expect(calls[0]).toEqual([
      '--no-optional-locks',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--ignored=matching',
      '--',
      ':(literal).githooks/pre-commit',
      ':(literal).mcp.json',
    ]);
  });

  it('answers undefined when git fails, and asks nothing for no paths', async () => {
    let asked = false;
    const run: IntegrityRunProcess = async () => {
      asked = true;
      return { ok: false, reason: 'not-installed', hint: 'no git' };
    };
    expect(await uncommittedPaths(run, '/r', ['.mcp.json'])).toBeUndefined();
    asked = false;
    expect((await uncommittedPaths(run, '/r', [])).size).toBe(0);
    expect(asked).toBe(false);
  });
});

describe('resolveGitCommonDir', () => {
  it('drops exactly the trailing newline and resolves a relative answer', async () => {
    expect(await resolveGitCommonDir(async () => ok('/r/.git\n'), '/r')).toBe('/r/.git');
    expect(await resolveGitCommonDir(async () => ok('.git\n'), '/r')).toBe('/r/.git');
    expect(await resolveGitCommonDir(async () => ok('', 128), '/r')).toBeUndefined();
  });
});
