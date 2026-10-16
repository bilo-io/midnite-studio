import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  accountSecretName,
  BrokerAccountSchema,
  type AccountConnectorId,
  type AccountConnectorInfo,
  type AccountEnvironment,
  type AccountSnapshot,
  type BrokerAccount,
} from '@midnite/studio-shared';
import { z } from 'zod';

import { defaultFetcher, type Fetcher } from '../markets/http';
import {
  ConnectorError,
  createReadOnlyRequester,
  type AccountConnector,
  type ConnectorContext,
} from './connector';
import { allocationByAsset, summarisePerformance, totalUsd } from './derive';
import { connectorFor, connectorInfos } from './registry';

/**
 * Where an account's credential fields live: main's vault, under
 * {@link accountSecretName}. `get` exists because main must read a credential to sign a
 * request — it is not on any channel, and the renderer-facing bridge has no equivalent.
 */
export type CredentialStore = {
  set(name: string, value: string): Promise<void>;
  get(name: string): Promise<string | null>;
  delete(name: string): Promise<void>;
};

export type AccountsService = {
  list(): Promise<{ connectors: AccountConnectorInfo[]; accounts: BrokerAccount[] }>;
  test(req: { connector: AccountConnectorId; environment: AccountEnvironment; fields: Record<string, string> }): Promise<string>;
  add(req: {
    connector: AccountConnectorId;
    environment: AccountEnvironment;
    fields: Record<string, string>;
    label: string;
  }): Promise<BrokerAccount>;
  remove(id: string): Promise<boolean>;
  snapshots(options?: { refresh?: boolean; id?: string }): Promise<AccountSnapshot[]>;
};

export type AccountsServiceOptions = {
  /** Where `accounts.json` (non-secret metadata) lives. */
  directory: string;
  credentials: CredentialStore;
  fetcher?: Fetcher;
  now?: () => number;
  /** How long a snapshot is served from memory before the provider is asked again. */
  ttlMs?: number;
  newId?: (connector: AccountConnectorId) => string;
};

export const SNAPSHOT_TTL_MS = 60_000;

const FileSchema = z.object({ version: z.literal(1), accounts: z.array(BrokerAccountSchema) });

/** A message with every credential value removed — the last line of defence for an error that echoes one. */
export function scrub(message: string, values: Iterable<string>): string {
  let out = message;
  for (const value of values) if (value.length >= 4) out = out.split(value).join('[redacted]');
  return out;
}

export function createAccountsService(options: AccountsServiceOptions): AccountsService {
  const fetcher = options.fetcher ?? defaultFetcher;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? SNAPSHOT_TTL_MS;
  const newId = options.newId ?? ((c) => `${c}-${randomBytes(4).toString('hex')}`);
  const file = join(options.directory, 'accounts.json');
  const cache = new Map<string, { at: number; snapshot: AccountSnapshot }>();

  const load = async (): Promise<BrokerAccount[]> => {
    try {
      const parsed = FileSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      return parsed.success ? parsed.data.accounts : [];
    } catch {
      return [];
    }
  };

  const save = async (accounts: BrokerAccount[]): Promise<void> => {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, accounts }), 'utf8');
    await rename(tmp, file);
  };

  const contextFor = (
    connector: AccountConnector,
    environment: AccountEnvironment,
    credentials: Record<string, string>,
  ): ConnectorContext => ({
    credentials,
    environment,
    now,
    request: createReadOnlyRequester(connector, connector.baseUrl(environment), fetcher),
  });

  const readCredentials = async (account: BrokerAccount): Promise<Record<string, string>> => {
    const connector = connectorFor(account.connector);
    const out: Record<string, string> = {};
    for (const field of connector.fields) {
      const value = await options.credentials.get(accountSecretName(account.connector, account.id, field.name));
      if (!value) throw new ConnectorError('the stored credentials are missing — remove the account and add it again');
      out[field.name] = value;
    }
    return out;
  };

  /** Exactly the connector's fields, each trimmed and non-empty — extra names are refused, not stored. */
  const checkFields = (connector: AccountConnector, fields: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const field of connector.fields) {
      const value = fields[field.name]?.trim();
      if (!value) throw new ConnectorError(`${field.label} is required`);
      out[field.name] = value;
    }
    const extra = Object.keys(fields).filter((name) => !connector.fields.some((f) => f.name === name));
    if (extra.length > 0) throw new ConnectorError(`unexpected field: ${extra[0] as string}`);
    return out;
  };

  const verify = async (
    connector: AccountConnector,
    environment: AccountEnvironment,
    credentials: Record<string, string>,
  ): Promise<string> => {
    try {
      const balances = await connector.balances(contextFor(connector, environment, credentials));
      return `Connected — ${balances.length} balance${balances.length === 1 ? '' : 's'} found.`;
    } catch (err) {
      throw new ConnectorError(scrub(err instanceof Error ? err.message : 'connection failed', Object.values(credentials)));
    }
  };

  const emptySnapshot = (account: BrokerAccount, error: string | null): AccountSnapshot => ({
    account,
    balances: [],
    positions: [],
    history: [],
    allocation: [],
    performance: null,
    totalUsd: 0,
    fetchedAt: now(),
    error,
  });

  const fetchSnapshot = async (account: BrokerAccount): Promise<AccountSnapshot> => {
    let credentials: Record<string, string> = {};
    try {
      credentials = await readCredentials(account);
      const connector = connectorFor(account.connector);
      const ctx = contextFor(connector, account.environment, credentials);
      const [balances, positions, history] = await Promise.all([
        connector.balances(ctx),
        connector.positions(ctx),
        // A missing equity curve must not hide balances, so history degrades to empty.
        connector.history(ctx).catch(() => []),
      ]);
      return {
        account,
        balances,
        positions,
        history,
        allocation: allocationByAsset(balances, positions),
        performance: summarisePerformance(history),
        totalUsd: totalUsd(balances, positions),
        fetchedAt: now(),
        error: null,
      };
    } catch (err) {
      const message = scrub(err instanceof Error ? err.message : 'request failed', Object.values(credentials));
      const previous = cache.get(account.id)?.snapshot;
      // Last good data stays visible beside the error; only this account is affected.
      return previous ? { ...previous, error: message } : emptySnapshot(account, message);
    }
  };

  return {
    async list() {
      return { connectors: connectorInfos(), accounts: await load() };
    },

    async test(req) {
      const connector = connectorFor(req.connector);
      return verify(connector, req.environment, checkFields(connector, req.fields));
    },

    async add(req) {
      const connector = connectorFor(req.connector);
      const credentials = checkFields(connector, req.fields);
      await verify(connector, req.environment, credentials);
      const account: BrokerAccount = {
        id: newId(req.connector),
        connector: req.connector,
        label: req.label,
        environment: connector.supportsEnvironment ? req.environment : 'live',
        createdAt: now(),
      };
      const written: string[] = [];
      try {
        for (const [field, value] of Object.entries(credentials)) {
          const name = accountSecretName(account.connector, account.id, field);
          await options.credentials.set(name, value);
          written.push(name);
        }
        await save([...(await load()), account]);
      } catch (err) {
        for (const name of written) await options.credentials.delete(name).catch(() => undefined);
        throw new ConnectorError(scrub(err instanceof Error ? err.message : 'could not store the account', Object.values(credentials)));
      }
      return account;
    },

    async remove(id) {
      const accounts = await load();
      const account = accounts.find((a) => a.id === id);
      if (!account) return false;
      for (const field of connectorFor(account.connector).fields) {
        await options.credentials.delete(accountSecretName(account.connector, account.id, field.name));
      }
      await save(accounts.filter((a) => a.id !== id));
      cache.delete(id);
      return true;
    },

    async snapshots({ refresh = false, id } = {}) {
      const accounts = (await load()).filter((a) => id === undefined || a.id === id);
      return Promise.all(
        accounts.map(async (account) => {
          const hit = cache.get(account.id);
          if (!refresh && hit && now() - hit.at < ttlMs) return hit.snapshot;
          const snapshot = await fetchSnapshot(account);
          if (snapshot.error === null) cache.set(account.id, { at: now(), snapshot });
          return snapshot;
        }),
      );
    },
  };
}
