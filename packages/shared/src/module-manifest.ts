import type { ModuleId } from './modules';
import type { FeatureView } from './domain/feature-manifest';

/**
 * A module package's manifest — Phase 124 Theme B (`packages/modules/<id>/manifest.ts`).
 *
 * A module is one composable slice an app mounts: the features it composes plus the views it
 * contributes. Pure data like {@link FeatureManifest}, read by both halves and by the launcher.
 * The glyph is a `react-icons` export name (the composer resolves the component), never an import,
 * so the manifest stays importable from the main process.
 */
export type ModuleManifest = {
  /** Its id in `MODULE_IDS`. */
  module: ModuleId;
  label: string;
  /** A `react-icons` export name, e.g. `LuBot`. */
  glyph: string;
  /** Accent colour (CSS colour) shown on the module's nav group label only. */
  accent: string;
  /** Feature package folders it composes (`FEATURE_PLACEMENT` keys). */
  features: readonly string[];
  /** The views it contributes, in nav order. */
  views: readonly FeatureView[];
};

/** Identity helper: pins a manifest literal to {@link ModuleManifest} without widening it. */
export function defineModuleManifest<const M extends ModuleManifest>(manifest: M): M {
  return manifest;
}
