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
 * The shell installs the media kit, so the tabs it renders reach the layout,
 * the explorer and the data hooks through the frame's `useMediaKit()`.
 */
export function MediaShell({ tabs, title = 'Media' }: { tabs: readonly MediaTabDescriptor[]; title?: string }) {
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
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
            <PageDetachMark role="media" />
            <h1 className="text-sm font-semibold">{title}</h1>
            <div className="ml-auto shrink-0">
              <MediaTabStrip tabs={tabs} active={active.id} onSelect={setTab} />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Body />
          </div>
        </div>
      </MediaTabsProvider>
    </MediaKitProvider>
  );
}
