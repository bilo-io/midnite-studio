/**
 * Midnite Startup over MCP (Phase 153 Theme C) — the `startup_*` tools an agent uses to read the company's
 * runway, roadmap and fleet projections and to make three small, safe changes. Registered in `MCP_TOOLS`
 * (`mcp.ts`), owned by Startup (`modules/startup/mcp-manifest.ts`) and served from Startup's own socket
 * (`startAppMcpServer`), so they are listed only while Startup runs and only once the user has said yes in
 * Startup ▸ Settings ▸ Agents (two switches, both off by default).
 *
 * No write tool touches an invoice, vendor, contract or the ledger: those post journal entries.
 * Money always travels as minor units plus its currency and a formatted string, so an agent never has to
 * guess the exponent.
 */
import { z } from 'zod';

import { MilestoneSchema, MILESTONE_STATUSES, StartupCurrencySchema, YearMonthSchema, type StartupAgentConsent } from './startup';
import { FleetProjectionSchema } from './startup-fleet';

/** The ids, in the order an agent meets them. */
export const STARTUP_MCP_TOOL_IDS = [
  'startup_summary',
  'startup_runway',
  'startup_milestones',
  'startup_projections',
  'startup_projection',
  'startup_upsert_milestone',
  'startup_upsert_projection',
  'startup_send_projection_to_runway',
] as const;
export type StartupMcpToolId = (typeof STARTUP_MCP_TOOL_IDS)[number];
export const isStartupMcpToolId = (value: string): value is StartupMcpToolId => (STARTUP_MCP_TOOL_IDS as readonly string[]).includes(value);

/** The tools that change the workspace — hidden until "Let agents make changes" is on. */
export const STARTUP_MCP_WRITE_TOOL_IDS: readonly StartupMcpToolId[] = [
  'startup_upsert_milestone',
  'startup_upsert_projection',
  'startup_send_projection_to_runway',
];

/** The exact refusal a call to a hidden tool answers with. */
export const STARTUP_AGENTS_OFF_MESSAGE = 'Turn on agent access in Midnite Startup ▸ Settings ▸ Agents.';
/** What Studio's placeholder handlers answer: the tool is Startup's, and the shim routes it there. */
export const STARTUP_OPEN_APP_MESSAGE = 'Open Midnite Startup to use this tool.';

/** The tools `tools/list` offers under a consent: none without read, the reads alone without write. */
export function startupToolsForConsent(consent: StartupAgentConsent): StartupMcpToolId[] {
  if (!consent.read) return [];
  return STARTUP_MCP_TOOL_IDS.filter((id) => consent.write || !STARTUP_MCP_WRITE_TOOL_IDS.includes(id));
}

export const StartupMoneySchema = z.object({ minor: z.number(), currency: StartupCurrencySchema, formatted: z.string() });
export type StartupMoney = z.infer<typeof StartupMoneySchema>;

const Months = z.union([z.literal(12), z.literal(24), z.literal(36)]);

// --- startup_summary -----------------------------------------------------------

export const StartupSummaryInputSchema = z.object({});
export const StartupSummaryResultSchema = z.object({
  company: z.object({ name: z.string() }).nullable(),
  currency: StartupCurrencySchema,
  cash: StartupMoneySchema.nullable(),
  burn: StartupMoneySchema.nullable(),
  runwayMonths: z.number().nullable(),
  defaultAlive: z.boolean().nullable(),
  counts: z.object({
    milestones: z.int(),
    projections: z.int(),
    scenarios: z.int(),
    customers: z.int(),
    invoices: z.int(),
    vendors: z.int(),
    contracts: z.int(),
  }),
  readOnly: z.boolean(),
});

// --- startup_runway ------------------------------------------------------------

export const StartupRunwayInputSchema = z.object({ scenarioId: z.string().min(1).optional(), months: Months.default(12) });
export const StartupRunwayResultSchema = z.object({
  currency: StartupCurrencySchema,
  scenarioId: z.string(),
  months: z.array(
    z.object({ month: YearMonthSchema, revenue: StartupMoneySchema, cost: StartupMoneySchema, net: StartupMoneySchema, cash: StartupMoneySchema }),
  ),
  burn: StartupMoneySchema,
  runwayMonths: z.number().nullable(),
  zeroCashMonth: z.string().nullable(),
  defaultAlive: z.boolean(),
});

// --- startup_milestones --------------------------------------------------------

export const StartupMilestonesInputSchema = z.object({ status: z.enum(MILESTONE_STATUSES).optional() });
export const StartupMilestonesResultSchema = z.object({ milestones: z.array(MilestoneSchema) });

// --- startup_projections / startup_projection ----------------------------------

const Month0 = z.object({
  capex: StartupMoneySchema,
  opexMonthly: StartupMoneySchema,
  revenueMonthly: StartupMoneySchema,
  netMarginMonthly: StartupMoneySchema,
  paybackMonths: z.number().nullable(),
});
export const StartupProjectionsInputSchema = z.object({});
export const StartupProjectionsResultSchema = z.object({
  currency: StartupCurrencySchema,
  projections: z.array(z.object({ id: z.string(), name: z.string(), updatedAt: z.string(), nodes: z.int(), horizonMonths: Months, month0: Month0 })),
});
export const StartupProjectionInputSchema = z.object({ id: z.uuid() });
export const StartupProjectionResultSchema = z.object({
  currency: StartupCurrencySchema,
  projection: FleetProjectionSchema,
  month0: Month0,
  series: z.array(z.object({ month: z.int(), revenueMinor: z.int(), costMinor: z.int(), netMinor: z.int(), cumulativeMinor: z.int() })),
  missing: z.array(z.string()),
});

// --- the three writes ----------------------------------------------------------

export const StartupUpsertMilestoneInputSchema = MilestoneSchema;
export const StartupUpsertProjectionInputSchema = FleetProjectionSchema;
export const StartupSendProjectionInputSchema = z.object({ projectionId: z.uuid(), start: YearMonthSchema });
/** `revision` is the workspace revision after the write; `planLines` (send to Runway only) is how many plan lines the projection now owns. */
export const StartupWriteResultSchema = z.object({ revision: z.int().nonnegative(), planLines: z.int().nonnegative().optional() });
