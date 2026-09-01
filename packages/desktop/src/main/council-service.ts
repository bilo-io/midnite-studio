import {
  createStarterMembers,
  type Council,
  type CouncilMember,
  type CouncilMemberProvider,
  type CouncilRun,
} from '@midnite/studio-shared';

import { nullCouncilsRunsStore, type CouncilsRunsStore } from './councils-runs-store';
import { nullCouncilsStore, type CouncilsStore } from './councils-store';

/**
 * Councils and their run history, between the IPC handlers, `council-runner.ts`
 * and the two stores — mirrors `terminal-service.ts`'s "in-memory array, write
 * on mutation" shape.
 *
 * `runs` is the one in-memory source of truth for a run's live state,
 * `ptyId`/`synthesisPtyId` included. What reaches disk (`persistRuns`) is a
 * stripped copy — those two fields are runtime-only, the same rule
 * `TerminalSessionSchema` already applies to a session's `ptyId`.
 */
let councilsStore: CouncilsStore = nullCouncilsStore;
let runsStore: CouncilsRunsStore = nullCouncilsRunsStore;

let councils: Council[] = [];
let councilsLoaded = false;
let runs: CouncilRun[] = [];
let runsLoaded = false;

export function configureCouncils(store: CouncilsStore, runStore: CouncilsRunsStore): void {
  councilsStore = store;
  runsStore = runStore;
}

async function ensureCouncilsLoaded(): Promise<void> {
  if (councilsLoaded) return;
  councils = await councilsStore.load();
  councilsLoaded = true;
}

async function ensureRunsLoaded(): Promise<void> {
  if (runsLoaded) return;
  runs = await runsStore.load();
  runsLoaded = true;
}

// --- councils ----------------------------------------------------------------

export async function listCouncils(): Promise<Council[]> {
  await ensureCouncilsLoaded();
  return councils;
}

export async function getCouncil(id: string): Promise<Council | null> {
  await ensureCouncilsLoaded();
  return councils.find((c) => c.id === id) ?? null;
}

export async function createCouncil(name: string, description?: string): Promise<Council> {
  await ensureCouncilsLoaded();
  const now = Date.now();
  const council: Council = {
    id: crypto.randomUUID(),
    name,
    members: createStarterMembers(),
    synthProvider: 'agy',
    createdAt: now,
    updatedAt: now,
    ...(description === undefined ? {} : { description }),
  };
  councils = [...councils, council];
  void councilsStore.save(councils);
  return council;
}

export async function updateCouncilMembers(
  id: string,
  members: CouncilMember[],
  synthProvider: CouncilMemberProvider,
): Promise<Council | null> {
  await ensureCouncilsLoaded();
  const index = councils.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const updated: Council = { ...councils[index]!, members, synthProvider, updatedAt: Date.now() };
  councils = [...councils.slice(0, index), updated, ...councils.slice(index + 1)];
  void councilsStore.save(councils);
  return updated;
}

export async function removeCouncil(id: string): Promise<boolean> {
  await ensureCouncilsLoaded();
  const before = councils.length;
  councils = councils.filter((c) => c.id !== id);
  if (councils.length === before) return false;
  void councilsStore.save(councils);
  return true;
}

// --- runs --------------------------------------------------------------------

export async function listRunsForCouncil(councilId: string): Promise<CouncilRun[]> {
  await ensureRunsLoaded();
  return runs.filter((r) => r.councilId === councilId);
}

export async function getRun(runId: string): Promise<CouncilRun | null> {
  await ensureRunsLoaded();
  return runs.find((r) => r.id === runId) ?? null;
}

/** Insert or update one run in memory, then persist a stripped copy of all of them. */
export async function saveRun(run: CouncilRun): Promise<void> {
  await ensureRunsLoaded();
  const index = runs.findIndex((r) => r.id === run.id);
  if (index === -1) runs = [...runs, run];
  else runs = [...runs.slice(0, index), run, ...runs.slice(index + 1)];
  void runsStore.save(runs.map(stripTransientPtyIds));
}

/** `ptyId`/`synthesisPtyId` name a live process — never meaningful after a restart. */
function stripTransientPtyIds(run: CouncilRun): CouncilRun {
  return {
    ...run,
    members: run.members.map(({ ptyId: _ptyId, ...member }) => member),
    synthesisPtyId: undefined,
  };
}

/** Reset module state. Tests only. */
export function resetCouncilsForTest(): void {
  councilsStore = nullCouncilsStore;
  runsStore = nullCouncilsRunsStore;
  councils = [];
  councilsLoaded = false;
  runs = [];
  runsLoaded = false;
}
