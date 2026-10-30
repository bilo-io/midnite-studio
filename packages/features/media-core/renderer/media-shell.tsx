import { MediaKitProvider, useFrameChrome, type MediaTabDescriptor } from '@midnite/studio-frame';

import { useMediaHost } from './host';
import { mediaKit } from './kit';
import { MediaTabStrip } from './media-tab-strip';
import { assertMediaTabs, MediaTabsProvider } from './registry';
import { useMediaChangedInvalidation } from './use-media';

/**
 * The Media page (Phase 99 Theme A; a feature since Phase 113 Theme Q) — the
 * tabs its app registered behind one icon tab strip, each rendering through
 * `MediaLayout`. Only the active tab is mounted.
 *
 * `tabs` is the registry: Studio passes all nine, Creator only Docs and
 * Images. A stored active tab the app did not register (a profile that last
 * sat on Video, opened in Creator) falls back to the first tab without
 * rewriting what is stored.
 *
 * `bare` drops the title row and tab strip for an app whose own rail picks the tab (Phase 123 Theme H) —
 * the tab is still the host's `useActiveTab`, so the rail and the shell stay one value.
 *
 * The shell installs the media kit, so the tabs it renders reach the layout,
 * the explorer and the data hooks through the frame's `useMediaKit()`.
 */
export function MediaShell({ tabs, title = 'Media', bare = false }: { tabs: readonly MediaTabDescriptor[]; title?: string; bare?: boolean }) {
  assertMediaTabs(tabs);
  const { PageDetachMark } = useFrameChrome();
  const [stored, setTab] = useMediaHost().useActiveTab();
  useMediaChangedInvalidation();
  const active = tabs.find((t) => t.id === stored) ?? tabs[0]!;
  const Body = active.Component;

  return (
    <MediaKitProvider kit={mediaKit}>
      <MediaTabsProvider tabs={tabs}>
        <div className="flex h-full min-h-0 flex-col">
          {bare ? null : (
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
              <PageDetachMark role="media" />
              <h1 className="text-sm font-semibold">{title}</h1>
              <div className="ml-auto shrink-0">
                <MediaTabStrip tabs={tabs} active={active.id} onSelect={setTab} />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <Body />
          </div>
        </div>
      </MediaTabsProvider>
    </MediaKitProvider>
  );
}

/** The active tab id and its setter, resolved against `tabs` the way {@link MediaShell} does. */
export function useActiveMediaTab(tabs: readonly MediaTabDescriptor[]): [string, (id: string) => void] {
  const [stored, setTab] = useMediaHost().useActiveTab();
  const active = tabs.find((t) => t.id === stored) ?? tabs[0]!;
  return [active.id, setTab as (id: string) => void];
}
