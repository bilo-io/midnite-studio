import { bridge, useFrameChrome } from '@midnite/studio-frame';
import type { ConnectionConfig } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

/**
 * Database logins: the connection's name, provider, host and user — the saved
 * password is never listed. Removing one (and its stored password) is
 * confirmed; editing a connection stays with the Database view.
 */
export function DbLoginsSection() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [connections, setConnections] = useState<ConnectionConfig[] | null>(null);

  const refresh = useCallback(async () => {
    const db = bridge()?.db;
    setConnections(db ? await db.listConnections() : []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = (connection: ConnectionConfig) =>
    dialogs.confirm({
      title: `Remove ${connection.name}?`,
      body: 'The connection and its saved password are deleted.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'secrets',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        void bridge()?.db.deleteConnection({ id: connection.id }).then(refresh);
      },
    });

  return (
    <section aria-labelledby="vault-db" className="rounded-lg border border-border p-4">
      <h2 id="vault-db" className="mb-3 text-sm font-medium">Database logins</h2>
      {connections?.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No saved connections. Until the runtime migration is switched on, this list is empty in a standalone Vault.
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {(connections ?? []).map((connection) => (
          <li key={connection.id} className="flex items-center gap-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{connection.name}</span>
              <span className="block text-muted-foreground">
                {connection.provider} · {connection.host ?? connection.sqlitePath ?? 'local'}
                {connection.username ? ` · ${connection.username}` : ''}
              </span>
            </span>
            <button type="button" onClick={() => remove(connection)}>Remove</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
