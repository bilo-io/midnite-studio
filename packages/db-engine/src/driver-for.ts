import type { ConnectionConfig, DbProvider } from '@midnite/studio-shared';

import type { DbDriver } from './driver';
import { createMariadbDriver } from './drivers/mariadb';
import { createMssqlDriver } from './drivers/mssql';
import { createMysqlDriver } from './drivers/mysql';
import { createPostgresDriver } from './drivers/postgres';
import { createSqliteDriver } from './drivers/sqlite';

const FACTORIES: Record<
  DbProvider,
  (config: ConnectionConfig, password: string | undefined) => DbDriver
> = {
  postgres: createPostgresDriver,
  mysql: createMysqlDriver,
  mariadb: createMariadbDriver,
  mssql: createMssqlDriver,
  // SQLite is a file, not a credential — `password` is accepted only for
  // shape parity with `DbDriverFactory` and ignored.
  sqlite: (config) => createSqliteDriver(config),
};

/** Build the driver for a connection's configured provider (Theme C). */
export function driverFor(config: ConnectionConfig, password: string | undefined): DbDriver {
  return FACTORIES[config.provider](config, password);
}
