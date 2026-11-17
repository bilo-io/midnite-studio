import { DEFAULT_FLEET_TEMPLATE, buildFleetStarter, type FleetNode, type FleetProjection } from '@midnite/studio-shared';

export const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A node matching the `gpu-cluster` starter's template (so it carries no override), `Node <n>`, id `u(100 + n)`. */
export function fleetNode(n: number, overrides: Partial<FleetNode> = {}): FleetNode {
  return { ...DEFAULT_FLEET_TEMPLATE, apiTierId: 'pro', id: u(100 + n), name: `Node ${n}`, enabled: true, ...overrides };
}

/** A `gpu-cluster` projection (4 enabled nodes) with deterministic ids and clock. */
export function fleetProjection(overrides: Partial<FleetProjection> = {}, n = 1): FleetProjection {
  let k = 0;
  const base = buildFleetStarter('gpu-cluster', { projectionId: u(n), nodeId: () => u(100 + ++k) }, '2026-11-01T00:00:00.000Z', `Projection ${n}`);
  return { ...base, ...overrides };
}
