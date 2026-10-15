import { z } from 'zod';

import { catalogLockstepViolations } from './lockstep';

/**
 * `catalog.json` in bilo-io/midnite-apps — the suite's *distribution* data and
 * nothing else: which version of each app is published, where its bundle is,
 * how big it is, its checksum, and the oldest runtime it runs on. Names,
 * visions and glyphs stay in `catalog.ts`; the launcher joins the two by `id`.
 *
 * The launcher validates whatever it fetches against this schema and falls back
 * to the built-in catalog + `midnite-studio/version.json` when the file is
 * missing, malformed or unreachable (`main/feed.ts`).
 */

const Semver = z.string().regex(/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/);

export const CatalogAppSchema = z.object({
  /** Joined to `catalog.ts` by id; open-ended so a newer catalog can list an app this launcher has no tile for. */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: Semver,
  /** The `.zip` of the app bundle. https only — it is what the launcher downloads. */
  bundleUrl: z.string().url().startsWith('https://'),
  /** Bytes of the zip. */
  size: z.number().int().positive(),
  /** Lowercase hex SHA-256 of the zip. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** The oldest runtime that can run this bundle. */
  minimumRuntimeVersion: Semver,
  releasedAt: z.string().optional(),
  notesUrl: z.string().url().optional(),
});

export const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  /** The runtime (launcher + shared Electron) version. Bundles are lockstep with it. */
  runtimeVersion: Semver,
  apps: z.array(CatalogAppSchema),
});

export type CatalogApp = z.infer<typeof CatalogAppSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

/**
 * `null` for anything that is not a well-formed catalog — including one whose app versions
 * disagree with its own `runtimeVersion` (lockstep, `lockstep.ts`): the launcher then falls back
 * to `version.json` rather than offering a bundle it would refuse to install.
 */
export function parseCatalog(json: unknown): Catalog | null {
  const parsed = CatalogSchema.safeParse(json);
  if (!parsed.success) return null;
  return catalogLockstepViolations(parsed.data).length === 0 ? parsed.data : null;
}
