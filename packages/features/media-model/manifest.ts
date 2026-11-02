import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS, MODEL_MCP_TOOL_IDS, SF3D_MCP_TOOL_IDS } from '@midnite/studio-shared';

/**
 * Media ▸ Models as a feature (Phase 113 Theme S): a tab, not a view — the app hands `mediaModelTab` to
 * media-core's `MediaShell`. One of the packages split from the `media` folder (`FEATURE_PACKAGE_SPLITS`),
 * composed by Gamer and by Studio: the 3D editor, the library, sculpt/paint/rig, SF3D import and the
 * iterative (agent) harness's UI. What needs agents, voice or Studio's dialogs comes through the host port.
 *
 * Media ▸ Animations (Phase 125) lives here too, as a second tab (`mediaAnimationTab`): a global library of animation
 * clips under `<userData>/animation-library`, not a repo's `.midnite/media`.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const mediaModelManifest = defineFeatureManifest({
  feature: 'media',
  owner: 'gamer',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.mediaModelProviders,
    CHANNELS.mediaModelGenerate,
    CHANNELS.mediaModelCancel,
    CHANNELS.mediaModelExport,
    CHANNELS.mediaModelSaveEdit,
    CHANNELS.mediaModelLibrary,
    CHANNELS.mediaModelMesh,
    CHANNELS.mediaModelSf3d,
    // Media ▸ Animations (Phase 125): the global clip library, one `op` channel.
    CHANNELS.mediaAnimation,
  ],
  events: [EVENT_CHANNELS.mediaModelProgress, EVENT_CHANNELS.mediaModelChanged, EVENT_CHANNELS.mediaModelOpen, EVENT_CHANNELS.mediaModelSf3dProgress, EVENT_CHANNELS.mediaAnimationChanged, EVENT_CHANNELS.mediaAnimationProgress],
  // The `model_*` tools (the iterative design loop's and SF3D's), owned by Gamer; handlers stay in the MCP server.
  mcpTools: [...MODEL_MCP_TOOL_IDS, ...SF3D_MCP_TOOL_IDS],
});

export type MediaModelManifest = typeof mediaModelManifest;
