import { useMemo, useState } from 'react';

import type { DbProvider, SchemaColumn, SchemaTable } from '@midnite/studio-shared';
import { LuEye, LuKey, LuLayers, LuLink, LuPlay, LuSquareTerminal, LuTable2 } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { TreeSection } from '../../components/tree-section';
import { TREE_INDENT } from '../../components/tree-indent';
import { VIEW_ICON } from '../../components/nav-icons';
import { useSchemaTree } from '../../services/queries';
import { SchemaTreeSkeleton } from './database-skeletons';
import { quoteQualifiedTable } from './quote-identifier';

/**
 * A connection's schema tree (Phase 61 Theme F): tables and views, grouped by
 * namespace where the provider has one, each expandable to its columns with
 * primary/foreign-key markers.
 *
 * **`sectionOpen` is not decoration** — the same fold-AND guard
 * `forge-sections.tsx`'s `ReviewsGroup` established: `TreeSection` renders its
 * children into a `<Collapse>` that keeps them mounted while closed, so a
 * schema view left expanded from a previous visit would keep issuing
 * `dbGetSchema` while the section that hosts it (a future outer collapse) is
 * shut. `useSchemaTree`'s `enabled` flag is `sectionOpen && open`, exactly
 * that precedent's shape, even though today's only caller
 * (`database-view.tsx`) always passes `sectionOpen` at its default.
 *
 * The connection row's "Open query tab" action and each table's "Preview
 * data" action (Theme G) both land here: a blank query tab against this
 * connection, or one pre-filled with `SELECT * FROM <table> LIMIT 200`
 * against it, its identifier quoted per provider — never interpolated raw.
 */
export function ConnectionTree({
  connectionId,
  connectionName,
  provider,
  sectionOpen = true,
  onOpenQueryTab,
  onPreviewTable,
}: {
  connectionId: string;
  connectionName: string;
  provider: DbProvider;
  /** Whether an ancestor section (if any) is itself open. Defaults to true for a standalone mount. */
  sectionOpen?: boolean;
  onOpenQueryTab: () => void;
  onPreviewTable: (table: SchemaTable) => void;
}) {
  const [open, setOpen] = useState(true);

  const { data, isLoading, isError, error } = useSchemaTree(connectionId, sectionOpen && open);

  const groups = useMemo(() => groupBySchema(data?.tables ?? []), [data]);

  return (
    <TreeSection
      title={connectionName}
      icon={<VIEW_ICON.database aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      hideWhenEmpty={false}
      action={{ label: 'Open query tab', onClick: onOpenQueryTab, icon: LuSquareTerminal }}
    >
      {!sectionOpen || !open ? null : isLoading ? (
        <SchemaTreeSkeleton />
      ) : isError ? (
        <div className={TREE_INDENT[1]}>
          <EmptyState
            title="Couldn't load the schema"
            body={error instanceof Error ? error.message : 'Something went wrong.'}
            bodySize="xs"
          />
        </div>
      ) : groups.length === 0 ? (
        <p className={`${TREE_INDENT[1]} py-1 text-xs text-muted-foreground`}>
          No tables or views.
        </p>
      ) : (
        groups.map((group) => (
          <SchemaGroup
            key={group.schema ?? ''}
            schema={group.schema}
            tables={group.tables}
            provider={provider}
            onPreviewTable={onPreviewTable}
          />
        ))
      )}
    </TreeSection>
  );
}

type Group = { schema: string | undefined; tables: SchemaTable[] };

/**
 * Group tables by their `schema` namespace, preserving first-seen order.
 * When no table carries one (MySQL/MariaDB/SQLite have no such namespace),
 * this collapses to a single unnamed group and the schema-level `TreeSection`
 * is skipped entirely — there is nothing to name it.
 */
function groupBySchema(tables: readonly SchemaTable[]): Group[] {
  const order: (string | undefined)[] = [];
  const bySchema = new Map<string | undefined, SchemaTable[]>();
  for (const table of tables) {
    const key = table.schema;
    if (!bySchema.has(key)) {
      bySchema.set(key, []);
      order.push(key);
    }
    bySchema.get(key)!.push(table);
  }
  return order.map((schema) => ({ schema, tables: bySchema.get(schema)! }));
}

function SchemaGroup({
  schema,
  tables,
  provider,
  onPreviewTable,
}: {
  schema: string | undefined;
  tables: SchemaTable[];
  provider: DbProvider;
  onPreviewTable: (table: SchemaTable) => void;
}) {
  const [open, setOpen] = useState(true);

  // No namespace to group by — render the tables directly at depth 1, one
  // level shallower than the named-schema case below.
  if (schema === undefined) {
    return (
      <>
        {tables.map((table) => (
          <TableRow
            key={`${table.schema ?? ''}.${table.name}`}
            table={table}
            depth={1}
            provider={provider}
            onPreviewTable={onPreviewTable}
          />
        ))}
      </>
    );
  }

  return (
    <TreeSection
      title={schema}
      icon={<LuLayers aria-hidden className="h-3 w-3 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      depth={1}
      hideWhenEmpty={false}
    >
      {tables.map((table) => (
        <TableRow
          key={`${table.schema ?? ''}.${table.name}`}
          table={table}
          depth={2}
          provider={provider}
          onPreviewTable={onPreviewTable}
        />
      ))}
    </TreeSection>
  );
}

function TableRow({
  table,
  depth,
  provider,
  onPreviewTable,
}: {
  table: SchemaTable;
  depth: 1 | 2;
  provider: DbProvider;
  onPreviewTable: (table: SchemaTable) => void;
}) {
  const [open, setOpen] = useState(false);
  const columnDepth = (depth + 1) as 2 | 3;

  return (
    <TreeSection
      title={table.name}
      icon={
        table.kind === 'view' ? (
          <LuEye aria-hidden className="h-3 w-3 text-muted-foreground" />
        ) : (
          <LuTable2 aria-hidden className="h-3 w-3 text-muted-foreground" />
        )
      }
      count={table.columns.length}
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      depth={depth}
      hideWhenEmpty={false}
      action={{ label: 'Preview data', onClick: () => onPreviewTable(table), icon: LuPlay }}
    >
      <ul className={`${TREE_INDENT[columnDepth]} flex flex-col`}>
        {table.columns.map((column) => (
          <ColumnRow key={column.name} column={column} />
        ))}
      </ul>
    </TreeSection>
  );
}

/** `SELECT * FROM <table> LIMIT 200`, identifier-quoted per provider — never interpolated raw. */
export function previewSql(provider: DbProvider, table: SchemaTable): string {
  return `SELECT * FROM ${quoteQualifiedTable(provider, table)} LIMIT 200`;
}

function ColumnRow({ column }: { column: SchemaColumn }) {
  return (
    <li className="flex h-6 items-center gap-1.5 pr-2 text-xs">
      {column.isPrimaryKey ? (
        <LuKey aria-label="Primary key" className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : column.references ? (
        <LuLink
          aria-label={`Foreign key to ${column.references.table}.${column.references.column}`}
          className="h-3 w-3 shrink-0 text-sky-600 dark:text-sky-400"
        />
      ) : (
        <span className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{column.name}</span>
      <span className="shrink-0 text-muted-foreground/70">
        {column.type}
        {column.nullable ? '' : ' NOT NULL'}
      </span>
    </li>
  );
}
