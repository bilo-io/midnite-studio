import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readScriptTrust, setScriptTrust } from './collection-trust';

async function readGitignore(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, '.midnite', 'api', '.gitignore'), 'utf8');
}

async function readOverlay(repoRoot: string, collectionId: string): Promise<string> {
  const slug = collectionId.replace(/\.postman_collection\.json$/, '');
  return readFile(join(repoRoot, '.midnite', 'api', 'collections', `${slug}.local.json`), 'utf8');
}

describe('collection-trust', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-collection-trust-')));
    await mkdir(join(repoRoot, '.midnite', 'api', 'collections'), { recursive: true });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('an unset collection reads as null — "ask", not "never"', async () => {
    const trust = await readScriptTrust(repoRoot, 'demo.postman_collection.json');
    expect(trust).toBeNull();
  });

  it('setScriptTrust(true) persists, and readScriptTrust reflects it', async () => {
    const ok = await setScriptTrust(repoRoot, 'demo.postman_collection.json', true);
    expect(ok).toBe(true);
    expect(await readScriptTrust(repoRoot, 'demo.postman_collection.json')).toBe(true);
  });

  it('setScriptTrust(false) persists as an explicit decline, not "unset"', async () => {
    await setScriptTrust(repoRoot, 'demo.postman_collection.json', false);
    expect(await readScriptTrust(repoRoot, 'demo.postman_collection.json')).toBe(false);
  });

  it('the marker lives in a sibling .local.json, never the collection file itself', async () => {
    await setScriptTrust(repoRoot, 'demo.postman_collection.json', true);
    const overlay = await readOverlay(repoRoot, 'demo.postman_collection.json');
    expect(overlay).toContain('_midniteScriptsTrusted');
    // No `demo.postman_collection.json` was ever written by this module —
    // only the sibling `.local.json` exists under collections/.
    const collectionPath = join(repoRoot, '.midnite', 'api', 'collections', 'demo.postman_collection.json');
    await expect(readFile(collectionPath, 'utf8')).rejects.toThrow();
  });

  it('writes .midnite/api/.gitignore protecting *.local.json, even with no environment ever saved', async () => {
    await setScriptTrust(repoRoot, 'demo.postman_collection.json', true);
    const gitignore = await readGitignore(repoRoot);
    expect(gitignore).toContain('*.local.json');
  });

  it('a second decision overwrites the first cleanly', async () => {
    await setScriptTrust(repoRoot, 'demo.postman_collection.json', true);
    expect(await readScriptTrust(repoRoot, 'demo.postman_collection.json')).toBe(true);
    await setScriptTrust(repoRoot, 'demo.postman_collection.json', false);
    expect(await readScriptTrust(repoRoot, 'demo.postman_collection.json')).toBe(false);
  });

  it('two collections carry independent trust decisions', async () => {
    await setScriptTrust(repoRoot, 'alpha.postman_collection.json', true);
    await setScriptTrust(repoRoot, 'beta.postman_collection.json', false);
    expect(await readScriptTrust(repoRoot, 'alpha.postman_collection.json')).toBe(true);
    expect(await readScriptTrust(repoRoot, 'beta.postman_collection.json')).toBe(false);
  });

  it('a malformed overlay file reads as null rather than throwing', async () => {
    await writeFile(
      join(repoRoot, '.midnite', 'api', 'collections', 'demo.local.json'),
      'not json at all',
      'utf8',
    );
    expect(await readScriptTrust(repoRoot, 'demo.postman_collection.json')).toBeNull();
  });

  it('rejects a collectionId that tries to escape the collections directory', async () => {
    expect(await readScriptTrust(repoRoot, '../../etc/passwd')).toBeNull();
    expect(await setScriptTrust(repoRoot, '../../etc/passwd', true)).toBe(false);
  });
});
