import { existsSync } from 'node:fs';
import { appendFile, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TempRepo, execGit } from '@midnite/studio-git-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isMirrorPresent, listRefs, mirrorClone, remoteDefaultBranch, restoreMirror } from './mirror-git';
import { mirrorPaths } from './mirror-layout';
import { readManifest } from './mirror-manifest';
import type { MetadataSource } from './mirror-metadata';
import { refreshMirror } from './mirror-refresh';

let upstream: TempRepo;
let root: string;
const repo = { host: 'example.test', owner: 'me', repo: 'thing' };

beforeEach(async () => {
  upstream = await TempRepo.create();
  await upstream.commitFile('a.txt', 'one\n', 'first');
  await upstream.git(['branch', 'topic']);
  root = await mkdtemp(join(tmpdir(), 'forge-host-mirror-'));
});
afterEach(async () => {
  await upstream.cleanup();
  await rm(root, { recursive: true, force: true });
});

const sourceFor = async (seen: (string | null)[] = []): Promise<MetadataSource> => {
  const sha = (await upstream.git(['rev-parse', 'HEAD'])).trim();
  const branch = (await upstream.git(['symbolic-ref', 'HEAD'])).trim();
  return {
    adapter: 'fake',
    account: 'me',
    defaultBranch: async () => ({ ref: branch, sha }),
    records: async (kind, since) => {
      seen.push(since);
      return kind === 'issues' ? [{ id: 1, title: 'hi' }] : [];
    },
    snapshot: async () => [],
  };
};

describe('refreshMirror', () => {
  it('mirrors every ref and its metadata, then refreshes incrementally', async () => {
    const seen: (string | null)[] = [];
    const first = await refreshMirror({ root, repo, url: upstream.path, source: await sourceFor(seen) });
    expect(first).toMatchObject({ status: 'ok', incremental: false });
    const paths = mirrorPaths(root, repo);
    expect(Object.keys(await listRefs(paths.bare))).toContain('refs/heads/topic');
    expect((await stat(paths.meta)).mode & 0o777).toBe(0o700);
    const manifest = await readManifest(paths.meta);
    expect(Object.keys(manifest?.files ?? {})).toContain('issues.ndjson');
    expect(Object.keys(manifest?.headRefs ?? {})).toContain('refs/heads/topic');

    await upstream.commitFile('b.txt', 'two\n', 'second');
    const second = await refreshMirror({ root, repo, url: upstream.path, source: await sourceFor(seen) });
    expect(second).toMatchObject({ status: 'ok', incremental: true });
    expect(seen[0]).toBeNull();
    expect(seen.at(-1)).toBe(manifest?.fetchedAt);
  });

  it('mirrors refs alone when there is no metadata source', async () => {
    const result = await refreshMirror({ root, repo, url: upstream.path });
    expect(result.status).toBe('ok');
    expect(existsSync(mirrorPaths(root, repo).meta)).toBe(false);
  });

  it('marks a mirror degraded, naming the object, when one is corrupted', async () => {
    await refreshMirror({ root, repo, url: upstream.path });
    const { bare } = mirrorPaths(root, repo);
    const objects = join(bare, 'objects');
    const dirs = (await readdir(objects)).filter((d) => /^[0-9a-f]{2}$/.test(d));
    const victim = join(objects, dirs[0]!, (await readdir(join(objects, dirs[0]!)))[0]!);
    const { chmod } = await import('node:fs/promises');
    await chmod(victim, 0o644);
    await writeFile(victim, 'garbage');
    const result = await refreshMirror({ root, repo, url: upstream.path });
    expect(result.status).toBe('degraded');
    expect(result.reason).toMatch(/fsck/);
  });

  it('degrades on a tampered metadata file and keeps the previous manifest', async () => {
    await refreshMirror({ root, repo, url: upstream.path, source: await sourceFor() });
    const { meta } = mirrorPaths(root, repo);
    const before = await readManifest(meta);
    await appendFile(join(meta, 'issues.ndjson'), '{"id":99}\n');
    const result = await refreshMirror({ root, repo, url: upstream.path, source: await sourceFor() });
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('issues.ndjson: checksum mismatch');
    expect(await readManifest(meta)).toEqual(before);
  });

  it('degrades when the forge default branch is ahead of the mirror', async () => {
    const source = await sourceFor();
    const stale: MetadataSource = { ...source, defaultBranch: async () => ({ ref: (await source.defaultBranch())!.ref, sha: 'f'.repeat(40) }) };
    const result = await refreshMirror({ root, repo, url: upstream.path, source: stale });
    expect(result.status).toBe('degraded');
    expect(result.reason).toMatch(/on the forge/);
  });

  it('reports a source that throws as degraded instead of rejecting', async () => {
    const source = await sourceFor();
    const broken: MetadataSource = { ...source, records: async () => { throw new Error('429 after retries'); } };
    const result = await refreshMirror({ root, repo, url: upstream.path, source: broken });
    expect(result).toMatchObject({ status: 'degraded' });
    expect(result.reason).toContain('429 after retries');
  });

  it('fails, not degrades, when the remote cannot be fetched or is unsafe', async () => {
    expect((await refreshMirror({ root, repo, url: join(root, 'nope') })).status).toBe('failed');
    expect(await refreshMirror({ root, repo, url: '--upload-pack=x' })).toMatchObject({ status: 'failed', reason: 'unsafe remote URL' });
    expect(await refreshMirror({ root, repo: { ...repo, owner: '..' }, url: upstream.path })).toMatchObject({ status: 'failed' });
  });
});

describe('restoreMirror', () => {
  it('reproduces every ref in an empty bare repo', async () => {
    await refreshMirror({ root, repo, url: upstream.path });
    const { bare } = mirrorPaths(root, repo);
    const target = join(root, 'restored.git');
    await execGit(root, ['init', '--bare', '--', target], { write: true, throwOnError: true });
    expect(await restoreMirror(bare, target)).toEqual({ ok: true });
    expect(await listRefs(target)).toEqual(await listRefs(bare));
  });

  it('refuses an unsafe target', async () => {
    expect(await restoreMirror(mirrorPaths(root, repo).bare, '--receive-pack=x')).toEqual({ ok: false, message: 'unsafe restore target' });
  });

  it('reports a push failure', async () => {
    await refreshMirror({ root, repo, url: upstream.path });
    const result = await restoreMirror(mirrorPaths(root, repo).bare, join(root, 'missing.git'));
    expect(result.ok).toBe(false);
  });

  it('reads the remote default branch and tip with ls-remote', async () => {
    const sha = (await upstream.git(['rev-parse', 'HEAD'])).trim();
    const branch = (await upstream.git(['symbolic-ref', 'HEAD'])).trim();
    expect(await remoteDefaultBranch(upstream.path)).toEqual({ ref: branch, sha });
    expect(await remoteDefaultBranch(join(root, 'missing'))).toBeNull();
  });

  it('an aborted clone leaves no mirror and no partial directory behind', async () => {
    const controller = new AbortController();
    controller.abort();
    const out = await mirrorClone(root, upstream.path, 'x.git', controller.signal);
    expect(out).toEqual({ ok: false, message: 'aborted' });
    expect(await readdir(root)).toEqual([]);
    expect(await isMirrorPresent(join(root, 'x.git'))).toBe(false);
  });

  it('a refresh aborted before it starts reports failed/aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await refreshMirror({ root, repo, url: upstream.path, source: await sourceFor(), signal: controller.signal });
    expect(result).toMatchObject({ status: 'failed', reason: 'aborted' });
  });
});
