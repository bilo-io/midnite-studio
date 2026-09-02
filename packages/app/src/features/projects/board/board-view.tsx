import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { LuChevronRight } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { EmptyState } from '../../../components/empty-state';
import { VIEW_ICON } from '../../../components/nav-icons';
import { CardDetail } from './card-detail';
import { deriveColumns, NO_STATUS_COLUMN_ID, type BoardColumn } from './board-derive';
import { TaskCard } from './task-card';

/**
 * The `[ Table | Board ]` mode's board (Phase 41 Themes A–B) — the project's
 * `Status` single-select field turned on its side, one column per option.
 *
 * **No query of its own.** `items`/`fields` are exactly the query results the
 * Table mode already fetched — the phase doc's own rule ("one paged read for
 * the board's items … not one query per column"), so switching modes costs
 * nothing extra and a board never fetches per column.
 */
export function BoardView({
  projectId,
  fields,
  items,
}: {
  projectId: string;
  fields: readonly ForgeProjectField[];
  items: readonly ForgeProjectItem[];
}) {
  const statusField = useMemo(() => findStatusField(fields), [fields]);
  const columns = useMemo(() => deriveColumns(statusField, items), [statusField, items]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Every field except Status — the column already says that one.
  const cardFields = useMemo(
    () => fields.filter((field) => field.id !== statusField?.id),
    [fields, statusField],
  );

  const selectedItem = selectedItemId ? (items.find((i) => i.id === selectedItemId) ?? null) : null;

  if (!statusField) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="No Status field"
        body="This project has no Status field — the board groups by Status, so there are no columns to show."
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={VIEW_ICON.projects} title="No items" body="This project has no items yet." />;
  }

  const toggle = (columnId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0" data-testid="board-view">
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {columns.map((column) => (
          <BoardColumnView
            key={column.id}
            column={column}
            fields={cardFields}
            collapsed={collapsed.has(column.id)}
            onToggle={() => toggle(column.id)}
            onSelectItem={setSelectedItemId}
          />
        ))}
      </div>

      {selectedItem ? (
        <CardDetail
          projectId={projectId}
          item={selectedItem}
          fields={fields}
          onClose={() => setSelectedItemId(null)}
        />
      ) : null}
    </div>
  );
}

/** `Status` by name — GitHub's own default board field, and the only one this phase groups by. */
function findStatusField(fields: readonly ForgeProjectField[]): ForgeProjectField | null {
  return fields.find((f) => f.dataType === 'single_select' && f.name === 'Status') ?? null;
}

const COLLAPSED_WIDTH = 'w-9';
const COLUMN_WIDTH = 'w-72';

/** Below this, a plain `.map()` costs less than the virtualizer's own machinery. */
const VIRTUALIZE_THRESHOLD = 50;
const CARD_HEIGHT_ESTIMATE = 84;

function BoardColumnView({
  column,
  fields,
  collapsed,
  onToggle,
  onSelectItem,
}: {
  column: BoardColumn;
  fields: readonly ForgeProjectField[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectItem: (itemId: string) => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Expand ${column.name}`}
        className={`flex shrink-0 flex-col items-center gap-2 rounded-md border border-border bg-muted/20 py-2 ${COLLAPSED_WIDTH}`}
      >
        <LuChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">{column.items.length}</span>
        <span className="[writing-mode:vertical-rl] text-[11px] text-muted-foreground">{column.name}</span>
      </button>
    );
  }

  return (
    <div className={`flex h-full min-h-0 shrink-0 flex-col rounded-md border border-border bg-muted/10 ${COLUMN_WIDTH}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Collapse ${column.name}`}
        className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2 text-left"
      >
        {column.id !== NO_STATUS_COLUMN_ID ? (
          <span className="h-2 w-2 shrink-0 rounded-full border border-border" style={optionAccent(column.color)} />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{column.name}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {column.items.length}
        </span>
      </button>

      {column.items.length === 0 ? (
        <div className="p-2">
          <div className="flex h-16 items-center justify-center rounded border border-dashed border-border text-[11px] text-muted-foreground">
            Drop here
          </div>
        </div>
      ) : column.items.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualizedColumnItems column={column} fields={fields} onSelectItem={onSelectItem} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="flex flex-col gap-1.5">
            {column.items.map((item) => (
              <TaskCard key={item.id} item={item} fields={fields} onClick={() => onSelectItem(item.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A column past `VIRTUALIZE_THRESHOLD` cards (Phase 41 Theme B) — the app's
 * **first per-container virtualizer**: every other `useVirtualizer` call site
 * is one per view, not one per element in a loop, which is why this is its
 * own component rather than a branch inside `BoardColumnView`'s render.
 * Cards are variable-height, so this is `diff-view.tsx`'s
 * `estimateSize`/`measureElement` recipe, not the graph's fixed-row one.
 */
function VirtualizedColumnItems({
  column,
  fields,
  onSelectItem,
}: {
  column: BoardColumn;
  fields: readonly ForgeProjectField[];
  onSelectItem: (itemId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: column.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT_ESTIMATE,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = column.items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full pb-1.5"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <TaskCard item={item} fields={fields} onClick={() => onSelectItem(item.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * GitHub's option colours are its own enum names (`GRAY`, `YELLOW`, …), not
 * CSS — there is no promise here that every name maps to something visible in
 * both themes, so this degrades to the same neutral dot every other option
 * gets rather than guessing a hex value.
 */
function optionAccent(color: string): React.CSSProperties {
  const known: Record<string, string> = {
    GRAY: '#8b949e',
    BLUE: '#58a6ff',
    GREEN: '#3fb950',
    YELLOW: '#d29922',
    ORANGE: '#db6d28',
    RED: '#f85149',
    PINK: '#db61a2',
    PURPLE: '#a371f7',
  };
  const hex = known[color];
  return hex ? { backgroundColor: hex, borderColor: hex } : {};
}
