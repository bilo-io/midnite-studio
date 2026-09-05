import { useEffect, useState } from 'react';

import type { ConnectionConfig } from '@midnite/studio-shared';
import { LuDatabase, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { VIEW_ICON } from '../../components/nav-icons';
import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { ConnectionDialog } from './connection-dialog';
import { ConnectionListSkeleton } from './database-skeletons';

/**
 * The Database view's shell (Phase 61 Theme E): a connections list on the
 * left, add/edit/delete management, and a placeholder on the right for the
 * schema tree and query tabs later batches add (Themes F/G — explicitly out
 * of scope here).
 *
 * Reachable with no repository open — a database connection is not
 * repo-scoped (see `app.tsx`'s render-arm placement above the
 * `!selectedRepoId` guard).
 */
export function DatabaseView() {
  const status = useDatabaseConnectionsStore((s) => s.status);
  const connections = useDatabaseConnectionsStore((s) => s.connections);
  const error = useDatabaseConnectionsStore((s) => s.error);
  const selectedId = useDatabaseConnectionsStore((s) => s.selectedConnectionId);
  const select = useDatabaseConnectionsStore((s) => s.select);
  const remove = useDatabaseConnectionsStore((s) => s.remove);
  const upsert = useDatabaseConnectionsStore((s) => s.upsert);
  const load = useDatabaseConnectionsStore((s) => s.load);

  const [dialogFor, setDialogFor] = useState<ConnectionConfig | null | 'new'>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = connections.find((c) => c.id === selectedId) ?? null;
  const loadingFirstTime = status === 'loading' && connections.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Connections
        </h2>
        <button
          type="button"
          onClick={() => setDialogFor('new')}
          aria-label="New connection"
          className="ml-auto flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <LuPlus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {status === 'error' ? (
          <EmptyState
            icon={VIEW_ICON.database}
            title="Couldn't load connections"
            body={error ?? 'Something went wrong.'}
          />
        ) : loadingFirstTime ? (
          <div className="flex w-72 shrink-0 flex-col border-r border-border">
            <ConnectionListSkeleton />
          </div>
        ) : connections.length === 0 ? (
          <EmptyState
            icon={VIEW_ICON.database}
            title="No connections yet"
            body="Add a database connection to get started."
          />
        ) : (
          <>
            <div
              role="region"
              aria-label="Connections"
              className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border p-1"
            >
              <ul className="flex flex-col gap-0.5">
                {connections.map((connection) => (
                  <li key={connection.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 ${
                        connection.id === selectedId
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => select(connection.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <LuDatabase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm">{connection.name}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {connection.provider}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialogFor(connection)}
                        aria-label={`Edit ${connection.name}`}
                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                      >
                        <LuPencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(connection.id)}
                        aria-label={`Remove ${connection.name}`}
                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      >
                        <LuTrash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center p-8">
              {selected ? (
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  The schema tree and query editor for <span className="font-medium">{selected.name}</span>{' '}
                  are coming in a later phase.
                </p>
              ) : (
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  Select a connection to browse its schema and run queries.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {dialogFor !== null && (
        <ConnectionDialog
          connection={dialogFor === 'new' ? null : dialogFor}
          onCancel={() => setDialogFor(null)}
          onSaved={(config) => {
            upsert(config);
            select(config.id);
            setDialogFor(null);
          }}
        />
      )}
    </div>
  );
}
