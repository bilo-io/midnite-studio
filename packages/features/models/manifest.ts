import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The models feature — one of Agents' three first features (Phase 113
 * Theme N), copying the monitor's template (`../monitor/manifest.ts`).
 *
 * The Ollama client, the pull queue and the persisted host override moved
 * here from `packages/desktop/src/main/ollama`; the Models view, the pull
 * queue store and the model hooks moved from `packages/app`. The daemon is a
 * property of the machine, so the view is global.
 *
 * `settingsPages` is empty this slice: the `ollama` page lives in the frame's
 * Settings view over `ui-store`, which is where it stays until that view is
 * composed per app.
 *
 * **The Ollama cloud key stays in main.** `ollamaCloudList` reads
 * `ollama.apiKey` through `ModelsMainServices.cloudApiKey`; no channel here
 * answers it.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const modelsManifest = defineFeatureManifest({
  feature: 'models',
  owner: 'agents',
  views: [
    {
      id: 'models',
      // Global (Phase 96 Theme C): an Ollama daemon is the machine's, not a checkout's.
      global: true,
      rail: {
        group: 'agent',
        label: 'Models',
        description: 'Install, discover and run local and cloud models',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.ollamaStatus,
    CHANNELS.ollamaList,
    CHANNELS.ollamaShow,
    CHANNELS.ollamaPs,
    CHANNELS.ollamaPull,
    CHANNELS.ollamaPullCancel,
    CHANNELS.ollamaDelete,
    CHANNELS.ollamaCreate,
    CHANNELS.ollamaUnload,
    CHANNELS.ollamaSettingsGet,
    CHANNELS.ollamaSettingsSet,
    CHANNELS.ollamaSearch,
    CHANNELS.ollamaCloudList,
    CHANNELS.ollamaSignInStatus,
  ],
  events: [EVENT_CHANNELS.ollamaPullProgress],
  mcpTools: [],
});

export type ModelsManifest = typeof modelsManifest;
