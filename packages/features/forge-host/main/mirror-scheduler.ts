import { INTERVAL_MS, type MirrorConfig, type MirrorConfigRepo } from './mirror-config';
import type { MirrorResult } from './mirror-refresh';

export type MirrorSchedulerDeps = {
  load: () => Promise<MirrorConfig>;
  /** Persist one run's outcome into the config's `state`. */
  record: (result: MirrorResult) => Promise<void>;
  refresh: (repo: MirrorConfigRepo, config: MirrorConfig, signal: AbortSignal) => Promise<MirrorResult>;
  /** Where a persist failure goes; the refresh outcome is kept either way. */
  warn?: (message: string) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * The main-side scheduler (Phase 119 Theme A): one timer, not a loop. `start()` runs the repos that
 * are due and re-arms for the next due time; `runNow()` is the manual button. Repos on different
 * hosts refresh in parallel, repos on one host strictly one at a time so a provider never sees two
 * of our requests at once.
 */
export function createMirrorScheduler(deps: MirrorSchedulerDeps) {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let handle: unknown = null;
  let running: Promise<MirrorResult[]> | null = null;
  let stopped = true;
  let controller = new AbortController();
  /**
   * Last successful run per repo whose outcome could not be persisted. Without it the repo would stay
   * "never run" in `state` and be re-mirrored every tick, burning the provider's rate limit.
   * (`deps.record` serialises its own writes: the file's one serialiser lives with the file.)
   */
  const unsaved = new Map<string, string>();

  const keyOf = (r: MirrorConfigRepo) => `${r.host}/${r.owner}/${r.repo}`;

  async function run(select: (repo: MirrorConfigRepo, config: MirrorConfig) => boolean): Promise<MirrorResult[]> {
    const config = await deps.load();
    const byHost = new Map<string, MirrorConfigRepo[]>();
    for (const repo of config.repos) if (select(repo, config)) byHost.set(repo.host, [...(byHost.get(repo.host) ?? []), repo]);
    const lanes = [...byHost.values()].map(async (repos) => {
      const out: MirrorResult[] = [];
      for (const repo of repos) {
        try {
          const signal = controller.signal;
          const result = await deps.refresh(repo, config, signal);
          out.push(result);
          if (signal.aborted) break; // a quit mid-run: nothing to record, and the rest of the lane waits for next boot
          try {
            await deps.record(result);
            unsaved.delete(result.key);
          } catch (error) {
            unsaved.set(result.key, result.at);
            deps.warn?.(`mirror ${result.key}: ran (${result.status}) but its state could not be saved: ${error instanceof Error ? error.message : String(error)}`);
          }
        } catch (error) {
          // One repo's failure must not drop the rest of its lane, nor the other hosts' results.
          out.push({ key: keyOf(repo), status: 'failed', reason: error instanceof Error ? error.message : String(error), at: new Date(now()).toISOString(), incremental: false, refs: 0 });
        }
      }
      return out;
    });
    return (await Promise.all(lanes)).flat();
  }

  /** One run at a time: a second request joins the one in flight. */
  function exclusive(select: Parameters<typeof run>[0]): Promise<MirrorResult[]> {
    const start = (): Promise<MirrorResult[]> => {
      const current = run(select).finally(() => {
        if (running === current) running = null;
      });
      running = current;
      return current;
    };
    // Queue behind a run in flight rather than joining it: the in-flight run may have selected fewer repos.
    return running ? running.then(start, start) : start();
  }

  const isDue = (repo: MirrorConfigRepo, config: MirrorConfig): boolean => {
    if (config.interval === 'manual') return false;
    const key = keyOf(repo);
    const last = [config.state[key]?.at, unsaved.get(key)].filter((v): v is string => !!v).sort().pop();
    return !last || now() - Date.parse(last) >= INTERVAL_MS[config.interval];
  };

  async function tick(): Promise<void> {
    if (stopped) return;
    await exclusive(isDue).catch(() => []); // a failed config load: arm() below retries
    await arm();
  }

  async function arm(): Promise<void> {
    if (stopped) return;
    let interval: MirrorConfig['interval'];
    try {
      interval = (await deps.load()).interval;
    } catch {
      interval = 'hourly'; // an unreadable config must not end the schedule; retry in an hour
    }
    if (stopped || interval === 'manual') return;
    if (handle !== null) clearTimer(handle);
    handle = setTimer(() => void tick(), INTERVAL_MS[interval]);
  }

  return {
    async start(): Promise<void> {
      stopped = false;
      controller = new AbortController();
      await tick();
    },
    stop(): void {
      stopped = true;
      controller.abort();
      if (handle !== null) clearTimer(handle);
      handle = null;
    },
    /** Manual: every selected repo now, due or not. */
    runNow: (): Promise<MirrorResult[]> => exclusive(() => true),
  };
}
