import { z } from 'zod';

import { EcosystemSchema, ReclaimCostSchema } from './optimizer';

/**
 * The wire contract for Phase 73's system-wide cache registry — deliberately
 * a SEPARATE family from `ScanItemSchema`/`ScanResultSchema` (Phase 59/72),
 * never merged. See the phase doc's Decision 3: a `ScanItem` implicitly
 * promises its `path` sits under `knownRoots()`, and a call site that could
 * be handed a system-wide path instead would undermine exactly the stricter
 * confinement (`confineAllowlist`, in `fs-scope-write.ts`) this phase exists
 * to add. Two schemas that cannot be confused by the type system are worth
 * duplicating a few field names.
 */

/** An allowlist this small never needs Phase 72's 2,000-item cap — two orders
 *  of magnitude tighter is itself a signal if it is ever hit. No `truncated`
 *  field: the registry has thirteen entries and can never produce 200 items. */
export const SYSTEM_SCAN_ITEMS_CAP = 200;

export const SystemCacheItemSchema = z.object({
  /** Display only. Never echoed back to main — a clean names entryIds, not paths. */
  path: z.string(),
  bytes: z.number().nonnegative(),
  /** True when the walk hit its per-entry budget: `bytes` is a floor, not a total. */
  approximate: z.boolean(),
  /** Matches `SystemCacheEntry.id` (desktop-only) — no `repoId` field exists here. */
  entryId: z.string(),
  ecosystem: EcosystemSchema,
  reclaim: ReclaimCostSchema,
  /**
   * `label`/`producer` ride on every item here, deliberately, unlike Phase
   * 72's `detectors` map on `ScanResultSchema`: that hoist exists because
   * repeating two prose strings across up to 2,000 items puts ~100 KB of
   * duplicated text on the wire, and this result is capped at 200 (in
   * practice, at most the registry's thirteen entries) — a map keyed by
   * `entryId` would be pure indirection for a payload measured in bytes.
   */
  label: z.string(),
  producer: z.string(),
});
export type SystemCacheItem = z.infer<typeof SystemCacheItemSchema>;

export const SystemScanResultSchema = z.object({
  totalBytes: z.number().nonnegative(),
  /** True if any item is approximate — the tab's own banner keys on this. */
  approximate: z.boolean(),
  byEcosystem: z.record(EcosystemSchema, z.number().nonnegative()),
  items: z.array(SystemCacheItemSchema).max(SYSTEM_SCAN_ITEMS_CAP),
});
export type SystemScanResult = z.infer<typeof SystemScanResultSchema>;

/** What the renderer may know about the catalogue before any scan — no paths.
 *  `packages/app` may not import `packages/desktop`, so this is how the
 *  renderer ever learns what the registry covers (the consent dialog's and
 *  the settings page's enumerations both render from this, never from
 *  hardcoded prose — see Decision 9). */
export const SystemCacheCatalogueEntrySchema = z.object({
  entryId: z.string(),
  label: z.string(),
  producer: z.string(),
  ecosystem: EcosystemSchema,
  reclaim: ReclaimCostSchema,
});
export type SystemCacheCatalogueEntry = z.infer<typeof SystemCacheCatalogueEntrySchema>;
