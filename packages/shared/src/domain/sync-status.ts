import { z } from 'zod';

import { EgressSettingsSchema } from '../egress';
import { LoopScheduleSchema } from '../loops';
import { AgentOllamaBindingSchema } from '../ollama-launch';
import { WebAppIdSchema } from './web-apps';

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
  webAppDiscardIdle: z.record(WebAppIdSchema, z.boolean()).optional(),
  browserDiscardMs: z.number().int().optional(),
  /**
   * Phase 90 Theme C: whether switching the active GitHub account also runs
   * `gh auth switch`. Optional so an older renderer (or a test payload that
   * never set it) still validates — `settings-mirror.ts`'s own default
   * (`true`) is what a handler reads before the first sync ever lands.
   */
  forgeSyncGhAuthSwitch: z.boolean().optional(),
  /**
   * Phase 96 Theme H: the renderer-owned per-agent Ollama binding
   * (`ui-store.ts`'s `agentBackends`), mirrored so the two launch paths that
   * run entirely in main — `council-runner.ts` and workflow
   * `executors/agent.ts` — can resolve the same backend a terminal session
   * would, with no renderer round trip. Optional for the same reason every
   * other field here is: an older renderer, or a test payload, that never
   * set it still validates.
   */
  agentBackends: z.record(z.string(), AgentOllamaBindingSchema).optional(),
  /**
   * Phase 121 Theme E: new terminal and council sessions start under a Seatbelt profile. Read in main
   * at spawn, so it is mirrored rather than asked for. Optional like every field here; main defaults
   * to `false` (confinement is off until switched on).
   */
  confineNewSessions: z.boolean().optional(),
  /**
   * Phase 115 Theme F: Settings ▸ Privacy ▸ "Read Claude and Codex history". Main reads `~/.claude` and
   * `~/.codex` for usage, conversation ids and plugin skills; `false` stops every one of those reads.
   * Optional like every field here; main defaults to `true`.
   */
  readAgentHistory: z.boolean().optional(),
  /**
   * Phase 115 Theme A: the position of every egress switch plus the master, composed in the renderer from the
   * generated switches and the two bespoke ones (`locateByIpEnabled`, the reputation feeds). `guardedFetch`
   * reads it. Optional; main treats absence as every switch at its default.
   */
  egress: EgressSettingsSchema.optional(),
  /**
   * Phase 115 Theme B: Settings ▸ Privacy ▸ "Keep local history", in days; `null` keeps forever. Main
   * prunes scrollback and archived transcripts on start and daily. Main defaults to `null`.
   */
  historyRetentionDays: z.number().int().positive().nullable().optional(),
  /**
   * Phase 122 Theme A: the Guard loop's schedule (`ui-store`'s `loopSchedules.guard`). The recurring sweep runs in
   * main, with or without an agent, so main needs the schedule rather than asking the renderer on each tick.
   * Missing means no schedule: the sweep stays off.
   */
  guardSchedule: LoopScheduleSchema.optional(),
});
export type SettingsSyncPayload = z.infer<typeof SettingsSyncPayloadSchema>;
