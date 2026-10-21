import { defineFeatureManifest } from '@midnite/studio-shared';

/**
 * Tasks as a feature (Phase 113 Theme O) — the forge's issues and ProjectV2
 * boards, as a table, a board and a dependency graph, with the issue detail,
 * the issue and project dialogs and Plan with AI. Placed with Coder
 * (`FEATURE_PLACEMENT.tasks`); Studio composes every feature.
 *
 * Renderer-only: the data is the forge's (`forge.issue*`, `forgeProject.*`),
 * whose channels the forge feature already declares and registers, so this
 * manifest names none. What a card can *do* beyond the forge — open a terminal,
 * launch an agent, run Auto-mate — is the composing app's, through the
 * `TasksHost` port: Studio launches on its own terminals; an app with none
 * leaves those controls out.
 *
 * `settingsPages` is empty: Settings ▸ Projects lives in the frame's Settings
 * view over the app's ui store, like the forge's own pages.
 *
 * Imports `@midnite/studio-shared` and nothing else — the same rule every
 * feature manifest keeps.
 */
export const tasksManifest = defineFeatureManifest({
  feature: 'tasks',
  owner: 'coder',
  views: [
    {
      id: 'tasks',
      global: false,
      rail: { group: 'git', label: 'Tasks', description: 'Issues and projects from the forge, as a table or board' },
    },
  ],
  settingsPages: [],
  ipc: [],
  events: [],
  mcpTools: [],
});

export type TasksManifest = typeof tasksManifest;
