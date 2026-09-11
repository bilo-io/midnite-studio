import { z } from 'zod';

/**
 * Phase 84 Themes B (auto-fetch) and C (the forge poller) — both timers now
 * live in main, and both need a wire shape for "how is this repo's background
 * sync doing right now" that Theme I's liveness dot can render without caring
 * which timer is talking.
 */

/** Which forge listing a window is interested in — see `forge-poller.ts`. */
export const ForgeSubscriptionKindSchema = z.enum(['runs', 'pulls', 'issues', 'projects']);
export type ForgeSubscriptionKind = z.infer<typeof ForgeSubscriptionKindSchema>;

/**
 * A poll changed something for `{repoId, kind}` — never the payload itself.
 * The renderer already owns the query cache; this is a ping to invalidate it,
 * exactly like `loopRunsChanged`/`workflowRunChanged` before it.
 */
export const ForgeChangedEventSchema = z.object({
  repoId: z.string(),
  kind: ForgeSubscriptionKindSchema,
  at: z.number().int(),
});
export type ForgeChangedEvent = z.infer<typeof ForgeChangedEventSchema>;

/**
 * The one background sync source a `syncStatus` push is about.
 *
 * `fetch` is Theme B's scheduler, `forge` is Theme C's poller — kept as one
 * event shape with a `source` tag rather than two, since Theme I's dot and its
 * popover want to render both the same way: a repo-scoped backoff with a
 * reason.
 */
export const SyncSourceSchema = z.enum(['fetch', 'forge']);
export type SyncSource = z.infer<typeof SyncSourceSchema>;

/**
 * Pushed by main whenever a repo's fetch scheduler or forge poller changes
 * state — a failure, a recovery, or a backoff window opening or clearing.
 * Sent through `broadcastToWindowsOnRepo`, so only a window actually showing
 * `repoId` pays for it.
 */
export const SyncStatusEventSchema = z.object({
  repoId: z.string(),
  source: SyncSourceSchema,
  /** `Date.now()` a retry may resume, or `null` when not currently backed off. */
  backoffUntil: z.number().int().nullable(),
  /** A human-readable reason, or `null` once the source is healthy again. */
  error: z.string().nullable(),
});
export type SyncStatusEvent = z.infer<typeof SyncStatusEventSchema>;

/**
 * The renderer-owned auto-fetch settings, mirrored into main (Theme B.4).
 * `ui-store` stays the single owner and source of truth; main keeps a copy
 * just large enough to run the scheduler, refreshed on every change and once
 * on boot — see `settings-mirror.ts`.
 */
export const SettingsSyncPayloadSchema = z.object({
  autoFetchEnabled: z.boolean(),
  autoFetchIntervalMs: z.number().int(),
});
export type SettingsSyncPayload = z.infer<typeof SettingsSyncPayloadSchema>;
