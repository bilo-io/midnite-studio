import { LuPlus, LuTrash2 } from 'react-icons/lu';

import type { KeyValueRow } from '@midnite/studio-shared';

import type { ComputedField } from './computed-fields';

/**
 * A key/value row list (Phase 66 Theme D) — Params and Headers reuse this
 * directly, and `body-tab.tsx`'s `urlencoded` mode reuses it over the same
 * `KeyValueRow` shape (`form-data`'s extra `type: 'text'|'file'` column is
 * `FormDataTable`, below, rather than a prop on this one: threading an
 * optional per-row column through this component's row markup would cost
 * every other caller a conditional it has no use for).
 *
 * `computedRows`, when given, render greyed and non-editable above the
 * user's own rows under an "Auto-generated" label — Headers' `Host`/
 * `Content-Length`/`Content-Type` trio and Params' `apikey`/`in:'query'`
 * contribution, both from `computed-fields.ts`. They are display-only: they
 * never appear in `rows` and `onChange` never sees them.
 */
export function KeyValueTable({
  rows,
  onChange,
  computedRows = [],
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  addLabel = 'Add row',
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  computedRows?: ComputedField[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}) {
  const update = (index: number, patch: Partial<KeyValueRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { key: '', value: '', enabled: true }]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-xs">
      {computedRows.length > 0 ? (
        <div className="mb-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Auto-generated
          </p>
          <div className="flex flex-col gap-0.5">
            {computedRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2 py-0.5 opacity-60">
                <input type="checkbox" checked disabled className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <input
                  value={row.key}
                  disabled
                  aria-label={`Auto-generated ${row.key}`}
                  className="h-6 w-1/3 shrink-0 rounded border border-border bg-muted px-1.5 font-mono text-[11px]"
                />
                <input
                  value={row.value}
                  disabled
                  aria-label={`Auto-generated ${row.key} value`}
                  className="h-6 min-w-0 flex-1 rounded border border-border bg-muted px-1.5 font-mono text-[11px]"
                />
                <span className="h-6 w-6 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(event) => update(index, { enabled: event.target.checked })}
              aria-label={`Enabled row ${index + 1}`}
              className="h-3.5 w-3.5 shrink-0"
            />
            <input
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder={keyPlaceholder}
              aria-label={`${keyPlaceholder} ${index + 1}`}
              className="h-6 w-1/3 shrink-0 rounded border border-border bg-background px-1.5 font-mono text-[11px]"
            />
            <input
              value={row.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder={valuePlaceholder}
              aria-label={`${valuePlaceholder} ${index + 1}`}
              className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove row ${index + 1}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
            >
              <LuTrash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-2 flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
      >
        <LuPlus className="h-3 w-3" aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}

/** A `form-data` row: {@link KeyValueRow} plus which of the two Postman
 *  part kinds it is. A `file` row's `value` is an absolute path, never
 *  bytes — the renderer does not read the file either way; Theme E's send
 *  engine (out of this component's scope) is what would. */
export type FormDataRow = KeyValueRow & { type: 'text' | 'file' };

/**
 * The `form-data` body mode's own table — a `KeyValueTable` plus a per-row
 * text/file toggle and, for a file row, a "Choose File…" button reusing the
 * same `apiPickBinaryFile` picker the `binary` body mode's own field opens.
 * Kept separate from `KeyValueTable` rather than threading an optional
 * column through it — see that component's own note.
 */
export function FormDataTable({
  rows,
  onChange,
  onPickFile,
}: {
  rows: FormDataRow[];
  onChange: (rows: FormDataRow[]) => void;
  onPickFile: () => Promise<string | null>;
}) {
  const update = (index: number, patch: Partial<FormDataRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { key: '', value: '', enabled: true, type: 'text' }]);

  const pickFileFor = (index: number) => {
    void onPickFile().then((path) => {
      if (path) update(index, { value: path });
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-xs">
      <div className="flex flex-col gap-0.5">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(event) => update(index, { enabled: event.target.checked })}
              aria-label={`Enabled row ${index + 1}`}
              className="h-3.5 w-3.5 shrink-0"
            />
            <input
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder="Key"
              aria-label={`Key ${index + 1}`}
              className="h-6 w-1/4 shrink-0 rounded border border-border bg-background px-1.5 font-mono text-[11px]"
            />
            <select
              value={row.type}
              onChange={(event) => update(index, { type: event.target.value as FormDataRow['type'], value: '' })}
              aria-label={`Type ${index + 1}`}
              className="h-6 shrink-0 rounded border border-border bg-background px-1 text-[11px]"
            >
              <option value="text">Text</option>
              <option value="file">File</option>
            </select>
            {row.type === 'file' ? (
              <button
                type="button"
                onClick={() => pickFileFor(index)}
                className="h-6 min-w-0 flex-1 truncate rounded border border-border bg-background px-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent"
              >
                {row.value || 'Choose File…'}
              </button>
            ) : (
              <input
                value={row.value}
                onChange={(event) => update(index, { value: event.target.value })}
                placeholder="Value"
                aria-label={`Value ${index + 1}`}
                className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 font-mono text-[11px]"
              />
            )}
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove row ${index + 1}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
            >
              <LuTrash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-2 flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
      >
        <LuPlus className="h-3 w-3" aria-hidden />
        Add field
      </button>
    </div>
  );
}
