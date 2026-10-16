import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The workflows feature — Agents' graphs (Phase 113 Theme N), copying the
 * monitor's template (`../monitor/manifest.ts`).
 *
 * A workflow is a node graph (HTTP calls, transforms, agent and script steps,
 * gates, triggers, AI prompts, forge writes) that runs in main and is edited on
 * a canvas in the renderer. Global, not per-repo: nothing about a graph
 * requires a repository, though a node can name one. The engine, the executors,
 * the stores, the trigger scheduler and the demo API moved here from
 * `packages/desktop`; the Graphs view, canvas, inspector, run history and
 * template gallery moved from `packages/app`.
 *
 * **What a node reaches outside the engine goes through `WorkflowsPorts`** —
 * the pty and terminal sessions an agent node runs in, the forge a gate and a
 * trigger watch, the repository registry a `git-status` node reads, the Ollama
 * daemon and key. Studio supplies all of them; Agents supplies the roster and a
 * piped shell and leaves the rest absent, so a node that needs one fails with
 * its own message instead of the app failing.
 *
 * **Settings ▸ Workflows stays Studio's** (the run-history cap and default node
 * timeout are `ui-store` settings pushed over `workflowSetDefaults`), so
 * `settingsPages` is empty until a later slice gives the feature its own port.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const workflowsManifest = defineFeatureManifest({
  feature: 'workflows',
  owner: 'agents',
  views: [
    {
      id: 'workflows',
      // Global: a graph is not scoped to a repository.
      global: true,
      rail: {
        group: 'agent',
        label: 'Graphs',
        description: 'Build and run node-based automations',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.workflowList,
    CHANNELS.workflowSave,
    CHANNELS.workflowDelete,
    CHANNELS.workflowRun,
    CHANNELS.workflowCancel,
    CHANNELS.workflowResume,
    CHANNELS.workflowGateDecide,
    CHANNELS.workflowRunsList,
    CHANNELS.workflowRunsGet,
    CHANNELS.workflowTemplatesList,
    CHANNELS.workflowTemplateSave,
    CHANNELS.workflowTemplateDelete,
    CHANNELS.workflowSetDefaults,
    CHANNELS.demoApiStart,
    CHANNELS.demoApiStop,
    CHANNELS.demoApiStatus,
  ],
  // `workflowNodeSessionStarted` is Studio's (it adopts a pushed terminal session); Agents has no terminal.
  events: [EVENT_CHANNELS.workflowRunChanged],
  mcpTools: [],
});

export type WorkflowsManifest = typeof workflowsManifest;
