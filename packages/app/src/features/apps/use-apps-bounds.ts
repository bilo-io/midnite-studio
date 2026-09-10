import { useCallback, useEffect, useRef } from 'react';

import type { AppId } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { boundsFromRect } from '../browser/use-browser-bounds';

/**
 * Keeps the flyout's active app's `WebContentsView` sized to the flyout's
 * content region (Phase 83 Theme B.4) — `use-browser-bounds.ts`'s pattern,
 * reused rather than duplicated (`boundsFromRect`'s rounding and zero-size
 * guard are shared, not reimplemented).
 *
 * One difference from the browser's hook: there is no `apps.setVisible` IPC
 * call. The apps namespace has exactly three verbs (`enable`/`disable`/
 * `setBounds`) — showing and hiding a view is `enable`/`disable`'s own job
 * (Theme B.3), not a separate visibility toggle, since (unlike a browser tab)
 * an app has no "created but inactive" state to preserve. `visible` here
 * only gates whether bounds are pushed at all — an occluded or closed flyout
 * has nothing worth measuring.
 */
export function useAppsBounds(activeAppId: AppId | null, visible: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  const latest = useRef({ activeAppId, visible });
  latest.current = { activeAppId, visible };

  const sync = useCallback(() => {
    const { activeAppId, visible } = latest.current;
    if (!activeAppId || !visible) return;

    const el = ref.current;
    if (!el) return;
    const bounds = boundsFromRect(el.getBoundingClientRect());
    if (!bounds) return;
    bridge()?.apps.setBounds({ id: activeAppId, bounds });
  }, []);

  useEffect(() => {
    if (!activeAppId || !visible) return undefined;
    sync();

    const el = ref.current;
    if (!el) return undefined;

    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [activeAppId, visible, sync]);

  return { ref, sync };
}
