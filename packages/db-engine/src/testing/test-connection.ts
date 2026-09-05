import type { ConnectionConfig, DbProvider } from '@midnite/studio-shared';

/** Deliberately absent from `src/index.ts`'s barrel — exactly as `git-engine`'s `temp-repo.ts` is. */

type PureJsProvider = Exclude<DbProvider, 'sqlite'>;

export type TestConnectionEnv = {
  config: ConnectionConfig;
  password: string | undefined;
};

/**
 * The environment-variable prefix each provider's ephemeral test instance is
 * configured under. Postgres/MySQL/MariaDB run as CI service containers
 * (Decision 5); MSSQL's ~1.5 GB image and EULA gate keep it a manual pass,
 * so its env vars are simply never set there — the same `null` result a
 * local dev machine gets for every provider.
 */
const ENV_PREFIX: Record<PureJsProvider, string> = {
  postgres: 'MSTUDIO_TEST_POSTGRES',
  mysql: 'MSTUDIO_TEST_MYSQL',
  mariadb: 'MSTUDIO_TEST_MARIADB',
  mssql: 'MSTUDIO_TEST_MSSQL',
};

/**
 * Reads a real, ephemeral test instance's connection details out of the
 * environment. Returns `null` when nothing is configured — every local run
 * outside CI, and MSSQL everywhere but the human pass — so a driver test
 * skips rather than fails against a database that was never meant to be
 * there. No mocking: Theme B's tests are written to run against the real
 * thing when it exists (`db-engine/vitest.config.ts`'s own comment), and
 * this is the one seam that decides whether it does.
 */
export function testConnectionFor(provider: PureJsProvider): TestConnectionEnv | null {
  const prefix = ENV_PREFIX[provider];
  const host = process.env[`${prefix}_HOST`];
  if (!host) return null;

  const rawPort = process.env[`${prefix}_PORT`];
  const port = rawPort ? Number(rawPort) : undefined;
  const database = process.env[`${prefix}_DATABASE`] ?? 'test';
  const username = process.env[`${prefix}_USER`];
  const password = process.env[`${prefix}_PASSWORD`];

  return {
    config: {
      id: `test-${provider}`,
      name: `test-${provider}`,
      provider,
      host,
      ...(port !== undefined && Number.isFinite(port) && port > 0 ? { port } : {}),
      database,
      ...(username ? { username } : {}),
    },
    password,
  };
}
