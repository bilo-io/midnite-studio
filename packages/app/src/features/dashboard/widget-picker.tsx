import { useMemo, useState } from 'react';

import { LuCheck, LuPlus, LuSearch } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import type { IconComponent } from '../../components/icon-button';
import type { WidgetId } from './widget-ids';
import { groupWidgets, type WidgetSpec } from './widget-registry';

/**
 * The header "Add widget" button — midnite's `WidgetPickerMenu`: the whole
 * catalogue grouped by category, a search box over title and description, and
 * widgets already on the board shown checked and disabled (a panel is added at
 * most once). Picking one adds it and leaves the menu open, so several can be
 * added in a row.
 */
export function WidgetPicker({
  specs,
  onBoard,
  icons,
  onAdd,
}: {
  /** Everything this dashboard could offer. */
  specs: readonly WidgetSpec[];
  onBoard: ReadonlySet<WidgetId>;
  icons: Record<WidgetId, IconComponent>;
  onAdd: (id: WidgetId) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupWidgets(specs, query), [specs, query]);

  return (
    <Popover
      label="Add widget"
      side="bottom"
      align="end"
      panelClassName="w-80"
      triggerClassName="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
      trigger={<LuPlus aria-hidden className="size-4" />}
    >
      <div className="flex max-h-[28rem] flex-col">
        <label className="flex items-center gap-2 border-b border-border px-3 py-2">
          <LuSearch aria-hidden className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search widgets…"
            aria-label="Search widgets"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {groups.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No widgets match.</p>
          ) : (
            groups.map((group) => (
              <section key={group.category} aria-label={group.label}>
                <h4 className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h4>
                {group.specs.map((spec) => {
                  const Icon = icons[spec.id];
                  const added = onBoard.has(spec.id);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      disabled={added}
                      onClick={() => onAdd(spec.id)}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium">{spec.title}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          {spec.description}
                        </span>
                      </span>
                      {added ? <LuCheck aria-label="On this dashboard" className="mt-0.5 size-3.5" /> : null}
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
}
