import { useMemo, useRef, useState } from 'react';

import type { DbProvider } from '@midnite/studio-shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LuDownload, LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { useSchemaTree } from '../../services/queries';
import { useQueryRun } from '../../store/query-results-store';
import { detectEditableTable } from './detect-editable-table';
import { placeholderFor, quoteIdentifier, quoteQualifiedTable } from './quote-identifier';
import { runStatement } from './run-statement';

const ROW_HEIGHT = 28;
/**
 * Decision 10: rows virtualise, columns do not, up to a cap. 60 covers the
 * common `SELECT *` case; a genuinely 200-column result is a report, not a
 * browse, and gets a "N columns hidden" affordance instead of a second
 * virtualizer axis this repo has never built (`grep -rn "columnVirtualizer"` → 0).
 */
const MAX_COLUMNS = 60;

/** `${rowIndex}:${columnIndex}` → the pending edit's new value. */
type PendingEdits = Map<string, string>;

function editKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * The query tab's results — virtualized, with inline editing when the
 * result set is provably one real table's rows (Theme F's PK metadata via
 * `detectEditableTable`).
 *
 * Copies the recipe at `projects-view.tsx:366-372` (fixed `estimateSize`,
 * `overscan: 24`, sticky flex header, absolute rows via `translateY`) rather
 * than any component — there is no generic table component in this repo to
 * reuse (`ProjectItemsTable` is module-local with Projects domain types
 * baked into its props).
 */
export function ResultsGrid({
  tabId,
  connectionId,
  provider,
  sql,
}: {
  tabId: string;
  connectionId: string;
  provider: DbProvider;
  sql: string;
}) {
  const run = useQueryRun(tabId);
  const schemaTree = useSchemaTree(connectionId, true);
  const editableTable = useMemo(
    () => detectEditableTable(sql, schemaTree.data),
    [sql, schemaTree.data],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdits>(new Map());
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [conflictRows, setConflictRows] = useState<ReadonlySet<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const columns = run.columns;
  const visibleColumnCount = Math.min(columns.length, MAX_COLUMNS);
  const hiddenColumnCount = columns.length - visibleColumnCount;

  const virtualizer = useVirtualizer({
    count: run.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 24,
  });

  if (run.error) {
    return (
      <EmptyState
        icon={LuTriangleAlert}
        title="Query failed"
        body={run.error}
      />
    );
  }

  if (!run.loading && run.rows.length === 0 && run.requestId === null) {
    return (
      <EmptyState
        title="No results yet"
        body="Run this query to see its rows here."
      />
    );
  }

  const startEdit = (row: number, col: number) => {
    if (!editableTable || editableTable.primaryKeyColumns.includes(columns[col] ?? '')) return;
    setEditingCell({ row, col });
  };

  const commitEdit = (row: number, col: number, value: string) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      next.set(editKey(row, col), value);
      return next;
    });
    setEditingCell(null);
  };

  const exportCsv = () => {
    const escape = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      columns.map(escape).join(','),
      ...run.rows.map((row) => row.map(escape).join(',')),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'query-results.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Submit every pending edit, one row at a time. Per row (Decision 2): a
   * staleness re-`SELECT` of the edited columns by primary key, compared
   * against this grid's own in-memory snapshot of that row — a mismatch
   * marks the row as a conflict and skips its `UPDATE` rather than
   * overwriting a value that changed underneath. The re-`SELECT` and the
   * `UPDATE` are two sequential calls on the connection's pooled driver, not
   * wrapped in an explicit transaction — see this PR's own notes on why that
   * narrows the guarantee against a genuinely concurrent external writer.
   */
  const submitEdits = async () => {
    if (!editableTable || pendingEdits.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    const byRow = new Map<number, Map<number, string>>();
    for (const [key, value] of pendingEdits) {
      const [rowPart, colPart] = key.split(':');
      const rowIndex = Number(rowPart);
      const colIndex = Number(colPart);
      if (!byRow.has(rowIndex)) byRow.set(rowIndex, new Map());
      byRow.get(rowIndex)!.set(colIndex, value);
    }

    const pkIndexes = editableTable.primaryKeyColumns.map((pk) => columns.indexOf(pk));
    const table = quoteQualifiedTable(provider, editableTable);
    const nextConflicts = new Set(conflictRows);
    const applied: string[] = [];

    for (const [rowIndex, edits] of byRow) {
      const originalRow = run.rows[rowIndex];
      if (!originalRow || pkIndexes.some((i) => i === -1)) continue;
      const editedColumnIndexes = [...edits.keys()];
      const editedColumnNames = editedColumnIndexes.map((i) => columns[i] ?? '');
      const pkValues = pkIndexes.map((i) => originalRow[i]);

      const whereClause = editableTable.primaryKeyColumns
        .map((pk, i) => `${quoteIdentifier(provider, pk)} = ${placeholderFor(provider, i)}`)
        .join(' AND ');
      const selectSql = `SELECT ${editedColumnNames.map((c) => quoteIdentifier(provider, c)).join(', ')} FROM ${table} WHERE ${whereClause}`;
      const staleCheck = await runStatement(connectionId, selectSql, pkValues);
      const currentValues = staleCheck.rows[0];
      const stillMatches =
        !staleCheck.error &&
        currentValues !== undefined &&
        editedColumnIndexes.every((colIndex, position) => {
          const current = currentValues[position];
          const original = originalRow[colIndex];
          // String-compared rather than `===`: the DB's re-SELECT and the
          // originally streamed value may differ in JS type (a number vs.
          // its string form) for the same underlying SQL value without the
          // row having actually changed.
          return (current === null ? '' : String(current)) === (original === null ? '' : String(original));
        });

      if (!stillMatches) {
        nextConflicts.add(rowIndex);
        continue;
      }

      const setClause = editedColumnIndexes
        .map((colIndex, position) => `${quoteIdentifier(provider, columns[colIndex] ?? '')} = ${placeholderFor(provider, position)}`)
        .join(', ');
      const updateWhere = editableTable.primaryKeyColumns
        .map((pk, i) => `${quoteIdentifier(provider, pk)} = ${placeholderFor(provider, editedColumnIndexes.length + i)}`)
        .join(' AND ');
      const updateSql = `UPDATE ${table} SET ${setClause} WHERE ${updateWhere}`;
      const updateParams = [...editedColumnIndexes.map((i) => edits.get(i)), ...pkValues];
      const result = await runStatement(connectionId, updateSql, updateParams);
      if (result.error) {
        setSubmitError(result.error);
      } else {
        applied.push(...editedColumnIndexes.map((i) => editKey(rowIndex, i)));
      }
    }

    setConflictRows(nextConflicts);
    setPendingEdits((prev) => {
      const next = new Map(prev);
      for (const key of applied) next.delete(key);
      return next;
    });
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
        <span>
          {run.loading ? 'Running…' : `${run.rowCount} row${run.rowCount === 1 ? '' : 's'}`}
          {run.durationMs !== null ? ` · ${run.durationMs}ms` : ''}
        </span>
        {run.truncated ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <LuTriangleAlert aria-hidden className="h-3 w-3" />
            Showing first {run.rowCount.toLocaleString()} rows
          </span>
        ) : null}
        {pendingEdits.size > 0 ? (
          <button
            type="button"
            onClick={() => void submitEdits()}
            disabled={submitting}
            className="ml-auto flex items-center gap-1 rounded border border-input px-2 py-0.5 text-foreground disabled:opacity-50"
          >
            {submitting && <LuLoaderCircle className="h-3 w-3 animate-spin" aria-hidden />}
            Submit {pendingEdits.size} edit{pendingEdits.size === 1 ? '' : 's'}
          </button>
        ) : (
          <button
            type="button"
            onClick={exportCsv}
            disabled={run.rows.length === 0}
            className={`flex items-center gap-1 rounded border border-input px-2 py-0.5 text-foreground disabled:opacity-50 ${pendingEdits.size > 0 ? '' : 'ml-auto'}`}
          >
            <LuDownload aria-hidden className="h-3 w-3" />
            Export CSV
          </button>
        )}
      </div>

      {submitError ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {submitError}
        </p>
      ) : null}

      {!editableTable && run.rows.length > 0 ? (
        <p className="shrink-0 border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
          Editing is off — this result isn't a plain, single-table `SELECT *` with a detected primary key.
        </p>
      ) : null}

      <div className="flex shrink-0 border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground">
        {columns.slice(0, visibleColumnCount).map((column, index) => (
          <span key={`${column}-${index}`} className="w-40 shrink-0 truncate px-2 py-1">
            {column}
          </span>
        ))}
        {hiddenColumnCount > 0 ? (
          <span className="shrink-0 px-2 py-1 italic">{hiddenColumnCount} columns hidden</span>
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = run.rows[virtualRow.index];
            if (!row) return null;
            const isConflict = conflictRows.has(virtualRow.index);
            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                className={`absolute left-0 top-0 flex w-full items-stretch border-b border-border/60 text-xs ${isConflict ? 'bg-destructive/10' : ''}`}
                style={{ transform: `translateY(${virtualRow.start}px)`, height: ROW_HEIGHT }}
              >
                {row.slice(0, visibleColumnCount).map((cell, colIndex) => {
                  const key = editKey(virtualRow.index, colIndex);
                  const pending = pendingEdits.get(key);
                  const isEditing = editingCell?.row === virtualRow.index && editingCell.col === colIndex;
                  const isPk = editableTable?.primaryKeyColumns.includes(columns[colIndex] ?? '') ?? false;

                  if (isEditing) {
                    return (
                      <input
                        key={colIndex}
                        autoFocus
                        defaultValue={pending ?? (cell === null ? '' : String(cell))}
                        onBlur={(event) => commitEdit(virtualRow.index, colIndex, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') setEditingCell(null);
                        }}
                        className="w-40 shrink-0 border-0 bg-accent px-2 py-1 text-xs outline-none"
                      />
                    );
                  }

                  return (
                    <button
                      type="button"
                      key={colIndex}
                      onDoubleClick={() => startEdit(virtualRow.index, colIndex)}
                      className={`flex w-40 shrink-0 items-center truncate px-2 py-1 text-left ${
                        pending !== undefined ? 'bg-amber-500/10' : ''
                      } ${isPk ? 'font-medium' : ''}`}
                    >
                      {pending !== undefined && (
                        <span aria-label="Unsaved edit" className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" />
                      )}
                      <span className="truncate">{cell === null ? '' : String(cell)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
