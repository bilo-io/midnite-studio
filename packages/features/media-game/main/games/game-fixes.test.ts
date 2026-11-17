// @vitest-environment node
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, GAME_ENGINE_VERSIONS, GAME_KIT_VERSION, GAME_MANIFEST_FILE } from '@midnite/studio-shared';

import { applyGameFix } from './game-fixes';

vi.setConfig({ testTimeout: 30_000 });

const FIXTURES = join(__dirname, '__fixtures__', 'doctor');
let dir: string;
const send = vi.fn();
const deps = () => ({ templateDir: '', enginesDir: '', send });

async function git(...args: string[]) {
  return (await execGit(dir, args, { write: true })).stdout.trim();
}
async function commitAll(message = 'init') {
  await git('add', '-A');
  await git('commit', '--no-verify', '-m', message);
}
const manifest = async (): Promise<Record<string, unknown>> => JSON.parse(await readFile(join(dir, GAME_MANIFEST_FILE), 'utf8')) as Record<string, unknown>;
const commitCount = async (): Promise<number> => Number(await git('rev-list', '--count', 'HEAD'));
const lastFiles = async (): Promise<string[]> => (await git('show', '--name-only', '--format=', 'HEAD')).split('\n').filter(Boolean);

beforeEach(async () => {
  send.mockReset();
  dir = await mkdtemp(join(tmpdir(), 'midnite-fixes-'));
  await cp(join(FIXTURES, 'legacy-3d'), dir, { recursive: true });
  await git('init', '--initial-branch=main', '--', '.');
  await git('config', 'user.email', 't@example.com');
  await git('config', 'user.name', 'T');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeRaw(patch: Record<string, unknown>) {
  await writeFile(join(dir, GAME_MANIFEST_FILE), `${JSON.stringify({ ...(await manifest()), ...patch }, null, 2)}\n`, 'utf8');
}

describe('applyGameFix (Phase 149 Theme D)', () => {
  it('set-genre: one commit naming only the manifest, unknown keys kept, event and fresh diagnosis', async () => {
    await writeRaw({ custom: { keep: 1 } });
    await commitAll();
    await writeFile(join(dir, 'unrelated.txt'), 'dirty but not the manifest', 'utf8');
    await git('add', 'unrelated.txt');
    const before = await commitCount();
    const result = await applyGameFix(dir, { fixId: 'set-genre', genre: 'shooter' }, deps());
    expect(result).toMatchObject({ ok: true, value: { commit: expect.stringMatching(/^[0-9a-f]{40}$/) } });
    expect(await commitCount()).toBe(before + 1);
    expect(await lastFiles()).toEqual([GAME_MANIFEST_FILE]);
    expect(await git('log', '-1', '--format=%s')).toBe('chore(midnite): set genre to shooter');
    expect(await manifest()).toMatchObject({ genre: 'shooter', custom: { keep: 1 } });
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
    if (result.ok) expect(result.value.diagnosis.path).toBe(dir);
  });

  it('set-genre: null means custom, and needs a genre argument', async () => {
    await commitAll();
    expect(await applyGameFix(dir, { fixId: 'set-genre' }, deps())).toMatchObject({ ok: false, message: 'Choose a genre first.' });
    expect(await applyGameFix(dir, { fixId: 'set-genre', genre: null }, deps())).toMatchObject({ ok: true });
    expect((await manifest()).genre).toBeNull();
  });

  it('normalise-vendored: true becomes the inferred versions; an object is a no-op', async () => {
    await writeRaw({ vendored: true });
    await commitAll();
    const result = await applyGameFix(dir, { fixId: 'normalise-vendored' }, deps());
    expect(result).toMatchObject({ ok: true, value: { commit: expect.any(String) } });
    expect(typeof (await manifest()).vendored).toBe('object');
    expect(await lastFiles()).toEqual([GAME_MANIFEST_FILE]);
    const before = await commitCount();
    expect(await applyGameFix(dir, { fixId: 'normalise-vendored' }, deps())).toMatchObject({ ok: true, value: { commit: null } });
    expect(await commitCount()).toBe(before);
  });

  it('add-build: the given block, else the inferred one; a bad out is refused', async () => {
    await commitAll();
    expect(await applyGameFix(dir, { fixId: 'add-build', build: { command: 'make', out: '../x' } }, deps())).toMatchObject({ ok: false });
    expect(await applyGameFix(dir, { fixId: 'add-build', build: { command: 'make web', out: 'web' } }, deps())).toMatchObject({ ok: true });
    expect((await manifest()).build).toEqual({ command: 'make web', out: 'web' });
    expect(await applyGameFix(dir, { fixId: 'add-build' }, deps())).toMatchObject({ ok: true });
    expect((await manifest()).build).toEqual({ command: 'npm run build', out: 'dist' });
    expect(await lastFiles()).toEqual([GAME_MANIFEST_FILE]);
  });

  it('declare-levels: prefers `level`, else the first scene alphabetically, and refuses with none', async () => {
    await commitAll();
    expect(await applyGameFix(dir, { fixId: 'declare-levels' }, deps())).toMatchObject({ ok: false });
    await mkdir(join(dir, 'levels'));
    await writeFile(join(dir, 'levels', 'b-two.tmj'), '{}', 'utf8');
    await writeFile(join(dir, 'levels', 'a-one.tmj'), '{}', 'utf8');
    await commitAll('levels');
    expect(await applyGameFix(dir, { fixId: 'declare-levels' }, deps())).toMatchObject({ ok: true });
    expect((await manifest()).levels).toEqual({ dir: 'levels', start: 'a-one' });
    await writeFile(join(dir, 'levels', 'level.tmj'), '{}', 'utf8');
    await commitAll('level');
    await applyGameFix(dir, { fixId: 'declare-levels' }, deps());
    expect((await manifest()).levels).toEqual({ dir: 'levels', start: 'level' });
  });

  it('refuses while the manifest is dirty, writing and committing nothing', async () => {
    await commitAll();
    await writeRaw({ name: 'Edited by hand' });
    const before = await commitCount();
    expect(await applyGameFix(dir, { fixId: 'set-genre', genre: 'rpg' }, deps())).toMatchObject({
      ok: false,
      message: 'Commit or discard your changes to midnite-game.json first.',
    });
    expect(await commitCount()).toBe(before);
    expect((await manifest()).genre).toBe('open-world');
    expect(send).not.toHaveBeenCalled();
  });

  it('write-manifest: infers one for a folder with none, refuses when one exists, takes an edited manifest', async () => {
    await rm(join(dir, GAME_MANIFEST_FILE));
    await writeFile(join(dir, 'package.json'), '{"name":"synth","dependencies":{"three":"0.185.1"}}', 'utf8');
    await commitAll();
    const result = await applyGameFix(dir, { fixId: 'write-manifest' }, deps());
    expect(result).toMatchObject({ ok: true, value: { commit: expect.any(String), diagnosis: { hasManifest: true } } });
    expect(await lastFiles()).toEqual([GAME_MANIFEST_FILE]);
    expect(await git('log', '-1', '--format=%s')).toBe('chore(midnite): add midnite-game.json');
    expect((await readFile(join(dir, GAME_MANIFEST_FILE), 'utf8')).endsWith('}\n')).toBe(true);
    expect(await applyGameFix(dir, { fixId: 'write-manifest' }, deps())).toMatchObject({ ok: false, message: 'midnite-game.json already exists.' });
  });

  it('write-manifest refuses a non Phaser/three folder', async () => {
    await rm(join(dir, GAME_MANIFEST_FILE));
    await commitAll();
    expect(await applyGameFix(dir, { fixId: 'write-manifest' }, deps())).toMatchObject({ ok: false, message: 'Only Phaser and three.js games are supported.' });
  });

  it('upgrade-kit delegates to upgradeKit: its own branch, none on main', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midnite-fixes-tpl-'));
    try {
      await writeRaw({ engine: 'phaser', dimension: '2d', perspective: 'platformer', vendored: {} });
      await commitAll();
      const phaser = join(root, `phaser@${GAME_ENGINE_VERSIONS.phaser}`);
      await mkdir(phaser, { recursive: true });
      await writeFile(join(phaser, 'phaser.esm.js'), 'x', 'utf8');
      const before = await commitCount();
      const result = await applyGameFix(dir, { fixId: 'upgrade-kit' }, { templateDir: root, enginesDir: root, send });
      expect(result).toMatchObject({ ok: true, value: { commit: null, branch: `kit-upgrade/${GAME_KIT_VERSION}` } });
      expect(await commitCount()).toBe(before);
      expect(await git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('upgrade-kit answers a refusal, not a throw, when the bundle lacks the engine', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midnite-fixes-tpl-'));
    try {
      await writeRaw({ engine: 'phaser', dimension: '2d', perspective: 'platformer', vendored: {} });
      await commitAll();
      expect(await applyGameFix(dir, { fixId: 'upgrade-kit' }, { templateDir: root, enginesDir: root, send })).toMatchObject({ ok: false });
      expect(await git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
