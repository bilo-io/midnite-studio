import { lazy, Suspense, useEffect, useState } from 'react';

import type { ConnectionConfig, SchemaTable } from '@midnite/studio-shared';
import { LuDatabase, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { VIEW_ICON } from '../../components/nav-icons';
import { PageDetachMark } from '../../components/page-detach-mark';
import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { useWorkbenchStore, type WorkbenchTab } from '../../store/workbench-store';
import { TabStrip } from '../workbench/tab-strip';
import { ConnectionDialog } from './connection-dialog';
import { ConnectionTree, previewSql } from './connection-tree';
import { ConnectionListSkeleton } from './database-skeletons';
import { ResultsGrid } from './results-grid';
import { useStatementConfirm } from './statement-confirm';
import { nextQueryLabel, openQueryTab } from './use-database-tabs';
import { cancelQuery, runQuery, useQueryStreamEvents } from './use-query-stream';

// Lazy, like `file-preview.tsx`'s own `CodeEditor` — `query-editor.tsx` pulls
// in `monaco-editor` at module scope (`void getMonaco()`, mirroring
// `code-editor.tsx`'s identical top-of-module call), which jsdom cannot
// evaluate cleanly (`document.queryCommandSupported` does not exist there).
// A static import would eagerly evaluate that module the instant anything
// imports `database-view.tsx` at all, Monaco or no query tab open.
const QueryEditor = lazy(() => import('./query-editor').then((m) => ({ default: m.QueryEditor })));

type QueryTab = Extract<WorkbenchTab, { kind: 'query' }>;

/**
 * The Database view's shell: a connections list and, for the selected
 * connection, its schema tree (left) — the tab mechanism named in the brief,
 * its own `<TabStrip>` instance filtered to `kind === 'query'` per Decision
 * 7, each tab's editor above its streamed results grid (right).
 *
 * The query workspace on the right is NOT gated on a selected connection —
 * a query tab, once opened, keeps its own `connectionId` and outlives
 * whatever the sidebar currently highlights (Verification: query tabs are
 * not repo-scoped, and by the same reasoning not "currently selected
 * connection"-scoped either).
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

  // Subscribes to dbQueryBatch/dbQueryDone once for the view's lifetime —
  // NOT per active tab, so a background tab's run keeps streaming while
  // another tab is focused. See use-query-stream.ts's own docblock.
  useQueryStreamEvents();

  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeQueryTabId = useWorkbenchStore((s) => s.activeQueryTabId);
  const focusTab = useWorkbenchStore((s) => s.focusTab);
  const closeTab = useWorkbenchStore((s) => s.closeTab);
  const updateQueryTabSql = useWorkbenchStore((s) => s.updateQueryTabSql);
  const dirtyQueryTabIds = useWorkbenchStore((s) => s.dirtyQueryTabIds);

  const queryTabs = tabs.filter((tab): tab is QueryTab => tab.kind === 'query');
  const activeQueryTab = queryTabs.find((tab) => tab.id === activeQueryTabId) ?? null;

  const confirmStatement = useStatementConfirm();

  const selected = connections.find((c) => c.id === selectedId) ?? null;
  const loadingFirstTime = status === 'loading' && connections.length === 0;

  const runActiveTab = () => {
    if (!activeQueryTab) return;
    const connection = connections.find((c) => c.id === activeQueryTab.connectionId);
    confirmStatement({
      sql: activeQueryTab.sql,
      connectionName: connection?.name ?? activeQueryTab.connectionId,
      onRun: () => runQuery(activeQueryTab.id, activeQueryTab.connectionId, activeQueryTab.sql),
    });
  };

  const openBlankTab = (connectionId: string) => {
    openQueryTab({ connectionId, label: nextQueryLabel(connectionId) });
  };

  const previewTable = (connectionId: string, provider: ConnectionConfig['provider'], table: SchemaTable) => {
    openQueryTab({ connectionId, label: table.name, sql: previewSql(provider, table) });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-1.5 py-1">
        <PageDetachMark role="database" />
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
              className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border"
            >
              <ul className="flex flex-col gap-0.5 p-1">
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

              {selected ? (
                <div className="min-h-0 flex-1 border-t border-border pt-1">
                  <ConnectionTree
                    // Remounts the tree (and its fetch) on connection switch —
                    // simpler and just as correct as diffing props on the same
                    // instance, since only one connection is ever selected here.
                    key={selected.id}
                    connectionId={selected.id}
                    connectionName={selected.name}
                    provider={selected.provider}
                    onOpenQueryTab={() => openBlankTab(selected.id)}
                    onPreviewTable={(table) => previewTable(selected.id, selected.provider, table)}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <TabStrip
                tabs={queryTabs}
                activeTabId={activeQueryTabId}
                onFocus={focusTab}
                onClose={(id) => {
                  cancelQuery(id);
                  closeTab(id);
                }}
                onNew={selected ? () => openBlankTab(selected.id) : undefined}
                dirtyTabIds={dirtyQueryTabIds}
              />
              <div className="min-h-0 flex-1">
                {activeQueryTab ? (
                  <div key={activeQueryTab.id} className="flex h-full min-h-0 flex-col">
                    <div className="h-1/2 min-h-0 border-b border-border">
                      <Suspense fallback={null}>
                        <QueryEditor
                          sql={activeQueryTab.sql}
                          onChange={(sql) => updateQueryTabSql(activeQueryTab.id, sql)}
                          onRunChord={runActiveTab}
                        />
                      </Suspense>
                    </div>
                    <div className="h-1/2 min-h-0">
                      <ResultsGrid
                        tabId={activeQueryTab.id}
                        connectionId={activeQueryTab.connectionId}
                        provider={
                          connections.find((c) => c.id === activeQueryTab.connectionId)?.provider ?? 'postgres'
                        }
                        sql={activeQueryTab.sql}
                      />
                    </div>
                    <div className="flex shrink-0 items-center justify-end border-t border-border px-2 py-1">
                      <button
                        type="button"
                        onClick={runActiveTab}
                        className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground"
                      >
                        Run
                      </button>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={VIEW_ICON.database}
                    title="No query tab open"
                    body={
                      selected
                        ? 'Open a query tab from the connection above, or preview a table.'
                        : 'Select a connection to open a query tab.'
                    }
                  />
                )}
              </div>
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
