import { homedir } from 'node:os';

import {
  createGuardScheduler,
  createGuardSweepsStore,
  createGuardResolvers,
  defaultGuardChecks,
  runGuardSweep,
  type GuardScheduler,
  type GuardSweepsStore,
} from '@midnite/studio-runtime';
import { DEFAULT_LOOP_SCHEDULE, type LoopRunFindingsSummary, type LoopSchedule } from '@midnite/studio-shared';

import { getFindingsLedger } from './ipc/vanguard-handlers';
import { defaultLogger } from './log';
import { listRepos } from './repo-registry';
import { agentHistoryReadsEnabled, currentSettings, onSettingsChange } from './settings-mirror';

/**
 * Studio's one scheduled Guard sweep (Phase 122 Themes A to C): the runtime's scheduler over the loop's schedule
 * (mirrored from the renderer through `settings-mirror.ts`), running the default checks with real resolvers into
 * the findings ledger. It runs with or without an agent installed and never touches a pty.
 *
 * Feeds go out over the platform `fetch` for now: Phase 115 A's `guardedFetch` and Theme H's per-feed Privacy
 * switches are not in the tree, so while the Guard schedule is enabled the OSV and KEV feeds are on (package
 * coordinates and CVE ids only) and the threat feed is skipped until a trusted key is built in.
 */
let scheduler: GuardScheduler | null = null;
let store: GuardSweepsStore | null = null;
let stopWatching: (() => void) | null = null;

/** A sweep is a set of network feeds and a lockfile walk, not an agent pass: cadences faster than hourly run hourly. */
const FASTER_THAN_HOURLY: ReadonlySet<string | undefined> = new Set([undefined, 'continuous', '1m', '2m', '5m', '10m', '15m', '30m']);

const guardSchedule = (): LoopSchedule => {
  const schedule = currentSettings().guardSchedule ?? { ...DEFAULT_LOOP_SCHEDULE, enabled: false };
  return FASTER_THAN_HOURLY.has(schedule.frequency) ? { ...schedule, frequency: 'hourly' } : schedule;
};

export function startGuardSweeps(options: { userData: string }): void {
  stopGuardSweeps();
  const { userData } = options;
  const sweepsStore = createGuardSweepsStore(userData);
  store = sweepsStore;
  const sweeper = createGuardScheduler({
    userData,
    getSchedule: guardSchedule,
    onSweep: async () => {
      const result = await runGuardSweep({
        userData,
        checks: defaultGuardChecks(),
        ledger: getFindingsLedger(),
        sweepsStore,
        context: {
          resolvers: createGuardResolvers({
            userData,
            home: homedir(),
            repos: async () => (await listRepos()).map((repo) => repo.path),
            fetch: (url, init) => fetch(url, init),
            allowConfigRead: agentHistoryReadsEnabled,
          }),
        },
      });
      const skipped = Object.keys(result.record.inputsSkipped);
      defaultLogger.info(`guard sweep: ${result.findings.length} findings, ${result.record.checksRun.length} checks${skipped.length ? `, skipped ${skipped.join(', ')}` : ''}`);
    },
  });
  scheduler = sweeper;
  let armed = JSON.stringify(guardSchedule());
  // The schedule changes in the composer; re-arm only when it did, not on every unrelated setting.
  stopWatching = onSettingsChange(() => {
    const next = JSON.stringify(guardSchedule());
    if (next === armed) return;
    armed = next;
    sweeper.stop();
    void sweeper.start().catch((error: unknown) => defaultLogger.warn(`guard sweep: ${String(error)}`));
  });
  void sweeper.start().catch((error: unknown) => defaultLogger.warn(`guard sweep: ${String(error)}`));
}

export function stopGuardSweeps(): void {
  stopWatching?.();
  stopWatching = null;
  scheduler?.stop();
  scheduler = null;
}

/** The latest sweep's severity counts, for a Guard run's ledger record (`loop-runs.ts`); `undefined` before any sweep. */
export async function latestGuardSweepSummary(): Promise<LoopRunFindingsSummary | undefined> {
  const latest = await store?.latest();
  if (!latest) return undefined;
  const { critical, high, medium, low, info } = latest.counts;
  return { critical, high, medium, low, info, total: critical + high + medium + low + info };
}
