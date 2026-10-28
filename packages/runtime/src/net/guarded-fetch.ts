import { EGRESS_ENTRIES, findEgressEntry, privacySwitchOn, type EgressHost, type EgressSettings } from '@midnite/studio-shared';

/**
 * Phase 115 Theme A — the one seam every main-side outbound request goes through.
 *
 * Looks the request's host up in `EGRESS_HOSTS`, refuses it when the entry's privacy switch is off (or the
 * master "turn off all automatic network" switch is on), and otherwise hands it to the transport. A host with
 * no entry is refused too: a new outbound host starts as a registry entry. `egress-registry.test.ts` fails on
 * any `fetch` in main-side code that does not come through here.
 *
 * Redirects are followed here, not by the transport: unless the caller asked for `redirect: 'manual'` or
 * `'error'`, the transport is called with `redirect: 'manual'` and every `Location` hop is resolved, re-checked
 * against the registry and the switches, and followed (at most `MAX_REDIRECTS`). Imports no `electron`: the host
 * injects the settings mirror as `getSettings`/`ready` (and may inject a transport; the default is Node's `fetch`).
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

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Credentials that must not follow a redirect to another origin. */
const CROSS_ORIGIN_STRIPPED = ['authorization', 'cookie', 'proxy-authorization'];

export class EgressRedirectError extends Error {
  readonly code = 'EGRESS_REDIRECT';
  constructor(message: string) {
    super(message);
    this.name = 'EgressRedirectError';
  }
}

export function createGuardedFetch(options: GuardedFetchOptions = {}): GuardedFetch {
  const transport = options.transport ?? ((i, n) => globalThis.fetch(i, n));

  /** Resolve the entry for one URL and apply the switch and ready checks. Throws the typed errors. */
  const check = (owner: string, href: string): void => {
    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      // fall through: an unparseable URL has no entry
    }
    const entry = resolveEgress(owner, href);
    if (!entry) throw new EgressUnregisteredError(host || href, owner);
    if (entry.switch) {
      if (options.ready && !options.ready()) throw new EgressBlockedError(host, `${entry.switch}, awaiting settings`);
      if (!privacySwitchOn(options.getSettings?.(), entry.switch)) throw new EgressBlockedError(host, entry.switch);
    }
  };

  return async (owner, input, init) => {
    const first = urlOf(input);
    check(owner, first);

    const callerRedirect = init?.redirect ?? (input instanceof Request ? input.redirect : undefined);
    if (callerRedirect === 'manual' || callerRedirect === 'error') {
      // The caller sees (or refuses) the redirect itself; nothing is followed on its behalf.
      return transport(input instanceof URL ? input.href : input, init);
    }

    // Pull a Request apart once: later hops need its method, headers and body as plain values.
    let method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    let body: NonNullable<RequestInit['body']> | ArrayBuffer | null | undefined = init?.body ?? undefined;
    // A Request's body is consumed by the first hop; it is not buffered up front, so a 307/308 that needs it throws.
    let requestBodyConsumed = body === undefined && input instanceof Request && input.body !== null;
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const { body: _body, ...rest } = init ?? {};

    let current = first;
    for (let hop = 0; ; hop += 1) {
      // The first hop sends the caller's input as given (a Request keeps its method, headers and body).
      const response =
        hop === 0
          ? await transport(input instanceof URL ? input.href : input, { ...init, redirect: 'manual' })
          : await transport(current, {
              ...rest,
              method,
              headers,
              ...(body !== undefined && body !== null ? { body } : {}),
              ...(signal ? { signal } : {}),
              redirect: 'manual',
            });
      const location = response.headers.get('location');
      if (!REDIRECT_STATUSES.has(response.status) || location === null) return response;
      if (hop >= MAX_REDIRECTS) throw new EgressRedirectError(`${owner}: more than ${MAX_REDIRECTS} redirects from ${first}.`);

      const next = new URL(location, current);
      check(owner, next.href);

      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        if (method !== 'GET' && method !== 'HEAD') method = 'GET';
        body = undefined;
        requestBodyConsumed = false;
        headers = new Headers(headers);
        for (const name of ['content-type', 'content-length', 'content-encoding']) headers.delete(name);
      } else if (requestBodyConsumed || (body !== undefined && body !== null && isOneShot(body))) {
        throw new EgressRedirectError(`${owner}: a ${response.status} redirect from ${current} needs the request body resent, but it is a stream.`);
      }
      if (next.origin !== new URL(current).origin) {
        headers = new Headers(headers);
        for (const name of CROSS_ORIGIN_STRIPPED) headers.delete(name);
      }
      void response.body?.cancel().catch(() => undefined);
      current = next.href;
    }
  };
}

const isOneShot = (body: object | string): boolean =>
  typeof body === 'object' &&
  ((typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) || Symbol.asyncIterator in body || typeof (body as { pipe?: unknown }).pipe === 'function');

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
