import { EGRESS_ENTRIES, findEgressEntry, privacySwitchOn, type EgressHost, type EgressSettings } from '@midnite/studio-shared';

/**
 * Phase 115 Theme A — the one seam every main-side outbound request goes through.
 *
 * Looks the request's host up in `EGRESS_HOSTS`, refuses it when the entry's privacy switch is off (or the
 * master "turn off all automatic network" switch is on), and otherwise hands it to the transport. A host with
 * no entry is refused too: a new outbound host starts as a registry entry. `egress-registry.test.ts` fails on
 * any `fetch` in main-side code that does not come through here.
 *
 * Only the first URL is checked: the transport follows redirects and the hop is not re-validated (a known gap,
 * recorded in the phase doc). Imports no `electron`: the host injects the settings mirror as `getSettings`/`ready`
 * (and may inject a transport; the default is Node's `fetch`).
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

export type GuardedFetchInput = string | URL | Request;
export type GuardedFetch = (owner: string, input: GuardedFetchInput, init?: RequestInit) => Promise<Response>;

export type GuardedFetchOptions = {
  /** The last privacy settings the renderer pushed; absent means every switch at its default. */
  getSettings?: () => EgressSettings | undefined;
  /**
   * Whether the renderer has pushed its settings yet. Until it has, a call that a switch can turn off fails
   * closed: main cannot read the persisted switches itself, and a user who turned one off must not be called
   * on during boot because the default is on. Omitted means always ready.
   */
  ready?: () => boolean;
  /** The real client. Defaults to `globalThis.fetch`. */
  transport?: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

const urlOf = (input: GuardedFetchInput): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

/**
 * The entry that permits `owner` to reach `input`, or `undefined`. An owner that registered `*` (a
 * user-supplied URL) is judged by its own `*` entry for any host that is not its own: a request the user
 * composed is not an automatic call of whichever feature happens to own that host. Pure.
 */
export function resolveEgress(owner: string, input: GuardedFetchInput): EgressHost | undefined {
  const exact = findEgressEntry(urlOf(input));
  const wildcard = EGRESS_ENTRIES.find((e) => e.host === '*' && e.owner === owner);
  if (exact && (exact.owner === owner || !wildcard)) return exact;
  return wildcard;
}

export function createGuardedFetch(options: GuardedFetchOptions = {}): GuardedFetch {
  return async (owner, input, init) => {
    const href = urlOf(input);
    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      // fall through: an unparseable URL has no entry
    }
    const entry = resolveEgress(owner, input);
    if (!entry) throw new EgressUnregisteredError(host || href, owner);
    if (entry.switch) {
      if (options.ready && !options.ready()) throw new EgressBlockedError(host, `${entry.switch}, awaiting settings`);
      if (!privacySwitchOn(options.getSettings?.(), entry.switch)) throw new EgressBlockedError(host, entry.switch);
    }
    const transport = options.transport ?? ((i, n) => globalThis.fetch(i, n));
    // A Request keeps its method, headers and body; a URL object is passed as its string.
    return transport(input instanceof URL ? input.href : input, init);
  };
}

let configured: GuardedFetch = createGuardedFetch();

/** The host's one-time wiring: the settings mirror (and optionally Electron's `net.fetch`). Call before any caller runs. */
export function configureGuardedFetch(options: GuardedFetchOptions): void {
  configured = createGuardedFetch(options);
}

/** `guardedFetch('finance', url, init)` — the process-wide seam. */
export const guardedFetch: GuardedFetch = (owner, input, init) => configured(owner, input, init);

/** A `fetch`-shaped function bound to one owner, for the services that take `fetchImpl`. */
export function guardedFetchFor(owner: string): (input: GuardedFetchInput, init?: RequestInit) => Promise<Response> {
  return (input, init) => guardedFetch(owner, input, init);
}
