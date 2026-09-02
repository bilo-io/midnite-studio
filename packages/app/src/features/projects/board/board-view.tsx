import { useMemo, useState } from 'react';
import { LuChevronRight, LuCircleDot, LuGitPullRequest, LuNotebookPen } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';
import { EmptyState } from '../../../components/empty-state';
import { VIEW_ICON } from '../../../components/nav-icons';
import { deriveColumns, NO_STATUS_COLUMN_ID, type BoardColumn } from './board-derive';

/**
 * The `[ Table | Board ]` mode's board (Phase 41 Theme A) — the project's
 * `Status` single-select field turned on its side, one column per option.
 *
 * **No query of its own.** `items`/`fields` are exactly the query results the
 * Table mode already fetched — the phase doc's own rule ("one paged read for
 * the board's items … not one query per column"), so switching modes costs
 * nothing extra and a board never fetches per column.
 *
 * Cards are placeholders here — the type glyph and a title, nothing else.
 * Theme B builds the real card (field chips, the per-card virtualizer);
 * building it twice would mean throwing this version away.
 */
export function BoardView({
  fields,
  items,
}: {
  fields: readonly ForgeProjectField[];
  items: readonly ForgeProjectItem[];
}) {
  const statusField = useMemo(() => findStatusField(fields), [fields]);
  const columns = useMemo(() => deriveColumns(statusField, items), [statusField, items]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

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
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3" data-testid="board-view">
      {columns.map((column) => (
        <BoardColumnView
          key={column.id}
          column={column}
          collapsed={collapsed.has(column.id)}
          onToggle={() => toggle(column.id)}
        />
      ))}
    </div>
  );
}

/** `Status` by name — GitHub's own default board field, and the only one this phase groups by. */
function findStatusField(fields: readonly ForgeProjectField[]): ForgeProjectField | null {
  return fields.find((f) => f.dataType === 'single_select' && f.name === 'Status') ?? null;
}

const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};

const COLLAPSED_WIDTH = 'w-9';
const COLUMN_WIDTH = 'w-72';

function BoardColumnView({
  column,
  collapsed,
  onToggle,
}: {
  column: BoardColumn;
  collapsed: boolean;
  onToggle: () => void;
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {column.items.length === 0 ? (
          <div className="flex h-16 items-center justify-center rounded border border-dashed border-border text-[11px] text-muted-foreground">
            Drop here
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {column.items.map((item) => (
              <BoardCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardCard({ item }: { item: ForgeProjectItem }) {
  const Icon = CONTENT_ICON[item.content.type];
  return (
    <div className="flex items-start gap-1.5 rounded border border-border bg-background px-2 py-1.5 text-xs">
      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{item.content.title}</span>
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
