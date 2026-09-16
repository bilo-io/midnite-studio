import { useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Theme E's "community colour and filter — the 600 communities need their
 * own searchable list, not 600 checkboxes." Virtualized (`@tanstack/react-
 * virtual`, the same library the command palette uses to scroll/search a
 * long list) rather than rendering all 600 rows, searched client-side over
 * the already-known community name list.
 *
 * A block-list model: every community starts shown, `hidden` names the ones
 * toggled off — friendlier at 600 entries than an allow-list starting empty.
 */
export function KnowledgeCommunityFilter({
  communityNames,
  hidden,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  communityNames: readonly string[];
  hidden: ReadonlySet<string>;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  onHideAll: (names: readonly string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return communityNames;
    return communityNames.filter((name) => name.toLowerCase().includes(needle));
  }, [communityNames, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${communityNames.length} communities…`}
          className="h-7 flex-1 rounded border border-border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
          aria-label="Search communities"
        />
        <button
          type="button"
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          onClick={onShowAll}
        >
          Show all
        </button>
        <button
          type="button"
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onHideAll(communityNames)}
        >
          Hide all
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const name = filtered[row.index];
            if (name === undefined) return null;
            const isShown = !hidden.has(name);
            return (
              <label
                key={name}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
                className="flex cursor-pointer items-center gap-2 px-2 text-xs"
              >
                <input type="checkbox" checked={isShown} onChange={() => onToggle(name)} />
                <span className="truncate">{name}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
