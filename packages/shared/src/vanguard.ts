import { z } from 'zod';

/**
 * Vanguard's wire contract beyond the findings ledger (Phase 120 Theme B): the view's tabs, what a
 * sensor reports to the Sensors tab, and the persisted settings. zod only.
 *
 * A sensor id is a plain string, not an enum: each sensor theme (C-F) registers its own with the
 * sensor host, so adding one touches no shared list.
 */

/** The Vanguard view's tabs; the launcher tile's three features land on one each. */
export const VANGUARD_TABS = ['findings', 'sensors', 'network'] as const;
export type VanguardTab = (typeof VANGUARD_TABS)[number];

/** Where a sensor is in its lifecycle. `disabled` = switched off (or Studio awaiting first open). */
export const SensorRunStateSchema = z.enum(['disabled', 'idle', 'running', 'error']);
export type SensorRunState = z.infer<typeof SensorRunStateSchema>;

export const SensorStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** One line on what it watches; static text from the sensor's definition. */
  description: z.string(),
  state: SensorRunStateSchema,
  /** The user's switch (Settings > Vanguard), regardless of whether the host has started it. */
  enabled: z.boolean(),
  /** Epoch ms of the last completed run; null before the first. */
  lastRunAt: z.number().int().nonnegative().nullable(),
  lastDurationMs: z.number().int().nonnegative().nullable(),
  /** Findings recorded by the last run. */
  lastFindings: z.number().int().nonnegative(),
  /** Set when `state` is `error`; a sentence, never a stack. */
  error: z.string().optional(),
});
export type SensorStatus = z.infer<typeof SensorStatusSchema>;

export const VanguardSensorsResponse = z.object({
  sensors: z.array(SensorStatusSchema),
  /** True once the host has started the enabled sensors (false in Studio before the first open). */
  active: z.boolean(),
});
export type VanguardSensorsResponse = z.infer<typeof VanguardSensorsResponse>;

export const VanguardSettingsSchema = z.object({
  version: z.literal(1),
  /** Per-sensor switch by sensor id; a sensor absent here follows `defaultEnabled`. */
  sensors: z.record(z.string(), z.boolean()),
  /** Seconds between sensor runs, for sensors that poll. */
  cadenceSeconds: z.number().int().min(5).max(3600),
  /** Days a quarantined file is kept before it is purged (Theme H). */
  quarantineRetentionDays: z.number().int().min(1).max(365),
  /**
   * Studio only: the user has opened the Vanguard view once. Until then no sensor starts, so a user who
   * never looked at Vanguard never has `lsof` polled. Vanguard's own app ignores it.
   */
  viewOpened: z.boolean(),
});
export type VanguardSettings = z.infer<typeof VanguardSettingsSchema>;

export const DEFAULT_VANGUARD_SETTINGS: VanguardSettings = {
  version: 1,
  sensors: {},
  cadenceSeconds: 30,
  quarantineRetentionDays: 30,
  viewOpened: false,
};

export const VanguardSettingsGetResponse = VanguardSettingsSchema;

/** A partial update: only the keys present change; `sensors` merges per id. */
export const VanguardSettingsSetRequest = z.object({
  sensors: z.record(z.string(), z.boolean()).optional(),
  cadenceSeconds: VanguardSettingsSchema.shape.cadenceSeconds.optional(),
  quarantineRetentionDays: VanguardSettingsSchema.shape.quarantineRetentionDays.optional(),
});
export type VanguardSettingsSetRequest = z.infer<typeof VanguardSettingsSetRequest>;

/** Ask one sensor to run now (the Sensors tab's "Run now"). */
export const VanguardSensorRunRequest = z.object({ id: z.string() });
export type VanguardSensorRunRequest = z.infer<typeof VanguardSensorRunRequest>;
