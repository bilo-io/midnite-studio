import { LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { isTabDirty, useApiClientStore, type ApiTab } from '../../store/api-client-store';
import { MethodBadge } from './method-badge';

/**
 * The request-tab strip inside the API Client view (Phase 66 Theme C,
 * Decision 11) — owned by `api-client-store`, not a `WorkbenchTab`: a request
 * draft carries fields (`bodies`, `auth`, `bodyMode`) no other tab kind has
 * any use for.
 *
 * The dirty dot repeats `file-preview.tsx`'s glyph and `title` verbatim —
 * there is no `tab-strip.tsx` unsaved-state convention to mirror instead; the
 * four `WorkbenchTab` arms are all read-only surfaces with no dirty concept.
 */
export function RequestTabStrip({ tabs, activeTabId }: { tabs: readonly ApiTab[]; activeTabId: string | null }) {
  const focusTab = useApiClientStore((s) => s.focusTab);
  const closeTab = useApiClientStore((s) => s.closeTab);
  const dialogs = useDialogs();

  if (tabs.length === 0) return null;

  const requestClose = (tab: ApiTab) => {
    if (!isTabDirty(tab)) {
      closeTab(tab.id);
      return;
    }
    dialogs.confirm({
      title: `Discard unsaved changes to "${tab.draft.name}"?`,
      confirmLabel: 'Discard',
      danger: true,
      blastRadius: null,
      onConfirm: () => closeTab(tab.id),
    });
  };

  return (
    <div className="flex h-8 shrink-0 items-center gap-px overflow-x-auto border-b border-border px-1">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const dirty = isTabDirty(tab);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`group flex h-7 shrink-0 items-center gap-1.5 rounded-t px-2 text-xs ${
              active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
            }`}
          >
            <button
              type="button"
              onClick={() => focusTab(tab.id)}
              className="flex min-w-0 items-center gap-1.5"
            >
              <MethodBadge method={tab.draft.method} />
              <span className="max-w-[10rem] truncate">{tab.draft.name}</span>
              {dirty ? (
                <span
                  className="shrink-0 text-[10px] font-medium text-muted-foreground"
                  title="Unsaved changes"
                >
                  ●
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => requestClose(tab)}
              aria-label={`Close ${tab.draft.name}`}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
            >
              <LuX className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
