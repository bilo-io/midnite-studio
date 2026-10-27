/**
 * Named inputs resolved once per sweep (Phase 122 Theme A).
 *
 * Checks declare which inputs they need (`needs: ['lockfiles', 'osv', ...]`).
 * The sweep runner resolves them once upfront, respecting privacy switches.
 * When a switch is turned off, the input is skipped and recorded in `inputsSkipped`
 * with the name of the switch that skipped it.
 */

export type KnownGuardInputKey =
  | 'lockfiles'
  | 'osv'
  | 'kev'
  | 'ghsa'
  | 'threatFeed'
  | 'ports'
  | 'brew'
  | 'history'
  | 'auditTrail';

export type GuardInputKey = KnownGuardInputKey | (string & {});

/**
 * Default map of input keys to the Privacy / Settings switch that controls whether
 * that feed or inspection runs (Phase 115 A / Phase 122 Theme H).
 */
export const DEFAULT_INPUT_SWITCHES: Readonly<Record<string, string>> = {
  osv: 'privacy.feed.osv',
  kev: 'privacy.feed.kev',
  ghsa: 'privacy.feed.ghsa',
  threatFeed: 'privacy.feed.threatFeed',
  brew: 'privacy.system.brew',
  history: 'privacy.browser.history',
  auditTrail: 'privacy.agent.auditTrail',
};

export interface GuardInputResolverContext {
  userData?: string;
  repos?: readonly string[];
  switches?: Readonly<Record<string, boolean>>;
  resolvers?: Readonly<Record<string, (ctx: GuardInputResolverContext) => Promise<unknown> | unknown>>;
}

export interface ResolvedGuardInputs {
  inputs: Record<string, unknown>;
  skipped: Record<string, string>; // inputKey -> switchId
}

/**
 * Resolves inputs needed across checks for a sweep.
 *
 * For each input:
 * 1. If its associated switch is explicitly false, it is skipped (`skipped[input] = switchName`).
 * 2. If a resolver is provided in `context.resolvers`, it runs once and the result is stored.
 * 3. Otherwise, an empty or default container is provided for fixture checks.
 */
export async function resolveGuardInputs(
  needed: readonly GuardInputKey[],
  context: GuardInputResolverContext = {},
): Promise<ResolvedGuardInputs> {
  const inputs: Record<string, unknown> = {};
  const skipped: Record<string, string> = {};
  const uniqueNeeded = Array.from(new Set(needed));

  for (const key of uniqueNeeded) {
    const switchId = DEFAULT_INPUT_SWITCHES[key] ?? `privacy.${key}`;
    const isEnabled = context.switches?.[switchId] !== false && context.switches?.[key] !== false;

    if (!isEnabled) {
      skipped[key] = switchId;
      continue;
    }

    const resolver = context.resolvers?.[key];
    if (resolver) {
      try {
        inputs[key] = await resolver(context);
      } catch (err) {
        // If resolution fails, record as skipped with error detail
        const message = err instanceof Error ? err.message : String(err);
        skipped[key] = `error: ${message}`;
      }
    } else {
      inputs[key] = {};
    }
  }

  return { inputs, skipped };
}
