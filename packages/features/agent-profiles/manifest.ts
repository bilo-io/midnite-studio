import { CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The custom-agents feature (Phase 154) — a user builds an agent on top of a
 * roster CLI: a system prompt, model, MCP tool allowlist, skills and limits, plus
 * a five-stage blueprint of design notes. Profiles are global (one user-level
 * `agent-profiles.json`), not per-repo.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer
 * reads this file too.
 */
export const agentProfilesManifest = defineFeatureManifest({
  feature: 'agent-profiles',
  owner: 'agents',
  views: [
    {
      id: 'agents',
      // Global, like Settings — the page renders whether or not a repo is open.
      global: true,
      rail: {
        group: 'agent',
        label: 'Agents',
        description: 'Build and manage your own agents',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.agentProfileList,
    CHANNELS.agentProfileSave,
    CHANNELS.agentProfileDelete,
    CHANNELS.agentProfileExport,
    CHANNELS.agentProfileImport,
    CHANNELS.agentProfilePrepareLaunch,
  ],
  events: [],
  mcpTools: [],
});

export type AgentProfilesManifest = typeof agentProfilesManifest;
