import type { AppId } from '@midnite/studio-shared';

import { useAppsBounds } from './use-apps-bounds';

/**
 * The host div a third-party app's `WebContentsView` floats over — the exact
 * role `browser-pane.tsx`'s `bodyRef` plays for the embedded browser. There is
 * no chrome here at all (no toolbar, no address bar): these apps have no tab
 * strip and no navigation affordance (Theme B's own doc), so the pane is
 * nothing but a measured rectangle.
 *
 * Shared between the flyout (Theme C) and a detached popout's own content
 * (Theme D) rather than duplicated — both are "the whole surface is this one
 * app," and the only thing that differs between them is what's outside this
 * div (the flyout's own chrome-less frame vs. `DetachedWindowFrame`'s title
 * bar).
 */
export function AppPane({ appId }: { appId: AppId }) {
  const { ref } = useAppsBounds(appId, true);
  return <div ref={ref} className="h-full w-full" />;
}
