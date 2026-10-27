import { EGRESS_ENTRIES, findEgressEntry, privacySwitchOn, type EgressHost, type EgressSettings } from '@midnite/studio-shared';

/**
 * Phase 115 Theme A — the one seam every main-side outbound request goes through.
 *
 * Looks the request's host up in `EGRESS_HOSTS`, refuses it when the entry's privacy switch is off (or the
 * master "turn off all automatic network" switch is on), and otherwise hands it to the transport. A host with
 * no entry is refused too: a new outbound host starts as a registry entry. `egress-registry.test.ts` fails on
 * any `fetch` in main-side code that does not come through here.
 *
 * Imports no `electron`: the host injects Electron's `net.fetch` as the transport and the settings mirror as
 * `getSettings`.
 */

export class EgressBlockedError extends Error {
  readonly code = 'EGRESS_BLOCKED';
  constructor(
    readonly host: string,
    readonly switchId: string,
  ) {
    super(`Network call to ${host} is turned off in Settings ▸ Privacy (${switchId}).`);
    this.name = 'EgressBlockedError';
  }
}

export class EgressUnregisteredError extends Error {
  readonly code = 'EGRESS_UNREGISTERED';
  constructor(
    readonly host: string,
    readonly owner: string,
  ) {
    super(`${owner} tried to reach ${host}, which has no EGRESS_HOSTS entry.`);
    this.name = 'EgressUnregisteredError';
  }
}

export type GuardedFetch = (owner: string, url: string | URL, init?: RequestInit) => Promise<Response>;

export type GuardedFetchOptions = {
  /** The last privacy settings the renderer pushed; absent means every switch at its default. */
  getSettings?: () => EgressSettings | undefined;
  /** The real client. Defaults to `globalThis.fetch`. */
  transport?: (url: string, init?: RequestInit) => Promise<Response>;
};

/** The entry that permits `owner` to reach `url`, or why it cannot. Pure, so callers can pre-check. */
export function resolveEgress(owner: string, url: string | URL): EgressHost | undefined {
  const exact = findEgressEntry(url);
  if (exact) return exact;
  return EGRESS_ENTRIES.find((e) => e.host === '*' && e.owner === owner);
}

export function createGuardedFetch(options: GuardedFetchOptions = {}): GuardedFetch {
  return async (owner, url, init) => {
    const href = typeof url === 'string' ? url : url.href;
    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      // fall through: an unparseable URL has no entry
    }
    const entry = resolveEgress(owner, href);
    if (!entry) throw new EgressUnregisteredError(host || href, owner);
    if (entry.switch && !privacySwitchOn(options.getSettings?.(), entry.switch)) throw new EgressBlockedError(host, entry.switch);
    const transport = options.transport ?? ((u, i) => globalThis.fetch(u, i));
    return transport(href, init);
  };
}

let configured: GuardedFetch = createGuardedFetch();

/** The host's one-time wiring: Electron's `net.fetch` and the settings mirror. Call before any caller runs. */
export function configureGuardedFetch(options: GuardedFetchOptions): void {
  configured = createGuardedFetch(options);
}

/** `guardedFetch('finance', url, init)` — the process-wide seam. */
export const guardedFetch: GuardedFetch = (owner, url, init) => configured(owner, url, init);

/** A `fetch`-shaped function bound to one owner, for the services that take `fetchImpl`. */
export function guardedFetchFor(owner: string): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return (input, init) => guardedFetch(owner, typeof input === 'string' || input instanceof URL ? input : input.url, init);
}
