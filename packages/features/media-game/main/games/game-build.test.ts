// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gameServeRoot, runGameBuild } from './game-build';

const noPath = { resolvePath: async () => undefined };

describe('runGameBuild', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'game-build-'));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  it('streams each output line and resolves with the elapsed time', async () => {
    const lines: string[] = [];
    const result = await runGameBuild(root, { command: 'echo one && echo two', out: 'dist' }, (l) => lines.push(l), new AbortController().signal, noPath);
    expect(result.ok).toBe(true);
    expect(lines).toEqual(['one', 'two']);
  });

  it('fails on a non-zero exit with the last lines', async () => {
    const result = await runGameBuild(root, { command: 'echo boom 1>&2; exit 1', out: 'dist' }, () => undefined, new AbortController().signal, noPath);
    expect(result).toMatchObject({ ok: false, message: 'Build failed (exit 1).', stderr: 'boom' });
  });

  it('keeps only the last 20 lines', async () => {
    const result = await runGameBuild(root, { command: 'seq 1 50; exit 2', out: 'dist' }, () => undefined, new AbortController().signal, noPath);
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'error') expect(result.stderr?.split('\n')).toEqual(Array.from({ length: 20 }, (_, i) => String(31 + i)));
  });

  it('times out after the limit and kills the build', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = runGameBuild(root, { command: 'sleep 30', out: 'dist' }, () => undefined, new AbortController().signal, noPath);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(await pending).toMatchObject({ ok: false, message: 'Build took longer than 5 minutes.' });
  });

  it('aborts through the signal', async () => {
    const controller = new AbortController();
    const pending = runGameBuild(root, { command: 'echo started; sleep 30', out: 'dist' }, (line) => {
      if (line === 'started') controller.abort();
    }, controller.signal, noPath);
    expect(await pending).toMatchObject({ ok: false, message: 'Build cancelled.' });
  });

  it('refuses without node_modules, with the install hint, and never installs', async () => {
    await writeFile(join(root, 'package.json'), '{}');
    const lines: string[] = [];
    const result = await runGameBuild(root, { command: 'echo built', out: 'dist' }, (l) => lines.push(l), new AbortController().signal, noPath);
    expect(result.ok).toBe(false);
    expect(lines).toEqual([`Run your package manager's install in ${root} first.`]);
    await mkdir(join(root, 'node_modules'));
    expect((await runGameBuild(root, { command: 'echo built', out: 'dist' }, () => undefined, new AbortController().signal, noPath)).ok).toBe(true);
  });

  it('drops inherited moon task env', async () => {
    vi.stubEnv('MOON_TARGET', 'x:y');
    vi.stubEnv('MOON_WORKSPACE_ROOT', '/elsewhere');
    const lines: string[] = [];
    await runGameBuild(root, { command: 'echo "[$MOON_WORKSPACE_ROOT]"', out: 'dist' }, (l) => lines.push(l), new AbortController().signal, noPath);
    vi.unstubAllEnvs();
    expect(lines).toEqual(['[]']);
  });
});

describe('gameServeRoot', () => {
  it('is the repo without a build, build.out inside it with one, and null when out escapes', () => {
    expect(gameServeRoot('/g', undefined)).toBe('/g');
    expect(gameServeRoot('/g', { command: 'x', out: 'dist' })).toBe('/g/dist');
    expect(gameServeRoot('/g', { command: 'x', out: '../x' })).toBeNull();
  });
});
