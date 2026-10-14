import type { McpToolId } from '../mcp';
import type { PlacedFeature, PlacementLayer } from './placement';
import type { SettingsPageId, ViewId } from './view';

/**
 * A feature package's manifest — Phase 113 Theme C's template
 * (`packages/features/<name>/manifest.ts`).
 *
 * Pure data, because both halves of the app read it: the renderer composer
 * (which views and settings pages to mount, which rail rows to draw) and the
 * main-process composer (which IPC channels the feature's main half installs,
 * which MCP tools it contributes). Components and handlers are not in here —
 * they live in the feature's `renderer/` and `main/` halves, keyed by the ids
 * this lists, and each half's test asserts it covers exactly these ids.
 *
 * Types only (no zod), like `feature-registrations.ts`: nothing parses a
 * manifest off the wire; it is compiled into whichever app composes it.
 */
export type FeatureManifest = {
  /** The placement-map folder this package was extracted from. */
  feature: PlacedFeature;
  /** Who owns it — `FEATURE_PLACEMENT[feature]`'s owner (a test checks they agree). */
  owner: PlacementLayer;
  /** The views it contributes — its `FEATURE_VIEWS` registration, plus how each renders. */
  views: readonly FeatureView[];
  /** Its `FEATURE_SETTINGS_PAGES` registration, in the order it contributes them. */
  settingsPages: readonly SettingsPageId[];
  /** Every `invoke` channel its main half registers. */
  ipc: readonly string[];
  /** Every event channel its main half emits. */
  events: readonly string[];
  /** MCP tools it contributes — a tool whose app is not installed is not listed (Theme D). */
  mcpTools: readonly McpToolId[];
};

export type FeatureView = {
  id: ViewId;
  /** Reachable with no repository selected (`ViewEntry.global`). */
  global: boolean;
  /** Its rail row. Absent for a view with no row of its own. */
  rail?: FeatureRailEntry;
};

/** A rail row as data — the composer adds the glyph, which is a component and so not data. */
export type FeatureRailEntry = {
  group: 'pinned' | 'workspace' | 'git' | 'agent';
  label: string;
  description: string;
};

/** Identity helper: pins a manifest literal to {@link FeatureManifest} without widening it. */
export function defineFeatureManifest<const M extends FeatureManifest>(manifest: M): M {
  return manifest;
}
