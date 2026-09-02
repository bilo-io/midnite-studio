import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import {
  LuCheck,
  LuCircleDot,
  LuCopy,
  LuGitPullRequest,
  LuNotebookPen,
} from 'react-icons/lu';

import type {
  ForgeProjectField,
  ForgeProjectFieldValue,
  ForgeProjectItem,
  ForgeProjectWriteResult,
} from '@midnite/studio-shared';

import { EmptyState } from '../../components/empty-state';
import type { IconComponent } from '../../components/icon-button';
import { VIEW_ICON } from '../../components/nav-icons';
import { ExternalLink } from '../markdown/external-link';
import { bridge } from '../../services/bridge';
import { BoardView } from './board/board-view';
import {
  useForgeProjectFields,
  useForgeProjectItems,
  useForgeProjects,
  useSetProjectItemField,
} from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';

/**
 * The Projects view (Phase 40 Theme D): a board picker above the picked
 * board's items, rendered as a table.
 *
 * `EmptyWorkspace` and the "no GitHub remote" redirect both happen one layer
 * up, in `app.tsx` — by the time this component ever mounts, a repo is
 * selected and its remote resolved a `Forge`, exactly like every other
 * forge-gated view (`ActionsView`, `ReviewsView`). What is left here is the
 * five states the phase doc names: no boards for this owner, no board
 * picked, the picked board has no items, a missing `read:project` scope, and
 * — the steady state — the table.
 *
 * The board mode (Phase 41 Theme A) lives inside this same view rather than
 * as its own nav item — one board picker, one gating path, one data source
 * turned sideways rather than duplicated.
 */
export function ProjectsView() {
  const { repoId } = useActiveWorktree();
  const boardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const setProjectBoard = useUiStore((s) => s.setProjectBoard);
  const modeByRepo = useUiStore((s) => s.projectsMode);
  const setProjectsMode = useUiStore((s) => s.setProjectsMode);
  const mode = repoId !== null ? (modeByRepo[repoId] ?? 'table') : 'table';

  // Fetching starts only once this view is mounted, matching every other
  // forge read's `enabled` gate — see the phase doc's own acceptance test.
  const projects = useForgeProjects(repoId, true);
  const boards = projects.data?.projects ?? [];

  const selectedProjectId = repoId !== null ? (boardByRepo[repoId] ?? null) : null;
  const boardStillExists =
    selectedProjectId !== null && boards.some((b) => b.id === selectedProjectId);

  const fields = useForgeProjectFields(selectedProjectId, selectedProjectId !== null);
  const items = useForgeProjectItems(selectedProjectId, selectedProjectId !== null);

  const scopeMissing =
    projects.data?.kind === 'insufficient-scope' || items.data?.kind === 'insufficient-scope';

  if (scopeMissing) return <MissingScopeState />;

  if (projects.isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading projects…</p>;
  }

  if (projects.data?.error) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="Could not load projects"
        body={projects.data.error}
      />
    );
  }

  if (boards.length === 0) {
    return (
      <EmptyState
        icon={VIEW_ICON.projects}
        title="No projects"
        body="This owner has no projects, or none this token can see."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="projects-view">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="mr-auto text-sm font-semibold tracking-tight">Projects</h2>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Board</span>
          <select
            aria-label="Project board"
            value={boardStillExists ? (selectedProjectId ?? '') : ''}
            onChange={(event) => {
              if (repoId && event.target.value) setProjectBoard(repoId, event.target.value);
            }}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
          >
            <option value="" disabled>
              Pick a board…
            </option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.title}
                {board.closed ? ' (closed)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="View mode"
          data-testid="projects-view-mode-slot"
          className="flex overflow-hidden rounded border border-border text-xs"
        >
          {(
            [
              { id: 'table', label: 'Table' },
              { id: 'board', label: 'Board' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={mode === option.id}
              onClick={() => repoId && setProjectsMode(repoId, option.id)}
              className={`px-2 py-1 transition-colors ${
                mode === option.id
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {selectedProjectId === null ? (
        <EmptyState
          icon={VIEW_ICON.projects}
          title="Pick a board"
          body="Choose a project board above to see its items."
        />
      ) : items.isLoading || fields.isLoading ? (
        <p className="p-4 text-xs text-muted-foreground">Loading items…</p>
      ) : items.data?.error ? (
        <EmptyState icon={VIEW_ICON.projects} title="Could not load items" body={items.data.error} />
      ) : mode === 'board' ? (
        <BoardView items={items.data?.items ?? []} fields={fields.data?.fields ?? []} />
      ) : (items.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={VIEW_ICON.projects}
          title="No items"
          body="This board has no items yet."
        />
      ) : (
        <ProjectItemsTable
          projectId={selectedProjectId}
          items={items.data?.items ?? []}
          fields={fields.data?.fields ?? []}
          truncated={items.data?.truncated ?? false}
        />
      )}
    </div>
  );
}

const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};

const ROW_HEIGHT = 32;

/**
 * The item table: title, type glyph, assignees, one column per field.
 *
 * Virtualised with the `estimateSize`/`measureElement` recipe from
 * `diff-view.tsx` — the house pattern for a variable-height virtualised list
 * in this app — with the house `overscan` of 24. Rows are a fixed height here
 * (no wrapped multi-line cells), so `estimateSize` is a constant, but
 * `measureElement` is still wired so a future wrapped-text column does not
 * need the virtualizer rebuilt.
 */
function ProjectItemsTable({
  projectId,
  items,
  fields,
  truncated,
}: {
  projectId: string;
  items: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  truncated: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 24,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="w-6 shrink-0" />
        <span className="min-w-0 flex-1">Title</span>
        <span className="w-40 shrink-0">Assignees</span>
        {fields.map((field) => (
          <span key={field.id} className="w-32 shrink-0 truncate px-2">
            {field.name}
          </span>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            const Icon = CONTENT_ICON[item.content.type];
            const title = item.content.title;
            const href = item.content.type === 'draft' ? null : item.content.url;

            return (
              <div
                key={item.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 flex w-full items-center border-b border-border/60 px-3 text-xs"
                style={{ transform: `translateY(${virtualRow.start}px)`, height: ROW_HEIGHT }}
              >
                <span className="w-6 shrink-0">
                  <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {href ? <ExternalLink href={href}>{title}</ExternalLink> : title}
                </span>
                <span className="w-40 shrink-0 truncate text-muted-foreground">
                  {item.content.assignees.join(', ')}
                </span>
                {fields.map((field) => (
                  <ProjectFieldCell
                    key={field.id}
                    projectId={projectId}
                    itemId={item.id}
                    field={field}
                    value={item.fieldValues[field.id]}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {truncated ? (
        <p className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Showing the first 1,000 items — this board has more than this view will load.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One field cell: a value for `iteration` (not writable this phase — see the
 * contract's own note) or the picked board's `forgeWritesEnabled` setting off,
 * an editable control otherwise (Phase 40 Theme E).
 *
 * **Not optimistic** — the house rule every forge write in this app follows:
 * the control disables while `gh` answers, then either the invalidated refetch
 * carries the new value back down, or `failureOf` renders `gh`'s own sentence
 * underneath. **Gated at the surface, not in the mutation** — a disabled
 * control that says why is the whole point; see `review-action-bar.tsx`'s own
 * note for the reasoning this phase reuses verbatim.
 */
/** Exported for `projects-view.test.tsx` — tested directly rather than through the virtualized table, which jsdom cannot size. */
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
    return (
      <span className="w-32 shrink-0 truncate px-2 text-muted-foreground">
        {formatFieldValue(value)}
      </span>
    );
  }

  const disabled = !writesEnabled || pending;
  const title = writesEnabled ? problem : 'Enable review actions in Settings → Reviews';
  const commit = (next: ForgeProjectFieldValue) => {
    if (!writesEnabled || sameValue(value, next)) return;
    setField.mutate({ itemId, fieldId: field.id, value: next });
  };

  return (
    <span className="w-32 shrink-0 px-2">
      {field.dataType === 'single_select' ? (
        <SingleSelectEditor field={field} value={value} disabled={disabled} title={title} onCommit={commit} />
      ) : (
        <TextLikeEditor field={field} value={value} disabled={disabled} title={title} onCommit={commit} />
      )}
    </span>
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

function formatFieldValue(value: ForgeProjectFieldValue | undefined): string {
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

/** How the fix is spelled — shown verbatim, per the phase doc's own rule. */
const SCOPE_FIX_COMMAND = 'gh auth refresh -s project';

/**
 * The missing-`read:project`-scope state.
 *
 * `gh auth login`'s own hint (what `ForgeCliStatus.hint` would say for every
 * other forge surface) does not add a scope to an existing token, which is
 * why this names the actual fix rather than reusing that generic copy.
 */
function MissingScopeState() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <VIEW_ICON.projects aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-medium">GitHub Projects needs one more permission</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your GitHub CLI token is missing the <code>project</code> scope. Run this in a terminal,
        then reopen this view:
      </p>
      <div className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1.5">
        <code className="text-xs">{SCOPE_FIX_COMMAND}</code>
        <button
          type="button"
          aria-label="Copy command"
          onClick={() => {
            void bridge()
              ?.clipboard.writeText({ text: SCOPE_FIX_COMMAND })
              .then((result) => {
                if (result?.ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              });
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <LuCheck aria-hidden className="h-3.5 w-3.5" /> : <LuCopy aria-hidden className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
