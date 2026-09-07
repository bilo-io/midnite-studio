import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useApiClientStore } from '../../store/api-client-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { CollectionTree } from './collection-tree';
import { EnvironmentSwitcher } from './environment-switcher';
import { RequestBuilder } from './request-builder';
import { RequestTabStrip } from './request-tab-strip';

/**
 * The API Client view's shell (Phase 66 Themes B, C, F).
 *
 * A left collection tree and a right request/response pane, copying
 * `features/actions/actions-view.tsx`'s list-detail skeleton. Not global in
 * `view-registry.tsx` — collections live under `.midnite/api/` in an open
 * repo, so `selectedRepoId` is guaranteed non-null here exactly the way
 * `FilesView` relies on the same guard for its own tree.
 *
 * The right side is `RequestBuilder` (Phase 66 Theme D) — the full
 * params/headers/auth/body builder that replaced Theme C's minimal
 * method/URL stopgap wholesale (Decision 2).
 *
 * No `<PageDetachMark>` in the header, unlike Actions/Database/Search/Tests —
 * see Theme B's original note: that control needs `apiClient` registered as
 * a `PageWindowRole`, which is real scope this phase does not touch.
 */
export function ApiClientView() {
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);

  const tabs = useApiClientStore((s) => s.tabs);
  const activeTabId = useApiClientStore((s) => s.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const tree = useResizable({
    size: layout.apiTreeWidth,
    onSize: (value) => setLayout('apiTreeWidth', value),
    initial: DEFAULT_LAYOUT.apiTreeWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.apiTreeWidth,
  });

  if (!selectedRepoId) return null;

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: tree.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-1.5 py-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            API Client
          </h2>
          <EnvironmentSwitcher repoId={selectedRepoId} />
        </div>
        <CollectionTree repoId={selectedRepoId} />
      </div>

      <ResizeHandle resizable={tree} axis="x" label="Resize the API collection tree" />

      <div className="flex min-h-0 flex-1 flex-col">
        <RequestTabStrip tabs={tabs} activeTabId={activeTabId} />
        {activeTab ? (
          <div className="flex min-h-0 flex-1 flex-col" key={activeTab.id}>
            <RequestBuilder tabId={activeTab.id} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Open a request from the tree to build and send it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
