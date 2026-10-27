import { INTERVAL_MS, type MirrorConfig, type MirrorConfigRepo } from './mirror-config';
import type { MirrorResult } from './mirror-refresh';

export type MirrorSchedulerDeps = {
  load: () => Promise<MirrorConfig>;
  /** Persist one run's outcome into the config's `state`. */
  record: (result: MirrorResult) => Promise<void>;
  refresh: (repo: MirrorConfigRepo, config: MirrorConfig) => Promise<MirrorResult>;
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
  let recording: Promise<unknown> = Promise.resolve();
  /** `record` is usually load-modify-save on one file, so two hosts finishing together must not interleave. */
  const record = (result: MirrorResult): Promise<void> => {
    const next = recording.then(() => deps.record(result));
    recording = next.catch(() => undefined);
    return next;
  };

  const keyOf = (r: MirrorConfigRepo) => `${r.host}/${r.owner}/${r.repo}`;

  async function run(select: (repo: MirrorConfigRepo, config: MirrorConfig) => boolean): Promise<MirrorResult[]> {
    const config = await deps.load();
    const byHost = new Map<string, MirrorConfigRepo[]>();
    for (const repo of config.repos) if (select(repo, config)) byHost.set(repo.host, [...(byHost.get(repo.host) ?? []), repo]);
    const lanes = [...byHost.values()].map(async (repos) => {
      const out: MirrorResult[] = [];
      for (const repo of repos) {
        try {
          const result = await deps.refresh(repo, config);
          await record(result);
          out.push(result);
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
    const last = config.state[keyOf(repo)]?.at;
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
      await tick();
    },
    stop(): void {
      stopped = true;
      if (handle !== null) clearTimer(handle);
      handle = null;
    },
    /** Manual: every selected repo now, due or not. */
    runNow: (): Promise<MirrorResult[]> => exclusive(() => true),
  };
}
