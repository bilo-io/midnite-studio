import { MAX_AGENT_PROFILES, composeProfilePrompt, type AgentProfile } from '@midnite/studio-shared';

import { nullAgentProfilesStore, type AgentProfilesStore } from './agent-profiles-store';

/**
 * Custom agents (Phase 154) — the in-memory list over the store.
 *
 * Every operation, reads included, runs through one promise chain, so two saves
 * never interleave and a read never sees a half-applied one. Two windows can edit
 * the same agent (page detach, the Agents app), so a save carries the `updatedAt`
 * it read and a stale one answers `conflict` instead of overwriting.
 */
let store: AgentProfilesStore = nullAgentProfilesStore;
let cache: AgentProfile[] | null = null;
let chain: Promise<unknown> = Promise.resolve();

export const AGENT_PROFILE_LIMIT_MESSAGE = `You have ${MAX_AGENT_PROFILES} agents, the most this version keeps. Delete one to add another.`;

export type SaveAgentProfileResult =
  | { status: 'saved'; profile: AgentProfile }
  | { status: 'conflict'; current: AgentProfile };

export function configureAgentProfiles(next: AgentProfilesStore): void {
  store = next;
  cache = null;
}

export function resetAgentProfilesState(): void {
  store = nullAgentProfilesStore;
  cache = null;
  chain = Promise.resolve();
}

/** Runs `task` after everything queued before it; a failed task does not poison the chain. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function profiles(): Promise<AgentProfile[]> {
  cache ??= await store.load();
  return cache;
}

export function listAgentProfiles(): Promise<AgentProfile[]> {
  return enqueue(async () => [...(await profiles())]);
}

export function getAgentProfile(id: string): Promise<AgentProfile | null> {
  return enqueue(async () => (await profiles()).find((p) => p.id === id) ?? null);
}

/** Where the agent's prompt file lives (it exists only when the composed prompt is not empty). */
export function agentProfilePromptPath(id: string): string {
  return store.promptPath(id);
}

/**
 * Upserts `profile`. `expectedUpdatedAt` is `null` for a new agent, else the `updatedAt` the caller read; an
 * existing entry whose `updatedAt` differs answers `conflict` and nothing is written. A profile whose id is
 * unknown but whose `expectedUpdatedAt` is set (deleted in another window) is re-created.
 */
export function saveAgentProfile(profile: AgentProfile, expectedUpdatedAt: number | null): Promise<SaveAgentProfileResult> {
  return enqueue(async () => {
    const current = await profiles();
    const existing = current.find((p) => p.id === profile.id);
    if (existing && existing.updatedAt !== expectedUpdatedAt) return { status: 'conflict', current: existing };
    if (!existing && current.length >= MAX_AGENT_PROFILES) throw new Error(AGENT_PROFILE_LIMIT_MESSAGE);

    const saved: AgentProfile = existing
      ? { ...profile, createdAt: existing.createdAt, updatedAt: Math.max(Date.now(), existing.updatedAt + 1) }
      : { ...profile, updatedAt: Math.max(Date.now(), profile.updatedAt) };
    const next = existing ? current.map((p) => (p.id === saved.id ? saved : p)) : [...current, saved];
    await store.save(next);
    cache = next;
    await store.writePrompt(saved.id, composeProfilePrompt(saved));
    return { status: 'saved', profile: saved };
  });
}

/** Removes the agent and its prompt file. An unknown id is a no-op. */
export function deleteAgentProfile(id: string): Promise<void> {
  return enqueue(async () => {
    const current = await profiles();
    if (current.some((p) => p.id === id)) {
      const next = current.filter((p) => p.id !== id);
      await store.save(next);
      cache = next;
    }
    await store.removePrompt(id);
  });
}
