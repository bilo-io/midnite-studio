import { z } from 'zod';

/**
 * Per-session limits for an agent — Phase 121 Theme F.
 *
 * Generous on purpose: they exist to stop a runaway (a loop that hammers a tool, a push storm, a session
 * that burns its budget), not to meter normal work. The breaker (`runtime/src/security/agent-breaker.ts`)
 * trips when a count goes **past** its threshold — at a limit of 120 the 120th call is fine and the 121st
 * trips. A tripped limit is recorded as a `limit-trip` audit record (`agent-audit.ts`).
 */
export const AgentLimitsSchema = z.object({
  /** MCP tool calls in any 60 s window. */
  toolCallsPerMinute: z.number().int().positive().default(120),
  /** File-writing tool calls in any 60 s window. */
  fileWritesPerMinute: z.number().int().positive().default(300),
  /** `git push` in any 60 min window. */
  gitPushesPerHour: z.number().int().positive().default(10),
  /** Distinct hosts the session's commands reach out to. */
  outboundHostsPerSession: z.number().int().positive().default(25),
  /**
   * Tokens the session may spend (input + output + cache writes; cache reads are not billed as new work),
   * read from the agent's own transcript by the monitor feature's `agent-usage.ts`. `null` turns it off.
   */
  spendTokensPerSession: z.number().int().positive().nullable().default(5_000_000),
});
export type AgentLimits = z.infer<typeof AgentLimitsSchema>;

/** The limits a repo changes; anything it leaves out keeps the default. */
export const AgentLimitsOverrideSchema = AgentLimitsSchema.partial();
export type AgentLimitsOverride = z.infer<typeof AgentLimitsOverrideSchema>;

/** The persisted settings: one override for every repo, and one per repo path (the repo wins). */
export const AgentLimitsSettingsSchema = z.object({
  defaults: AgentLimitsOverrideSchema.default({}),
  repos: z.record(z.string(), AgentLimitsOverrideSchema).default({}),
});
export type AgentLimitsSettings = z.infer<typeof AgentLimitsSettingsSchema>;

export const DEFAULT_AGENT_LIMITS: AgentLimits = AgentLimitsSchema.parse({});

export const AGENT_LIMIT_KEYS = [
  'toolCallsPerMinute',
  'fileWritesPerMinute',
  'gitPushesPerHour',
  'outboundHostsPerSession',
  'spendTokensPerSession',
] as const;
export const AgentLimitKeySchema = z.enum(AGENT_LIMIT_KEYS);
export type AgentLimitKey = z.infer<typeof AgentLimitKeySchema>;

/** Sliding-window lengths for the rate limits; the other two limits are per session, not per window. */
export const AGENT_LIMIT_WINDOW_MS = {
  toolCallsPerMinute: 60_000,
  fileWritesPerMinute: 60_000,
  gitPushesPerHour: 3_600_000,
} as const;

/** Human label for a limit, used in findings and the toast. */
export const AGENT_LIMIT_LABELS: Record<AgentLimitKey, string> = {
  toolCallsPerMinute: 'tool calls per minute',
  fileWritesPerMinute: 'file writes per minute',
  gitPushesPerHour: 'git pushes per hour',
  outboundHostsPerSession: 'outbound hosts per session',
  spendTokensPerSession: 'tokens per session',
};

/**
 * The limits for a repo: defaults, then the global override, then the override for the longest repo path
 * that contains `repoPath`. Bad input never throws — an invalid override is ignored field by field.
 */
export function resolveAgentLimits(settings: AgentLimitsSettings | undefined, repoPath?: string): AgentLimits {
  const layers: AgentLimitsOverride[] = [];
  if (settings) {
    layers.push(settings.defaults);
    if (repoPath) {
      const match = Object.keys(settings.repos)
        .filter((root) => repoPath === root || repoPath.startsWith(root.endsWith('/') ? root : `${root}/`))
        .sort((a, b) => b.length - a.length)[0];
      if (match) layers.push(settings.repos[match] ?? {});
    }
  }
  return layers.reduce<AgentLimits>((acc, layer) => {
    const parsed = AgentLimitsOverrideSchema.safeParse(layer);
    return parsed.success ? { ...acc, ...stripUndefined(parsed.data) } : acc;
  }, { ...DEFAULT_AGENT_LIMITS });
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// --- the trip, as the window and the renderer see it ------------------------------------------------------

export const AgentLimitTripSchema = z.object({
  /** Unique per trip; the renderer answers with it. */
  id: z.string(),
  sessionId: z.string(),
  limit: AgentLimitKeySchema,
  observed: z.number(),
  threshold: z.number(),
  /** The one-line toast text. */
  message: z.string(),
  at: z.number(),
});
export type AgentLimitTrip = z.infer<typeof AgentLimitTripSchema>;

/** What the user chose on the toast. */
export const AgentLimitResolveRequest = z.object({
  tripId: z.string(),
  action: z.enum(['resume', 'stop', 'raise']),
});
export type AgentLimitResolveRequest = z.infer<typeof AgentLimitResolveRequest>;
