import type { Forge } from '@midnite/studio-shared';

import { loadMirrorConfig, saveMirrorConfig, type MirrorConfig, type MirrorConfigRepo } from './mirror-config';
import { createForgeMetadataSource, type ForgeReadAdapter } from './forge-metadata-source';
import { defaultMirrorRoot } from './mirror-layout';
import type { MetadataSource } from './mirror-metadata';
import { refreshMirror, type MirrorResult } from './mirror-refresh';
import { createMirrorScheduler } from './mirror-scheduler';

/** What the composing app knows about a configured repo: its forge, an adapter for it, and who the adapter acts as. */
export type ResolvedMirrorForge = { forge: Forge; adapter: ForgeReadAdapter; account: string };

export type MirrorHostDeps = {
  /** `mirrors.json`. */
  configFile: string;
  /**
   * The app's own adapter lookup (it holds the accounts); `null` mirrors the refs only (Tier 1), which
   * is also what a host with no account, or a forge kind with no adapter, gets.
   */
  resolve: (repo: MirrorConfigRepo) => Promise<ResolvedMirrorForge | null>;
  home?: string;
  warn?: (message: string) => void;
  /** Test seams. */
  refresh?: typeof refreshMirror;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Phase 119 Theme A's host: the scheduler wired to `mirrors.json`, the real refresh, and a metadata
 * source composed per repo from the app's adapter. `start()` runs what is due and keeps the timer;
 * `stop()` (on quit) clears it. Nothing here throws into the app: a repo that cannot be resolved is
 * mirrored as refs only, and a config that cannot be read is reported and retried by the scheduler.
 */
export function createMirrorHost(deps: MirrorHostDeps) {
  const refresh = deps.refresh ?? refreshMirror;
  const warn = deps.warn ?? (() => undefined);
  /** `record` rewrites the file, so two lanes finishing together serialise here too. */
  let saving: Promise<unknown> = Promise.resolve();

  async function sourceFor(repo: MirrorConfigRepo): Promise<MetadataSource | undefined> {
    let resolved: ResolvedMirrorForge | null = null;
    try {
      resolved = await deps.resolve(repo);
    } catch (error) {
      warn(`mirror ${repo.host}/${repo.owner}/${repo.repo}: no adapter (${error instanceof Error ? error.message : String(error)}); refs only`);
    }
    return resolved ? createForgeMetadataSource(resolved) : undefined;
  }

  const scheduler = createMirrorScheduler({
    load: () => loadMirrorConfig(deps.configFile),
    record: (result: MirrorResult) => {
      const next = saving.then(async () => {
        const config = await loadMirrorConfig(deps.configFile);
        const entry = { at: result.at, status: result.status, ...(result.reason ? { reason: result.reason } : {}) };
        await saveMirrorConfig(deps.configFile, { ...config, state: { ...config.state, [result.key]: entry } });
      });
      saving = next.catch(() => undefined);
      return next;
    },
    refresh: async (repo: MirrorConfigRepo, config: MirrorConfig) =>
      refresh({ root: config.root ?? defaultMirrorRoot(deps.home), repo, url: repo.url, source: await sourceFor(repo) }),
    now: deps.now,
    setTimer: deps.setTimer,
    clearTimer: deps.clearTimer,
  });

  return {
    /** Idempotent enough for boot: errors are reported, never thrown. */
    start: (): Promise<void> => scheduler.start().catch((error) => warn(`mirror scheduler: ${error instanceof Error ? error.message : String(error)}`)),
    stop: scheduler.stop,
    runNow: scheduler.runNow,
  };
}

export type MirrorHost = ReturnType<typeof createMirrorHost>;
