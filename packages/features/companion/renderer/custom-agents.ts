import type { AgentProfile, CompanionVocabulary } from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';

/**
 * The saved custom agents (Phase 154 Theme H), as the companion knows them — read over the bridge's
 * `agentProfile.list`, never by importing the agent-profiles feature. Refreshed before each line of input,
 * since a save on the Agents page changes the names "use Reviewer" can match.
 */
let cache: AgentProfile[] = [];

/** Re-read the list. Never throws: no bridge, or a failed read, keeps the last good answer. */
export async function refreshCustomAgents(): Promise<AgentProfile[]> {
  try {
    const answer = await bridge()?.agentProfile?.list();
    if (answer?.ok) cache = answer.value.profiles;
  } catch {
    // Keep the last list: a companion that forgets its agents on one bad read is worse than a stale name.
  }
  return cache;
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
export function setCustomAgentsForTests(profiles: AgentProfile[]): void {
  cache = profiles;
}

/** What the companion says, ahead of its answer, when its custom agent was deleted under it. */
export function deletedAgentNotice(baseLabel: string): string {
  return `Your custom agent was deleted, so I'm using ${baseLabel} again.`;
}
