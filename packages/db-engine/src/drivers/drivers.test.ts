import { describe, expect, it } from 'vitest';

import type { DbProvider } from '@midnite/studio-shared';

import { driverFor } from '../driver-for';
import { testConnectionFor } from '../testing/test-connection';

/**
 * Real, ephemeral instance per provider — no mocking (Decision 5). CI runs
 * Postgres/MySQL/MariaDB as service containers and sets the matching
 * `MSTUDIO_TEST_<PROVIDER>_*` environment variables; MSSQL is a manual pass
 * and is expected to have none set anywhere this suite runs automatically.
 *
 * `testConnectionFor` returns `null` when a provider's environment is not
 * configured — every local run outside CI — and this suite skips rather than
 * fails against a database that was never meant to be there.
 */
const PROVIDERS: Exclude<DbProvider, 'sqlite'>[] = ['postgres', 'mysql', 'mariadb', 'mssql'];

describe.each(PROVIDERS)('%s driver (CI service container)', (provider) => {
  const env = testConnectionFor(provider);

  it.skipIf(!env)('connects, runs a batched SELECT, and introspects the schema', async () => {
    if (!env) return;
    const driver = driverFor(env.config, env.password);
    await driver.connect();
    try {
      const batches: { columns: string[]; rows: unknown[][] }[] = [];
      const controller = new AbortController();
      const { rowCount } = await driver.query(
        'SELECT 1 AS one',
        (batch) => batches.push(batch),
        { batchSize: 500, signal: controller.signal },
      );
      expect(rowCount).toBe(1);
      expect(batches.flatMap((b) => b.rows)).toEqual([[1]]);

      const tree = await driver.introspect();
      expect(tree.connectionId).toBe(env.config.id);
      expect(Array.isArray(tree.tables)).toBe(true);
    } finally {
      await driver.disconnect();
    }
  });
});
