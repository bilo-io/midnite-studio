import { VIEW_ICON } from '../../components/nav-icons';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';

/**
 * The API Client view's shell (Phase 66 Theme B).
 *
 * A left collection tree and a right request/response pane, copying
 * `features/actions/actions-view.tsx`'s list-detail skeleton. Theme C builds
 * the collection tree and the tabbed request pane that fill the right side;
 * until then — and whenever a repo genuinely has no imported collection —
 * this renders the one state it can: the empty one.
 *
 * No `<PageDetachMark>` in the header, unlike Actions/Database/Search/Tests:
 * that control needs `apiClient` registered as a `PageWindowRole`
 * (`shared/domain/window.ts`'s `PAGE_WINDOW_ROLES`), which cascades into
 * `window-manager.ts`'s per-role popout size and `schemas.ts`'s relay-message
 * enum — real scope this theme's own "Files this phase touches" table does
 * not list anywhere. Making the view detachable is a follow-on, not a
 * rendering detail this shell can absorb for free.
 */
export function ApiClientView() {
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);

  const tree = useResizable({
    size: layout.apiTreeWidth,
    onSize: (value) => setLayout('apiTreeWidth', value),
    initial: DEFAULT_LAYOUT.apiTreeWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.apiTreeWidth,
  });

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: tree.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-1.5 py-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            API Client
          </h2>
        </div>
        <EmptyCollections />
      </div>

      <ResizeHandle resizable={tree} axis="x" label="Resize the API collection tree" />

      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Import a collection to build and send a request.
        </p>
      </div>
    </div>
  );
}

/**
 * The tree pane's own empty state — the only one this theme can render, since
 * the collection tree and the store that would fill it are Theme C's job.
 *
 * The "Import collection…" button is disabled: it names the affordance
 * Theme G wires up rather than leaving it silently absent, but nothing here
 * can act on a click yet.
 */
function EmptyCollections() {
  const Icon = VIEW_ICON.apiClient;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-medium">No collections yet</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Import a <code>.postman_collection.json</code> file to get started. Collections are
        stored in <code>.midnite/api/</code> in this repository, so they travel with it.
      </p>
      <button
        type="button"
        disabled
        title="Import lands in Theme G"
        className="mt-1 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground opacity-50 shadow-xs"
      >
        Import collection…
      </button>
    </div>
  );
}
