import { useEffect, useState } from 'react';

import type { ForgeProjectField, ForgeProjectFieldValue, ForgeProjectWriteResult } from '@midnite/studio-shared';

import { useSetProjectItemField } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/**
 * One field's editor (Phase 40 Theme E, extracted for Phase 41 Theme B).
 *
 * Originally built inline in `projects-view.tsx`'s table — Theme E named no
 * exported symbol for it, and Phase 41's own doc predicted exactly this:
 * *"Do not assume Phase 40's inline editors are importable … if not, this
 * theme builds them and Phase 40's table should adopt these."* Extracted
 * rather than duplicated, so the table and the board's card detail pane
 * share one editor instead of drifting.
 *
 * **Not optimistic** — the house rule every forge write in this app follows:
 * the control disables while `gh` answers, then either the invalidated
 * refetch carries the new value back down, or `failureOf` renders `gh`'s own
 * sentence underneath. **Gated at the surface, not in the mutation** — a
 * disabled control that says why is the whole point; see
 * `review-action-bar.tsx`'s own note for the reasoning this reuses verbatim.
 */
export function ProjectFieldCell({
  projectId,
  itemId,
  field,
  value,
}: {
  projectId: string;
  itemId: string;
  field: ForgeProjectField;
  value: ForgeProjectFieldValue | undefined;
}) {
  const writesEnabled = useUiStore((s) => s.forgeWritesEnabled);
  const setField = useSetProjectItemField(projectId);
  const pending = setField.isPending;
  const problem = failureOf(setField.data);

  if (field.dataType === 'iteration') {
    return <span className="truncate text-muted-foreground">{formatFieldValue(value)}</span>;
  }

  const disabled = !writesEnabled || pending;
  const title = writesEnabled ? problem : 'Enable review actions in Settings → Reviews';
  const commit = (next: ForgeProjectFieldValue) => {
    if (!writesEnabled || sameValue(value, next)) return;
    setField.mutate({ itemId, fieldId: field.id, value: next });
  };

  return field.dataType === 'single_select' ? (
    <SingleSelectEditor field={field} value={value} disabled={disabled} title={title} onCommit={commit} />
  ) : (
    <TextLikeEditor field={field} value={value} disabled={disabled} title={title} onCommit={commit} />
  );
}

function SingleSelectEditor({
  field,
  value,
  disabled,
  title,
  onCommit,
}: {
  field: Extract<ForgeProjectField, { dataType: 'single_select' }>;
  value: ForgeProjectFieldValue | undefined;
  disabled: boolean;
  title: string | null;
  onCommit: (next: ForgeProjectFieldValue) => void;
}) {
  const optionId = value?.dataType === 'single_select' ? value.optionId : '';
  return (
    <select
      aria-label={field.name}
      value={optionId}
      disabled={disabled}
      title={title ?? undefined}
      onChange={(event) => {
        const option = field.options.find((o) => o.id === event.target.value);
        if (option) {
          onCommit({ fieldId: field.id, dataType: 'single_select', optionId: option.id, name: option.name });
        }
      }}
      className="w-full truncate rounded border border-transparent bg-transparent py-0.5 text-xs text-muted-foreground hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="" disabled>
        —
      </option>
      {field.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

/** Text, number and date all commit on blur through the same plain `<input>` shape. */
function TextLikeEditor({
  field,
  value,
  disabled,
  title,
  onCommit,
}: {
  field: Extract<ForgeProjectField, { dataType: 'text' | 'number' | 'date' }>;
  value: ForgeProjectFieldValue | undefined;
  disabled: boolean;
  title: string | null;
  onCommit: (next: ForgeProjectFieldValue) => void;
}) {
  const [draft, setDraft] = useState(() => draftFor(field, value));
  useEffect(() => setDraft(draftFor(field, value)), [field, value]);

  return (
    <input
      aria-label={field.name}
      type={field.dataType === 'number' ? 'number' : field.dataType === 'date' ? 'date' : 'text'}
      value={draft}
      disabled={disabled}
      title={title ?? undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = fieldValueFor(field, draft);
        if (next) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="w-full truncate rounded border border-transparent bg-transparent py-0.5 text-xs text-muted-foreground hover:border-border disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function draftFor(
  field: Extract<ForgeProjectField, { dataType: 'text' | 'number' | 'date' }>,
  value: ForgeProjectFieldValue | undefined,
): string {
  if (!value) return '';
  if (field.dataType === 'text' && value.dataType === 'text') return value.text;
  if (field.dataType === 'number' && value.dataType === 'number') return String(value.number);
  if (field.dataType === 'date' && value.dataType === 'date') return value.date;
  return '';
}

function fieldValueFor(
  field: Extract<ForgeProjectField, { dataType: 'text' | 'number' | 'date' }>,
  draft: string,
): ForgeProjectFieldValue | null {
  if (field.dataType === 'text') return { fieldId: field.id, dataType: 'text', text: draft };
  if (field.dataType === 'number') {
    const number = Number(draft);
    return draft.trim().length > 0 && !Number.isNaN(number)
      ? { fieldId: field.id, dataType: 'number', number }
      : null;
  }
  return draft.length > 0 ? { fieldId: field.id, dataType: 'date', date: draft } : null;
}

function sameValue(a: ForgeProjectFieldValue | undefined, b: ForgeProjectFieldValue): boolean {
  if (!a || a.dataType !== b.dataType) return false;
  switch (b.dataType) {
    case 'text':
      return a.dataType === 'text' && a.text === b.text;
    case 'number':
      return a.dataType === 'number' && a.number === b.number;
    case 'date':
      return a.dataType === 'date' && a.date === b.date;
    case 'single_select':
      return a.dataType === 'single_select' && a.optionId === b.optionId;
    default:
      return false;
  }
}

/**
 * The sentence a finished-and-refused write has to say, if any.
 *
 * Reads the mutation's own `data` rather than `error` — `ForgeProjectWriteResult`
 * never rejects, so a refusal is a value, not a throw — mirroring
 * `review-action-bar.tsx`'s own `failureOf`.
 */
function failureOf(result: ForgeProjectWriteResult | undefined): string | null {
  if (result === undefined || result.ok) return null;
  return result.kind === 'insufficient-scope' ? result.hint : result.message;
}

/** The read-only rendering of a field value — the table's non-editable columns and `iteration`. */
export function formatFieldValue(value: ForgeProjectFieldValue | undefined): string {
  if (!value) return '';
  switch (value.dataType) {
    case 'text':
      return value.text;
    case 'number':
      return String(value.number);
    case 'date':
      return value.date;
    case 'single_select':
      return value.name;
    case 'iteration':
      return value.title;
    default:
      return '';
  }
}
