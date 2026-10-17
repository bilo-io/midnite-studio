import type { ComponentType } from 'react';

import type { DatabaseManifest } from '../manifest';

/**
 * The Database feature's renderer half (Phase 113 Theme O): the Database view — connections list,
 * schema tree, query tabs, editor and results grid — and its three stores. Needs the frame (bridge,
 * chrome port, resizable panes) and its own {@link DatabaseHost}.
 */
export { databaseManifest, type DatabaseManifest } from '../manifest';
export {
  DatabaseHostProvider,
  useDatabaseHost,
  type DatabaseHost,
  type DatabasePaneKey,
  type DatabasePaneSize,
  type DatabaseQueryEditorProps,
  type DatabaseTooltipProps,
  type DatabaseTreeSectionProps,
} from './host';
export {
  createStandaloneDatabaseHost,
  PlainQueryEditor,
  PlainTooltip,
  type StandaloneDatabaseHostOptions,
} from './standalone-host';
export { dbSchemaKey, useSchemaTree } from './database-queries';
// The stores the app reads around the view: the cross-window tab sync, the companion's reveal.
export { useDatabaseConnectionsStore } from './database-connections-store';
export { useQueryResultsStore, useQueryRun, EMPTY_QUERY_RUN, type QueryRunState } from './query-results-store';
export { tabId as workbenchTabId, useWorkbenchStore, type WorkbenchTab } from './workbench-store';
// Opening a query tab from outside the view, and a table's preview statement.
export { openQueryTab } from './use-database-tabs';
export { previewSql } from './connection-tree';

type ViewIds = DatabaseManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const databaseViews = {
  database: () => import('./database-view').then((m) => m.DatabaseView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
