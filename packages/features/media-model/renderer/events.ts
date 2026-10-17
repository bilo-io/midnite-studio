/**
 * The pieces of Models an app reads *outside* its Media view (Phase 113 Theme S): the `model_open` request
 * store the app's listener posts to, and the engine preference the primary-agent follower writes. Their own
 * entry (`@midnite/studio-feature-media-model/events`) so an app root — which loads eagerly — imports two
 * small modules, not the whole tab with its editor, explorer and panels.
 */
export { useModelOpenRequest } from './use-model-agent-events';
export { useModelPrefs, useModelProviders, type ModelTier } from './use-model';
