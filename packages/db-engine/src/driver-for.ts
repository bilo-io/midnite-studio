import type { ConnectionConfig, DbProvider } from '@midnite/studio-shared';

import type { DbDriver } from './driver';
import { createMariadbDriver } from './drivers/mariadb';
import { createMssqlDriver } from './drivers/mssql';
import { createMysqlDriver } from './drivers/mysql';
import { createPostgresDriver } from './drivers/postgres';

type PureJsProvider = Exclude<DbProvider, 'sqlite'>;

const FACTORIES: Record<
  PureJsProvider,
  (config: ConnectionConfig, password: string | undefined) => DbDriver
> = {
  postgres: createPostgresDriver,
  mysql: createMysqlDriver,
  mariadb: createMariadbDriver,
  mssql: createMssqlDriver,
};

/**
 * Build the driver for a connection's configured provider.
 *
 * SQLite is out of scope for this batch (Theme C) — a native module,
 * isolated for its own dual-ABI packaging risk. Asking for it here throws
 * rather than silently returning something that pretends to work, since a
 * caller reaching this branch is a real programming error (Theme E's
 * connection form does not offer SQLite yet), not a normal outcome to
 * surface through `DbOpResult`.
 */
export function driverFor(config: ConnectionConfig, password: string | undefined): DbDriver {
  if (config.provider === 'sqlite') {
    throw new Error(
      'SQLite is not implemented in @midnite/studio-db-engine yet — see Phase 61 Theme C.',
    );
  }
  return FACTORIES[config.provider](config, password);
}
