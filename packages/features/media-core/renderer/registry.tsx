import type { MediaTab } from '@midnite/studio-shared';
import type { MediaTabDescriptor } from '@midnite/studio-frame';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * The tabs the composing app registered with its `MediaShell`, in strip
 * order (Phase 113 Theme Q). The shell installs it; the explorer and the
 * empty states read a tab's label and glyph from it, so the copy a tab shows
 * is the copy its own descriptor carries.
 */
const MediaTabsContext = createContext<readonly MediaTabDescriptor[]>([]);

export function MediaTabsProvider({ tabs, children }: { tabs: readonly MediaTabDescriptor[]; children: ReactNode }) {
  return <MediaTabsContext.Provider value={tabs}>{children}</MediaTabsContext.Provider>;
}

export function useMediaTabs(): readonly MediaTabDescriptor[] {
  return useContext(MediaTabsContext);
}

/** One registered tab's descriptor — or a bare one named after its id, for a tab rendered outside a shell. */
export function useMediaTabDescriptor(tab: MediaTab): Pick<MediaTabDescriptor, 'id' | 'label' | 'icon'> {
  const found = useContext(MediaTabsContext).find((d) => d.id === tab);
  return found ?? { id: tab, label: tab, icon: () => null };
}

/**
 * Throws unless `tabs` is a usable strip: at least one tab and no id twice.
 * Called by the shell, so an app that registers a tab twice fails loudly in
 * its first render (and its composition test) rather than drawing two buttons
 * that share one panel id.
 */
export function assertMediaTabs(tabs: readonly MediaTabDescriptor[]): void {
  if (tabs.length === 0) throw new Error('A media shell needs at least one tab');
  const seen = new Set<MediaTab>();
  for (const { id } of tabs) {
    if (seen.has(id)) throw new Error(`Media tab "${id}" is registered twice`);
    seen.add(id);
  }
}
