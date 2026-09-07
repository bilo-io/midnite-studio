import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PostmanEnvironment } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteEnvironment, ensureApiGitignore, listEnvironments, readEnvironment, saveEnvironment } from './environment-io';

function makeEnvironment(overrides: Partial<PostmanEnvironment> = {}): PostmanEnvironment {
  return {
    id: 'env-1',
    name: 'Local',
    values: [
      { key: 'baseUrl', value: 'http://127.0.0.1:7777', type: 'default', enabled: true },
      { key: 'authToken', value: 'super-secret-token', type: 'secret', enabled: true },
    ],
    ...overrides,
  };
}

async function readBaseFileBytes(repoRoot: string, fileName: string): Promise<string> {
  return readFile(join(repoRoot, '.midnite', 'api', 'environments', fileName), 'utf8');
}

async function readOverlayFileBytes(repoRoot: string, slug: string): Promise<string> {
  return readFile(join(repoRoot, '.midnite', 'api', 'environments', `${slug}.local.json`), 'utf8');
}

async function readGitignore(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, '.midnite', 'api', '.gitignore'), 'utf8');
}

describe('environment-io', () => {
  let repoRoot: string;

  beforeEach(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var →
    // /private/var), and confineParent/confineTree compare against the REAL
    // root, matching collection-io.test.ts's own setup.
    repoRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-environment-io-')));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  describe('the secret split', () => {
    it('save with two secret rows writes neither value into the base file', async () => {
      const environment = makeEnvironment({
        values: [
          { key: 'authToken', value: 'super-secret-token', type: 'secret', enabled: true },
          { key: 'refreshToken', value: 'another-secret', type: 'secret', enabled: true },
          { key: 'baseUrl', value: 'http://127.0.0.1:7777', type: 'default', enabled: true },
        ],
      });

      const saved = await saveEnvironment(repoRoot, null, environment, true);
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.value).toEqual({ status: 'saved', fileName: 'local.postman_environment.json' });

      const baseBytes = await readBaseFileBytes(repoRoot, 'local.postman_environment.json');
      // A substring assertion on the raw bytes, not a parsed compare — the
      // phase doc's own wording for this test.
      expect(baseBytes).not.toContain('super-secret-token');
      expect(baseBytes).not.toContain('another-secret');
      expect(baseBytes).toContain('"authToken"');
      expect(baseBytes).toContain('"refreshToken"');
      expect(baseBytes).toContain('http://127.0.0.1:7777');

      const overlayBytes = await readOverlayFileBytes(repoRoot, 'local');
      expect(overlayBytes).toContain('super-secret-token');
      expect(overlayBytes).toContain('another-secret');
    });

    it('read merges the overlay back over the base', async () => {
      const environment = makeEnvironment();
      const saved = await saveEnvironment(repoRoot, null, environment, true);
      expect(saved.ok).toBe(true);

      const list = await listEnvironments(repoRoot);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(1);
      const id = list.value[0]!.id;

      const read = await readEnvironment(repoRoot, id);
      expect(read.ok).toBe(true);
      if (!read.ok) return;

      const authToken = read.value.values.find((v) => v.key === 'authToken');
      expect(authToken?.value).toBe('super-secret-token');
      const baseUrl = read.value.values.find((v) => v.key === 'baseUrl');
      expect(baseUrl?.value).toBe('http://127.0.0.1:7777');
    });

    it('a deleted secret row removes its overlay key', async () => {
      const first = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const list = await listEnvironments(repoRoot);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      const id = list.value[0]!.id;

      // Re-save with the secret row gone entirely.
      const withoutSecret = makeEnvironment({
        values: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777', type: 'default', enabled: true }],
      });
      const resaved = await saveEnvironment(repoRoot, id, withoutSecret, true);
      expect(resaved.ok).toBe(true);

      const overlayBytes = await readOverlayFileBytes(repoRoot, 'local');
      expect(overlayBytes).not.toContain('authToken');
      expect(overlayBytes).not.toContain('super-secret-token');
    });
  });

  describe('.gitignore protection', () => {
    it('is created once and not duplicated on a second secret save', async () => {
      const first = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const gitignoreAfterFirst = await readGitignore(repoRoot);
      expect(gitignoreAfterFirst).toContain('*.local.json');

      const list = await listEnvironments(repoRoot);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      const id = list.value[0]!.id;

      const second = await saveEnvironment(repoRoot, id, makeEnvironment({ name: 'Local' }), true);
      expect(second.ok).toBe(true);

      const gitignoreAfterSecond = await readGitignore(repoRoot);
      // Exactly one occurrence of the pattern — not appended a second time.
      expect(gitignoreAfterSecond.split('*.local.json')).toHaveLength(2);
    });

    it('appends the pattern to an existing .gitignore that lacks it, without clobbering it', async () => {
      await mkdir(join(repoRoot, '.midnite', 'api'), { recursive: true });
      await writeFile(join(repoRoot, '.midnite', 'api', '.gitignore'), '*.tmp\n', 'utf8');

      const saved = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(saved.ok).toBe(true);

      const gitignore = await readGitignore(repoRoot);
      expect(gitignore).toContain('*.tmp');
      expect(gitignore).toContain('*.local.json');
    });

    it('ensureApiGitignore does nothing when the pattern is already present', async () => {
      await mkdir(join(repoRoot, '.midnite', 'api'), { recursive: true });
      await writeFile(join(repoRoot, '.midnite', 'api', '.gitignore'), '# mine\n*.local.json\n', 'utf8');

      await ensureApiGitignore(repoRoot);

      const gitignore = await readGitignore(repoRoot);
      expect(gitignore).toBe('# mine\n*.local.json\n');
    });
  });

  describe('the blast-radius confirm gate', () => {
    it('a save with secret rows in an unprotected repo needs confirmation and writes nothing', async () => {
      const result = await saveEnvironment(repoRoot, null, makeEnvironment(), false);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({
        status: 'needs-confirm',
        secretCount: 1,
        gitignorePath: '.midnite/api/.gitignore',
      });

      const list = await listEnvironments(repoRoot);
      expect(list.ok).toBe(true);
      if (list.ok) expect(list.value).toEqual([]);
    });

    it('proceeds once confirmed:true is sent', async () => {
      const first = await saveEnvironment(repoRoot, null, makeEnvironment(), false);
      expect(first.ok).toBe(true);
      if (!first.ok || first.value.status !== 'needs-confirm') throw new Error('expected needs-confirm');

      const confirmed = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(confirmed.ok).toBe(true);
      if (confirmed.ok) {
        expect(confirmed.value).toEqual({ status: 'saved', fileName: 'local.postman_environment.json' });
      }
    });

    it('does not ask again once the repo is already protected', async () => {
      const first = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const list = await listEnvironments(repoRoot);
      if (!list.ok) return;
      const id = list.value[0]!.id;

      // A second environment, never confirmed explicitly — should still save
      // outright because the repo is already protected.
      const second = await saveEnvironment(
        repoRoot,
        null,
        makeEnvironment({ name: 'Remote', id: 'env-2' }),
        false,
      );
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value).toEqual({ status: 'saved', fileName: 'remote.postman_environment.json' });
      }
      void id;
    });

    it('a save with no secret rows never needs confirmation', async () => {
      const environment = makeEnvironment({
        values: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777', type: 'default', enabled: true }],
      });
      const result = await saveEnvironment(repoRoot, null, environment, false);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ status: 'saved', fileName: 'local.postman_environment.json' });
      }
    });
  });

  describe('slug de-duplication', () => {
    it('saves of environments with the same name land as <slug> then <slug>-2', async () => {
      const first = await saveEnvironment(repoRoot, null, makeEnvironment({ name: 'Prod' }), true);
      const second = await saveEnvironment(repoRoot, null, makeEnvironment({ name: 'Prod' }), true);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const list = await listEnvironments(repoRoot);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value.map((e) => e.fileName).sort()).toEqual([
        'prod-2.postman_environment.json',
        'prod.postman_environment.json',
      ]);
    });
  });

  describe('symlink escape refusal', () => {
    it('confineTree refuses a listEnvironments read through a .midnite/api symlinked outside the repo, and writes nothing', async () => {
      const outsideRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-outside-env-')));
      const outsideEnvironments = join(outsideRoot, 'environments');
      await mkdir(outsideEnvironments);
      await writeFile(join(outsideEnvironments, 'rogue.postman_environment.json'), '{}', 'utf8');

      await mkdir(join(repoRoot, '.midnite'));
      await symlink(outsideRoot, join(repoRoot, '.midnite', 'api'));

      const result = await listEnvironments(repoRoot);
      expect(result.ok).toBe(false);

      await rm(outsideRoot, { recursive: true, force: true });
    });

    it('confineTree refuses a save when environments/ itself is symlinked outside the repo, and writes nothing', async () => {
      const outsideRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-outside-envdir-')));

      await mkdir(join(repoRoot, '.midnite', 'api'), { recursive: true });
      await symlink(outsideRoot, join(repoRoot, '.midnite', 'api', 'environments'));

      const result = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(result.ok).toBe(false);

      // Nothing was written into the directory the symlink points at.
      expect(await readdir(outsideRoot)).toEqual([]);

      await rm(outsideRoot, { recursive: true, force: true });
    });
  });

  describe('deleteEnvironment', () => {
    it('removes both the base file and the overlay', async () => {
      const saved = await saveEnvironment(repoRoot, null, makeEnvironment(), true);
      expect(saved.ok).toBe(true);

      const list = await listEnvironments(repoRoot);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      const id = list.value[0]!.id;

      const deleted = await deleteEnvironment(repoRoot, id);
      expect(deleted.ok).toBe(true);

      const listAfter = await listEnvironments(repoRoot);
      expect(listAfter.ok).toBe(true);
      if (listAfter.ok) expect(listAfter.value).toEqual([]);

      const read = await readEnvironment(repoRoot, id);
      expect(read.ok).toBe(false);
    });
  });

  describe('listEnvironments on a repo with nothing saved yet', () => {
    it('is an empty success, not an error', async () => {
      const result = await listEnvironments(repoRoot);
      expect(result).toEqual({ ok: true, value: [] });
    });
  });
});
