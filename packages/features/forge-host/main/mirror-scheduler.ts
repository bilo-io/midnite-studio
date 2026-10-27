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

  const keyOf = (r: MirrorConfigRepo) => `${r.host}/${r.owner}/${r.repo}`;

  async function run(select: (repo: MirrorConfigRepo, config: MirrorConfig) => boolean): Promise<MirrorResult[]> {
    const config = await deps.load();
    const byHost = new Map<string, MirrorConfigRepo[]>();
    for (const repo of config.repos) if (select(repo, config)) byHost.set(repo.host, [...(byHost.get(repo.host) ?? []), repo]);
    const lanes = [...byHost.values()].map(async (repos) => {
      const out: MirrorResult[] = [];
      for (const repo of repos) {
        const result = await deps.refresh(repo, config);
        await deps.record(result);
        out.push(result);
      }
      return out;
    });
    return (await Promise.all(lanes)).flat();
  }

  /** One run at a time: a second request joins the one in flight. */
  function exclusive(select: Parameters<typeof run>[0]): Promise<MirrorResult[]> {
    running ??= run(select).finally(() => {
      running = null;
    });
    return running;
  }

  const isDue = (repo: MirrorConfigRepo, config: MirrorConfig): boolean => {
    if (config.interval === 'manual') return false;
    const last = config.state[keyOf(repo)]?.at;
    return !last || now() - Date.parse(last) >= INTERVAL_MS[config.interval];
  };

  async function tick(): Promise<void> {
    if (stopped) return;
    await exclusive(isDue).catch(() => []);
    await arm();
  }

  async function arm(): Promise<void> {
    if (stopped) return;
    const config = await deps.load();
    if (config.interval === 'manual') return;
    handle = setTimer(() => void tick(), INTERVAL_MS[config.interval]);
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
