import { useMemo, useState } from 'react';

import { FilterInput } from '@midnite/studio-frame';

import { InfoTip } from './info-tip';
import { FOCUS_RING } from './ui';

export interface ChecklistItem {
  /** The stored key (a tool id or a skill name). */
  key: string;
  title: string;
  /** A mono id shown after the title, when it differs from it. */
  id?: string;
  /** The info popover's text. */
  info?: string;
  /** A small badge, such as a skill's scope. */
  badge?: string;
  /** Ticked in the saved agent but no longer listed. */
  missing?: boolean;
}

/**
 * A bordered, filterable checklist with a sticky header (filter, Select all, Select none, count).
 * Renders every item: the longest list (the MCP tools) is around 150 rows, which needs no virtualisation.
 * "Select all" and "Select none" act on the rows the filter leaves visible.
 */
export function Checklist({
  label,
  items,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  items: ChecklistItem[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () => (needle === '' ? items : items.filter((i) => i.title.toLowerCase().includes(needle) || (i.id ?? i.key).toLowerCase().includes(needle))),
    [items, needle],
  );
  const set = new Set(selected);
  const toggle = (key: string): void => onChange(set.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <div
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`max-h-72 overflow-y-auto rounded-md border border-border ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-border bg-background px-2 py-1">
        <FilterInput value={filter} onChange={setFilter} placeholder={`Filter ${label.toLowerCase()}…`} className="w-44" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...new Set([...selected, ...visible.map((i) => i.key)])])}
          className={`rounded text-[11px] underline-offset-2 hover:underline ${FOCUS_RING}`}
        >
          Select all
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const drop = new Set(visible.map((i) => i.key));
            onChange(selected.filter((k) => !drop.has(k)));
          }}
          className={`rounded text-[11px] underline-offset-2 hover:underline ${FOCUS_RING}`}
        >
          Select none
        </button>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{selected.length} selected</span>
      </div>
      {visible.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">Nothing matches.</p> : null}
      {visible.map((item) => (
        <div key={item.key} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent/40">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="checkbox"
              disabled={disabled}
              checked={set.has(item.key)}
              onChange={() => toggle(item.key)}
              className={`accent-[hsl(var(--primary))] ${FOCUS_RING}`}
            />
            <span className="truncate">{item.title}</span>
            {item.id !== undefined && item.id !== item.title ? (
              <span className="truncate font-mono text-[10px] text-muted-foreground">{item.id}</span>
            ) : null}
            {item.badge ? <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{item.badge}</span> : null}
            {item.missing ? <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">not found</span> : null}
          </label>
          {item.info ? <InfoTip label={item.title} text={item.info} /> : null}
        </div>
      ))}
    </div>
  );
}
