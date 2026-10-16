import type {
  AccountConnectorInfo,
  AccountEnvironment,
  Balance,
  PerformancePoint,
  Position,
} from '@midnite/studio-shared';

import type { Fetcher } from '../markets/http';

/**
 * The connector contract — one file per brokerage or exchange (Phase 113 Theme P slice 2).
 *
 * A connector is **read-only by construction, not by promise**:
 *
 * - Its only verbs are {@link AccountConnector.balances}, {@link AccountConnector.positions} and
 *   {@link AccountConnector.history}. There is no method to place, amend or cancel an order,
 *   withdraw or transfer, so nothing downstream can call one.
 * - It never sees the transport. It is handed a {@link ReadOnlyRequester} built from its own
 *   {@link AccountConnector.allowedEndpoints}; a request to any other `(method, path)` throws
 *   {@link ReadOnlyViolationError} before the fetcher is touched. An order, withdrawal or transfer
 *   endpoint is therefore unreachable even if a connector's code were edited to ask for it, unless
 *   someone also widens its allowlist in the same file, where a reviewer and the tests see it.
 * - A second, blunt guard refuses any path containing a trading or money-movement word, so even a
 *   careless allowlist entry such as `/v2/orders` cannot be built.
 *
 * Adding a connector is adding a file: implement this interface, list its endpoints, register it in
 * `registry.ts`, and add a recorded-fixture test. The credential values it receives are read from
 * the vault in main for that one call and are not retained.
 */

/** One endpoint a connector may call. `path` is an exact path, or a RegExp over the whole path. */
export type AllowedEndpoint = { method: 'GET' | 'POST'; path: string | RegExp };

/** Words that mean "trade or move money". A path containing one is never built, allowlisted or not. */
export const FORBIDDEN_PATH_WORDS =
  /order|trade(?!balance)|withdraw|transfer|cancel|deposit|send|sell|buy|payout|wallet|edit|amend|replace|close|liquidat|fund/i;

export class ReadOnlyViolationError extends Error {
  constructor(method: string, path: string) {
    super(`read-only connector refused ${method} ${path}`);
    this.name = 'ReadOnlyViolationError';
  }
}

/** A connection failure that is safe to show: never carries a header, key or signature. */
export class ConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export type RequestOptions = {
  query?: Record<string, string>;
  /** Raw body for a POST; the signer decides its encoding. */
  body?: string;
  /** Extra headers (signatures); they are built by the connector and never logged. */
  headers?: Record<string, string>;
};

export type ReadOnlyRequester = {
  /** Parsed JSON from an allowlisted endpoint; throws {@link ReadOnlyViolationError} for any other. */
  json(method: 'GET' | 'POST', path: string, options?: RequestOptions): Promise<unknown>;
};

export type ConnectorContext = {
  /** The credential fields, keyed by the connector's declared names. Held for this call only. */
  credentials: Readonly<Record<string, string>>;
  environment: AccountEnvironment;
  request: ReadOnlyRequester;
  now: () => number;
};

export interface AccountConnector extends Omit<AccountConnectorInfo, 'inputs'> {
  /** The credential fields to ask for (the wire calls them `inputs`: names and labels, never values). */
  fields: AccountConnectorInfo['inputs'];
  /** The only endpoints this connector may request. Reviewed like a permission list. */
  allowedEndpoints: readonly AllowedEndpoint[];
  /** Where requests go, by environment. */
  baseUrl(environment: AccountEnvironment): string;
  balances(ctx: ConnectorContext): Promise<Balance[]>;
  positions(ctx: ConnectorContext): Promise<Position[]>;
  history(ctx: ConnectorContext): Promise<PerformancePoint[]>;
}

const matches = (rule: AllowedEndpoint, method: string, path: string): boolean =>
  rule.method === method && (typeof rule.path === 'string' ? rule.path === path : rule.path.test(path));

const TIMEOUT_MS = 12_000;

/** Builds the only transport a connector gets. */
export function createReadOnlyRequester(
  connector: Pick<AccountConnector, 'allowedEndpoints' | 'id'>,
  baseUrl: string,
  fetcher: Fetcher,
): ReadOnlyRequester {
  return {
    async json(method, path, options = {}) {
      const allowed = connector.allowedEndpoints.some((rule) => matches(rule, method, path));
      if (!allowed || FORBIDDEN_PATH_WORDS.test(path)) throw new ReadOnlyViolationError(method, path);
      const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
      const res = await fetcher(`${baseUrl}${path}${query}`, {
        method,
        headers: { accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...(options.body !== undefined ? { body: options.body } : {}),
      });
      if (res.status === 401 || res.status === 403) {
        throw new ConnectorError(`${connector.id} rejected the credentials (${res.status}) — check the key and its permissions`);
      }
      if (res.status === 429) throw new ConnectorError(`${connector.id} is rate limiting requests`);
      if (!res.ok) throw new ConnectorError(`${connector.id} answered ${res.status}`);
      try {
        return JSON.parse(await res.text()) as unknown;
      } catch {
        throw new ConnectorError(`${connector.id} sent something that was not JSON`);
      }
    },
  };
}
