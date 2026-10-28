import type { PlacementAppId } from '@midnite/studio-shared';

/**
 * Which app is asking — the caller id every runtime service takes on each
 * access (Phase 113 Theme D).
 *
 * The same set as `MidniteAppId` in `shared/src/midnite-link.ts`: the
 * placement map's twelve apps plus Studio, the superset build that composes
 * every feature. Spelled out here rather than imported because that module is
 * taken by source path, never through the shared barrel.
 *
 * Today the only caller is `'studio'`. The id is still threaded through every
 * call so that Theme J's per-app grants have something to check without any
 * call site changing shape.
 */
export type RuntimeAppId = PlacementAppId | 'studio';

/**
 * The principal an agent session in a browser tab acts as (Phase 117 Theme G). It is not an app and
 * holds no grant: the vault refuses it whatever the authorizer says (`vault-service.ts`), and the
 * grants file can never give it one (`grants.ts`). An agent reading untrusted pages with no private
 * data to reach is one leg of the lethal trifecta removed.
 */
export const BROWSER_AGENT_PRINCIPAL = 'browser-agent' as const;

/** Who a vault access is made as: an app, or the browser agent. */
export type RuntimePrincipal = RuntimeAppId | typeof BROWSER_AGENT_PRINCIPAL;
