import type { AgentProfile, CompanionVocabulary } from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';

/**
 * The saved custom agents (Phase 154 Theme H), as the companion knows them — read over the bridge's
 * `agentProfile.list`, never by importing the agent-profiles feature. Refreshed before each line of input,
 * since a save on the Agents page changes the names "use Reviewer" can match.
 */
let cache: AgentProfile[] = [];
/** Whether the list has been read at least once. Until then an empty cache means "unknown", not "none". */
let loaded = false;

/** Re-read the list. Never throws: no bridge, or a failed read, keeps the last good answer. */
export async function refreshCustomAgents(): Promise<AgentProfile[]> {
  try {
    const answer = await bridge()?.agentProfile?.list();
    if (answer?.ok) {
      cache = answer.value.profiles;
      loaded = true;
    }
  } catch {
    // Keep the last list: a companion that forgets its agents on one bad read is worse than a stale name.
  }
  return cache;
}

/**
 * The list, read first if it never has been. `loaded` is false when that read failed too, so a caller can
 * tell "this agent was deleted" (loaded, absent) from "I could not look" and never clear a valid choice
 * on the second.
 */
export async function ensureCustomAgents(): Promise<{ profiles: readonly AgentProfile[]; loaded: boolean }> {
  if (!loaded) await refreshCustomAgents();
  return { profiles: cache, loaded };
}

export function customAgents(): readonly AgentProfile[] {
  return cache;
}

export function customAgent(profileId: string): AgentProfile | null {
  return cache.find((profile) => profile.id === profileId) ?? null;
}

/** The vocabulary with the custom agents' ids and names added — what the grammar and the router may name. */
export function withCustomAgents(vocabulary: CompanionVocabulary): CompanionVocabulary {
  return { ...vocabulary, customAgents: cache.map((profile) => ({ id: profile.id, name: profile.name })) };
}

/** Test seam. */
export function setCustomAgentsForTests(profiles: AgentProfile[], isLoaded = true): void {
  cache = profiles;
  loaded = isLoaded;
}

/** What the companion says, ahead of its answer, when its custom agent was deleted under it. */
export function deletedAgentNotice(baseLabel: string): string {
  return `Your custom agent was deleted, so I'm using ${baseLabel} again.`;
}

/** What the companion says when it could not read the custom-agent list, so it used the built-in agent once. */
export function unreadAgentNotice(baseLabel: string): string {
  return `I could not read your custom agents just now, so I used ${baseLabel} this time.`;
}

/** The id to send with an ask, or nothing: a value that is not a profile id would fail the ask's schema. */
export function askProfileField(profileId: string | null): { agentProfileId: string } | Record<string, never> {
  return profileId !== null && /^profile-[A-Za-z0-9_-]+$/.test(profileId) ? { agentProfileId: profileId } : {};
}
