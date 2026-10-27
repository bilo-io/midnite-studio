import { ensurePrivateDir } from '@midnite/studio-runtime';

import { isSafeRemoteUrl, mirrorKey, mirrorPaths, type MirrorRepo } from './mirror-layout';
import { hashMetaFiles, readManifest, verifyManifest, writeManifest } from './mirror-manifest';
import { exportMetadata, type BackoffOptions, type MetadataSource } from './mirror-metadata';
import { isMirrorPresent, listRefs, mirrorClone, mirrorFsck, mirrorUpdate } from './mirror-git';

export type MirrorStatus = 'ok' | 'degraded' | 'failed';

export type MirrorResult = {
  key: string;
  status: MirrorStatus;
  /** Why it is not `ok`. */
  reason?: string;
  at: string;
  /** Whether the metadata export ran incrementally (`since` was set). */
  incremental: boolean;
  refs: number;
};

export type RefreshOptions = {
  root: string;
  repo: MirrorRepo;
  /** Where to fetch from. */
  url: string;
  /** Absent: Tier 1 still mirrors the refs, with no metadata. */
  source?: MetadataSource;
  now?: () => Date;
  backoff?: BackoffOptions;
};

/**
 * One refresh of one mirror: clone or update, `git fsck`, compare heads, export metadata, verify the
 * manifest. A problem after the fetch marks the mirror `degraded` and **keeps the previous manifest**
 * (it is the last known-good record); a problem fetching at all is `failed`.
 */
async function refreshMirrorUnguarded({ root, repo, url, source, now = () => new Date(), backoff }: RefreshOptions): Promise<MirrorResult> {
  const key = mirrorKey(repo);
  const at = now().toISOString();
  const result = (status: MirrorStatus, extra: Partial<MirrorResult> = {}): MirrorResult => ({ key, status, at, incremental: false, refs: 0, ...extra });

  if (!isSafeRemoteUrl(url)) return result('failed', { reason: 'unsafe remote URL' });
  let paths;
  try {
    paths = mirrorPaths(root, repo);
  } catch (error) {
    return result('failed', { reason: error instanceof Error ? error.message : String(error) });
  }

  await ensurePrivateDir(paths.parent);
  const fetched = (await isMirrorPresent(paths.bare)) ? await mirrorUpdate(paths.bare) : await mirrorClone(paths.parent, url, paths.name);
  if (!fetched.ok) return result('failed', { reason: fetched.message });

  const fsck = await mirrorFsck(paths.bare);
  const refs = await listRefs(paths.bare);
  const refCount = Object.keys(refs).length;
  if (!fsck.ok) return result('degraded', { reason: `git fsck: ${fsck.message}`, refs: refCount });

  if (!source) return result('ok', { refs: refCount });

  await ensurePrivateDir(paths.meta);
  const previous = await readManifest(paths.meta);
  if (previous) {
    const check = await verifyManifest(paths.meta, previous);
    if (!check.ok) return result('degraded', { reason: `metadata changed since last run: ${check.problems.join(', ')} (delete the .meta folder to rebuild it)`, refs: refCount });
  }

  const head = await source.defaultBranch();
  if (head && refs[head.ref] !== head.sha) {
    return result('degraded', { reason: `${head.ref} is ${refs[head.ref]?.slice(0, 8) ?? 'absent'} in the mirror, ${head.sha.slice(0, 8)} on the forge`, refs: refCount });
  }

  const since = previous?.fetchedAt ?? null;
  await exportMetadata({ source, metaDir: paths.meta, since, backoff });
  const files = await hashMetaFiles(paths.meta);
  await writeManifest(paths.meta, { fetchedAt: at, headRefs: refs, files, adapter: source.adapter, account: source.account });

  const written = await readManifest(paths.meta);
  const check = written ? await verifyManifest(paths.meta, written) : ({ ok: false, problems: ['manifest unreadable'] } as const);
  if (!check.ok) return result('degraded', { reason: check.problems.join(', '), refs: refCount, incremental: since !== null });
  return result('ok', { refs: refCount, incremental: since !== null });
}

/**
 * The public entry: never rejects. A source that throws (a rate limit past its retries, a network
 * error) after some metadata files were rewritten leaves them disagreeing with the kept manifest, so
 * the run is reported `degraded` rather than thrown into the scheduler.
 */
export async function refreshMirror(options: RefreshOptions): Promise<MirrorResult> {
  try {
    return await refreshMirrorUnguarded(options);
  } catch (error) {
    return {
      key: mirrorKey(options.repo),
      status: 'degraded',
      reason: `refresh interrupted: ${error instanceof Error ? error.message : String(error)}`,
      at: (options.now ?? (() => new Date()))().toISOString(),
      incremental: false,
      refs: 0,
    };
  }
}
