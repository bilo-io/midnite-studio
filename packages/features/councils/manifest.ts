import { CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The councils feature — one of Agents' three first features (Phase 113
 * Theme N), copying the monitor's template (`../monitor/manifest.ts`).
 *
 * A council is a set of agents that each answer one question and a synthesizer
 * that reconciles them. The CRUD, the run lifecycle and the runner moved here
 * from `packages/desktop`; the Councils view, its panel history and the
 * create/config panes moved from `packages/app`. Councils are global — a
 * council is not scoped to a repository.
 *
 * Councils run agents, and so it reaches the agent roster, the pty broker and
 * the Ollama daemon **only through `CouncilsMainServices`** — it never imports
 * the models feature (a feature never imports another feature).
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const councilsManifest = defineFeatureManifest({
  feature: 'councils',
  owner: 'agents',
  views: [
    {
      id: 'councils',
      // Global, like Settings — a council renders whether or not a repo is open.
      global: true,
      rail: {
        group: 'agent',
        label: 'Councils',
        description: 'Agent councils that debate a question',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.councilList,
    CHANNELS.councilGet,
    CHANNELS.councilCreate,
    CHANNELS.councilUpdateMembers,
    CHANNELS.councilRemove,
    CHANNELS.councilRunStart,
    CHANNELS.councilRunGet,
    CHANNELS.councilRunListForCouncil,
    CHANNELS.councilRunSkipMember,
    CHANNELS.councilRunRetryMember,
  ],
  // A member's live output rides the existing `pty:*` channels; there is no council event channel.
  events: [],
  mcpTools: [],
});

export type CouncilsManifest = typeof councilsManifest;
