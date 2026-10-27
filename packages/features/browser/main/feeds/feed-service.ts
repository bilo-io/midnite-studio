import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SiteFeedId, SiteKnownBad } from '@midnite/studio-shared';

import { REPUTATION_FEEDS, matchFeeds, parseFeed, type FeedIndex } from './reputation-feeds';

/**
 * Pulls the reputation feeds on a schedule and keeps their parsed indexes in memory
 * (Phase 117 Theme C).
 *
 * **Nothing leaves while a feed is off.** Every feed starts disabled; `setEnabled` is the only way a
 * request is ever scheduled, and turning a feed off clears its timer and drops its index, so a
 * stale list is never used to judge a site. The renderer's switches (Settings ▸ Privacy) are
 * mirrored here over `browserSetSiteSafety`; each feed host is a Phase 115 `EGRESS_HOSTS` entry.
 *
 * On disk: `<userData>/browser-feeds/<id>.txt` (directory 0700, files 0600 via temp + rename), so
 * a restart with a feed on matches immediately from the last pull rather than waiting on the network.
 */

export const FEED_REFRESH_MS = 6 * 60 * 60 * 1000;
/** A feed larger than this is refused rather than parsed — both lists are a few MB at most. */
export const FEED_MAX_BYTES = 32 * 1024 * 1024;
const FEED_TIMEOUT_MS = 60_000;

export type FeedFetch = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type ReputationFeedServiceOptions = {
  directory: string;
  fetch: FeedFetch;
  log?: (message: string) => void;
  now?: () => number;
  refreshMs?: number;
};

export type ReputationFeedService = {
  setEnabled(enabled: Readonly<Record<SiteFeedId, boolean>>): void;
  /** The first enabled, loaded feed listing `url`. */
  match(url: string): SiteKnownBad | null;
  /** `'checked'` when at least one enabled feed has a list loaded. */
  reputation(): 'checked' | 'unavailable';
  /** Pull one feed now (the scheduler's own step; exported for tests). Resolves `false` on failure. */
  refresh(id: SiteFeedId): Promise<boolean>;
  dispose(): void;
};

export function createReputationFeedService(options: ReputationFeedServiceOptions): ReputationFeedService {
  const dir = join(options.directory, 'browser-feeds');
  const now = options.now ?? Date.now;
  const refreshMs = options.refreshMs ?? FEED_REFRESH_MS;
  const log = options.log ?? (() => {});
  const enabled = new Set<SiteFeedId>();
  const indexes = new Map<SiteFeedId, FeedIndex>();
  const timers = new Map<SiteFeedId, ReturnType<typeof setTimeout>>();

  const fileFor = (id: SiteFeedId) => join(dir, `${id}.txt`);

  function schedule(id: SiteFeedId, delayMs: number): void {
    clearTimeout(timers.get(id));
    const timer = setTimeout(() => {
      void refresh(id).finally(() => {
        if (enabled.has(id)) schedule(id, refreshMs);
      });
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(id, timer);
  }

  /** Loads the last pull from disk; returns its age in ms, or `Infinity` when there is none. */
  function loadFromDisk(id: SiteFeedId): number {
    const file = fileFor(id);
    if (!existsSync(file)) return Number.POSITIVE_INFINITY;
    try {
      indexes.set(id, parseFeed(id, readFileSync(file, 'utf8')));
      return now() - statSync(file).mtimeMs;
    } catch (err) {
      log(`[browser-feeds] could not read ${id}: ${String(err)}`);
      return Number.POSITIVE_INFINITY;
    }
  }

  async function refresh(id: SiteFeedId): Promise<boolean> {
    if (!enabled.has(id)) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    timeout.unref?.();
    try {
      const response = await options.fetch(REPUTATION_FEEDS[id].url, { signal: controller.signal });
      if (!response.ok) {
        log(`[browser-feeds] ${id} answered ${response.status}`);
        return false;
      }
      const text = await response.text();
      if (text.length > FEED_MAX_BYTES) {
        log(`[browser-feeds] ${id} refused: ${text.length} bytes is over the cap`);
        return false;
      }
      // The switch may have gone off while the request was in flight — honour it.
      if (!enabled.has(id)) return false;
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${fileFor(id)}.${process.pid}.tmp`;
      writeFileSync(tmp, text, { mode: 0o600 });
      renameSync(tmp, fileFor(id));
      indexes.set(id, parseFeed(id, text));
      return true;
    } catch (err) {
      log(`[browser-feeds] ${id} pull failed: ${String(err)}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    setEnabled(next) {
      for (const id of Object.keys(REPUTATION_FEEDS) as SiteFeedId[]) {
        const on = next[id] === true;
        if (on && !enabled.has(id)) {
          enabled.add(id);
          const age = loadFromDisk(id);
          schedule(id, age >= refreshMs ? 0 : refreshMs - age);
        } else if (!on && enabled.has(id)) {
          enabled.delete(id);
          clearTimeout(timers.get(id));
          timers.delete(id);
          indexes.delete(id);
        }
      }
    },
    match(url) {
      const active = [...indexes.entries()].filter(([id]) => enabled.has(id)).map(([, index]) => index);
      return matchFeeds(active, url);
    },
    reputation() {
      return [...indexes.keys()].some((id) => enabled.has(id)) ? 'checked' : 'unavailable';
    },
    refresh,
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      enabled.clear();
      indexes.clear();
    },
  };
}
