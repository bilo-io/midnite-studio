import { z } from 'zod';

/**
 * What the launcher has installed — one record per app bundle (Phase 113 Theme E).
 *
 * The launcher writes it (`main/bundles/state.ts`) after a bundle *and* its Dock
 * stub have both swapped into place, and removes an app's record only after both
 * are gone, so the record never claims something that is not on disk. It is the
 * source the tile states (Installed / Update / Not installed) and the
 * `midnite://` router's "is this app's bundle installed?" step read — not a scan
 * of `/Applications`, which a user can rename or move things around in.
 *
 * Lives in `common/` so the renderer can type a status payload built from it;
 * reading and writing the file is main's job.
 */

const Semver = z.string().regex(/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/);

export const InstalledAppSchema = z.object({
  /** The catalog id (`cleaner`, `monitor`, …). */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  /** The bundle version that was installed — compared against `catalog.json` for "Update". */
  version: Semver,
  /** SHA-256 of the zip it came from, as the catalog published it. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** The extracted bundle (`<installRoot>/<id>`). */
  bundlePath: z.string().min(1),
  /** The Dock stub (`<stubRoot>/Midnite <Name>.app`). */
  stubPath: z.string().min(1),
  /**
   * The runtime version whose Electron framework the stub was cloned from. A clone does not
   * follow its source, so when the runtime updates, every stub whose `runtimeVersion` differs
   * is re-cloned (`restubStale`).
   */
  runtimeVersion: Semver,
  /** ISO timestamp of the install or last update. */
  installedAt: z.string(),
});

export const InstalledStateSchema = z.object({
  schemaVersion: z.literal(1),
  apps: z.array(InstalledAppSchema),
});

export type InstalledApp = z.infer<typeof InstalledAppSchema>;
export type InstalledState = z.infer<typeof InstalledStateSchema>;

export const EMPTY_INSTALLED_STATE: InstalledState = { schemaVersion: 1, apps: [] };
