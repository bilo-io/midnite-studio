import { MEDIA_TABS, type MediaTab } from '@midnite/studio-shared';
import { useRef, type KeyboardEvent } from 'react';

import { Tooltip } from '../../components/tooltip';
import { MEDIA_TAB_META, mediaPanelId, mediaTabId } from './media-tabs';

/**
 * The Media page's tab strip (Phase 99 Theme A): icon buttons, each with a
 * tooltip, and the active one also shows its label inline. A WAI-ARIA
 * `tablist` with roving focus — ←/→ move and select, Home/End jump.
 */
export function MediaTabStrip({
  active,
  onSelect,
}: {
  active: MediaTab;
  onSelect: (tab: MediaTab) => void;
}) {
  const refs = useRef<Partial<Record<MediaTab, HTMLButtonElement | null>>>({});

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = MEDIA_TABS.indexOf(active);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % MEDIA_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + MEDIA_TABS.length) % MEDIA_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MEDIA_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const tab = MEDIA_TABS[next]!;
    onSelect(tab);
    refs.current[tab]?.focus();
  };

  return (
    <div role="tablist" aria-label="Media" className="flex items-center gap-1" onKeyDown={move}>
      {MEDIA_TABS.map((tab) => {
        const { label, icon: Icon } = MEDIA_TAB_META[tab];
        const selected = tab === active;
        return (
          <Tooltip key={tab} label={label}>
            <button
              ref={(node) => {
                refs.current[tab] = node;
              }}
              type="button"
              role="tab"
              id={mediaTabId(tab)}
              aria-selected={selected}
              aria-controls={mediaPanelId(tab)}
              aria-label={label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab)}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${
                selected
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <Icon aria-hidden className="h-4 w-4 shrink-0" />
              {selected ? <span data-testid="media-tab-label">{label}</span> : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
