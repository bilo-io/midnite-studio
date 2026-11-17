import { z } from 'zod';

export const HARDWARE_CATALOG = [
  { id: 'rtx-4090-ws', label: 'RTX 4090 workstation', priceCents: 6_500_000, watts: 650 },
  { id: 'dual-4090', label: 'Dual RTX 4090 server', priceCents: 12_000_000, watts: 1_200 },
  { id: 'l40s-node', label: 'L40S node', priceCents: 22_000_000, watts: 900 },
  { id: 'a100-node', label: 'A100 80GB node', priceCents: 45_000_000, watts: 2_000 },
  { id: 'mac-studio', label: 'Mac Studio (M-Ultra)', priceCents: 9_500_000, watts: 300 },
  { id: 'cpu-1u', label: '1U CPU server', priceCents: 3_500_000, watts: 350 },
] as const;
export const API_TIERS = [
  { id: 'none', label: 'None', monthlyCents: 0 },
  { id: 'starter', label: 'Starter', monthlyCents: 150_000 },
  { id: 'pro', label: 'Pro', monthlyCents: 750_000 },
  { id: 'enterprise', label: 'Enterprise', monthlyCents: 3_000_000 },
] as const;
export const HARDWARE_IDS = ['rtx-4090-ws', 'dual-4090', 'l40s-node', 'a100-node', 'mac-studio', 'cpu-1u'] as const;
export const API_TIER_IDS = ['none', 'starter', 'pro', 'enterprise'] as const;
// a type-level assertion (or a test) pins HARDWARE_IDS / API_TIER_IDS equal to the catalogs' ids
export type HardwareId = (typeof HARDWARE_IDS)[number];
export type ApiTierId = (typeof API_TIER_IDS)[number];
export const hardwareById = (id: HardwareId) => HARDWARE_CATALOG.find((h) => h.id === id)!;
export const apiTierById = (id: ApiTierId) => API_TIERS.find((t) => t.id === id)!;

export const HOURS_PER_MONTH = 730;
export const MAX_FLEET_PROJECTIONS = 50;
export const MAX_FLEET_NODES = 200;

export const FleetNodeConfigSchema = z.object({
  hardwareId: z.enum(HARDWARE_IDS),
  apiTierId: z.enum(API_TIER_IDS),
  quantity: z.int().min(1).max(64),
  utilisationPct: z.int().min(0).max(100),
  pricePerHourCents: z.int().min(0).max(1_000_000), // R 0 – R 10,000 per GPU-hour
});
export const FleetNodeSchema = FleetNodeConfigSchema.extend({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
});
export const FleetGlobalsSchema = z.object({
  scalePct: z.int().min(10).max(500), // multiplies quantity in the maths only
  electricityRateCents: z.int().min(0).max(10_000), // per kWh, R 0 – R 100
  demandGrowthPct: z.int().min(-20).max(50), // monthly, compounding on utilisation, capped 0–100 %
  horizonMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]),
});
export const FleetProjectionSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(), // as ledger.ts:105 does
  updatedAt: z.iso.datetime(),
  globals: FleetGlobalsSchema,
  template: FleetNodeConfigSchema, // what "Spawn node" copies
  nodes: z.array(FleetNodeSchema).max(MAX_FLEET_NODES),
});
export type FleetNodeConfig = z.infer<typeof FleetNodeConfigSchema>;
export type FleetNode = z.infer<typeof FleetNodeSchema>;
export type FleetGlobals = z.infer<typeof FleetGlobalsSchema>;
export type FleetProjection = z.infer<typeof FleetProjectionSchema>;

export const DEFAULT_FLEET_GLOBALS: FleetGlobals = {
  scalePct: 100,
  electricityRateCents: 320,
  demandGrowthPct: 0,
  horizonMonths: 24,
};
export const DEFAULT_FLEET_TEMPLATE: FleetNodeConfig = {
  hardwareId: 'dual-4090',
  apiTierId: 'starter',
  quantity: 1,
  utilisationPct: 70,
  pricePerHourCents: 2_500,
};

export type FleetStarterId = 'blank' | 'gpu-cluster' | 'api-only';
export const FLEET_STARTERS: readonly { id: FleetStarterId; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'gpu-cluster', label: 'GPU cluster' },
  { id: 'api-only', label: 'API only' },
];

/** Pure: the caller supplies ids and the clock, so tests are deterministic. */
export function buildFleetStarter(
  starter: FleetStarterId,
  ids: { projectionId: string; nodeId: () => string },
  nowIso: string,
  name: string,
): FleetProjection {
  let template: FleetNodeConfig = { ...DEFAULT_FLEET_TEMPLATE };
  let count = 0;
  if (starter === 'gpu-cluster') {
    template = {
      hardwareId: 'dual-4090',
      apiTierId: 'pro',
      quantity: 1,
      utilisationPct: 70,
      pricePerHourCents: 2_500,
    };
    count = 4;
  } else if (starter === 'api-only') {
    template = {
      hardwareId: 'cpu-1u',
      apiTierId: 'enterprise',
      quantity: 1,
      utilisationPct: 50,
      pricePerHourCents: 800,
    };
    count = 2;
  }
  const nodes: FleetNode[] = Array.from({ length: count }, (_, i) => ({
    ...template,
    id: ids.nodeId(),
    name: `Node ${i + 1}`,
    enabled: true,
  }));
  return {
    id: ids.projectionId,
    name,
    createdAt: nowIso,
    updatedAt: nowIso,
    globals: { ...DEFAULT_FLEET_GLOBALS },
    template,
    nodes,
  };
}
