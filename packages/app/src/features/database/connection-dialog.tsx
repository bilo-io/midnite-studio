import { useRef, useState } from 'react';

import type { ConnectionConfig, DbProvider } from '@midnite/studio-shared';
import { LuLoaderCircle } from 'react-icons/lu';

import { useFocusTrap } from '../../components/use-focus-trap';
import { bridge } from '../../services/bridge';

/**
 * Add/edit form for a database connection, with a **Test connection** action.
 *
 * There is no test-connection UX anywhere else in the app today, so this is
 * assembled from three real cribs rather than a fourth invented shape:
 * structure from `council-create-dialog.tsx` (focus trap, `role="dialog"
 * aria-modal`, backdrop cancel, disabled-when-empty submit), the async-action
 * state machine from `agent/setup-dialog.tsx` (a `Phase` union, a spinner,
 * inline error — reusing the overlay/focus-trap/button conventions rather
 * than inventing a new modal system), and the password field from
 * `finance-panel.tsx`'s `WatchlistEditor` (`<input type="password">`).
 *
 * The form is provider-conditional: SQLite shows a file path and hides
 * host/port/username/password. SQLite has no driver yet (Theme C is out of
 * scope), so it is offered here as a contract-complete option without a way
 * to actually connect one — saving a SQLite connection is harmless (it just
 * cannot be queried yet).
 */

type Phase = 'idle' | 'testing' | 'ok' | 'error' | 'saving';

const PROVIDERS: { value: DbProvider; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
];

const DEFAULT_PORT: Partial<Record<DbProvider, number>> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mssql: 1433,
};

export function ConnectionDialog({
  connection,
  onCancel,
  onSaved,
}: {
  /** `null` for a new connection; an existing one to edit. */
  connection: ConnectionConfig | null;
  onCancel: () => void;
  onSaved: (config: ConnectionConfig) => void;
}) {
  const containerRef = useRef<HTMLFormElement>(null);
  useFocusTrap(containerRef, true);

  const [name, setName] = useState(connection?.name ?? '');
  const [provider, setProvider] = useState<DbProvider>(connection?.provider ?? 'postgres');
  const [host, setHost] = useState(connection?.host ?? '');
  const [port, setPort] = useState(connection?.port?.toString() ?? '');
  const [database, setDatabase] = useState(connection?.database ?? '');
  const [username, setUsername] = useState(connection?.username ?? '');
  const [password, setPassword] = useState('');
  const [sqlitePath, setSqlitePath] = useState(connection?.sqlitePath ?? '');

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const isSqlite = provider === 'sqlite';
  const empty =
    name.trim().length === 0 ||
    database.trim().length === 0 ||
    (isSqlite ? sqlitePath.trim().length === 0 : host.trim().length === 0);

  const buildConfig = (): ConnectionConfig => ({
    id: connection?.id ?? crypto.randomUUID(),
    name: name.trim(),
    provider,
    database: database.trim(),
    ...(isSqlite
      ? { sqlitePath: sqlitePath.trim() }
      : {
          host: host.trim(),
          ...(port.trim().length > 0 ? { port: Number(port) } : {}),
          ...(username.trim().length > 0 ? { username: username.trim() } : {}),
        }),
  });

  const test = async () => {
    const api = bridge();
    if (!api) {
      setPhase('error');
      setMessage('No connection to the app.');
      return;
    }
    setPhase('testing');
    setMessage(null);
    const result = await api.db.testConnection({
      connection: buildConfig(),
      ...(password.length > 0 ? { password } : {}),
    });
    if (result.ok) {
      setPhase('ok');
    } else {
      setPhase('error');
      setMessage(result.message);
    }
  };

  const save = async () => {
    if (empty) return;
    const api = bridge();
    if (!api) {
      setPhase('error');
      setMessage('No connection to the app.');
      return;
    }
    setPhase('saving');
    setMessage(null);
    const result = await api.db.saveConnection({
      connection: buildConfig(),
      ...(password.length > 0 ? { password } : {}),
    });
    if (result.ok) {
      onSaved(result.data);
    } else {
      setPhase('error');
      setMessage(result.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={connection ? 'Edit connection' : 'New connection'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 className="text-sm font-semibold">{connection ? 'Edit connection' : 'New connection'}</h2>

        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="db-conn-name">
          Name
        </label>
        <input
          id="db-conn-name"
          value={name}
          autoFocus
          placeholder="e.g. Local Postgres"
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="db-conn-provider">
          Provider
        </label>
        <select
          id="db-conn-provider"
          value={provider}
          onChange={(event) => {
            const next = event.target.value as DbProvider;
            setProvider(next);
            if (DEFAULT_PORT[next] !== undefined && port.trim().length === 0) {
              setPort(String(DEFAULT_PORT[next]));
            }
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {isSqlite ? (
          <>
            <label className="mt-3 block text-xs text-muted-foreground" htmlFor="db-conn-path">
              File path
            </label>
            <input
              id="db-conn-path"
              value={sqlitePath}
              placeholder="/path/to/app.db"
              onChange={(event) => setSqlitePath(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </>
        ) : (
          <>
            <div className="mt-3 flex gap-2">
              <label className="block flex-1 text-xs text-muted-foreground" htmlFor="db-conn-host">
                Host
                <input
                  id="db-conn-host"
                  value={host}
                  placeholder="localhost"
                  onChange={(event) => setHost(event.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
              <label className="block w-20 text-xs text-muted-foreground" htmlFor="db-conn-port">
                Port
                <input
                  id="db-conn-port"
                  value={port}
                  inputMode="numeric"
                  onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
            </div>

            <label className="mt-3 block text-xs text-muted-foreground" htmlFor="db-conn-username">
              Username
            </label>
            <input
              id="db-conn-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />

            <label className="mt-3 block text-xs text-muted-foreground" htmlFor="db-conn-password">
              Password
            </label>
            <input
              id="db-conn-password"
              type="password"
              value={password}
              placeholder={connection ? 'Unchanged' : ''}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </>
        )}

        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="db-conn-database">
          Database
        </label>
        <input
          id="db-conn-database"
          value={database}
          onChange={(event) => setDatabase(event.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        {message && (
          <p className={`mt-3 text-xs ${phase === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {message}
          </p>
        )}
        {phase === 'ok' && !message && (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">Connection succeeded.</p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={empty || isSqlite || phase === 'testing' || phase === 'saving'}
            onClick={() => void test()}
            className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {phase === 'testing' && <LuLoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Test connection
          </button>
          <button
            type="submit"
            disabled={empty || phase === 'saving'}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {phase === 'saving' && <LuLoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
