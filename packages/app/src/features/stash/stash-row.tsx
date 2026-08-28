import type { StashEntry } from '@midnite/git-shared';
import { Archive, MoreVertical } from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { TREE_INDENT } from '../../components/tree-indent';
import { cascadeStyle } from '../../lib/cascade';
import { formatDate } from '../graph/graph-row';

export function StashRow({
  entry,
  index,
  depth = 2,
  menu,
  onSelect,
}: {
  entry: StashEntry;
  index: number;
  depth?: 1 | 2 | 3;
  menu: (entry: StashEntry) => MenuItem[];
  onSelect?: (entry: StashEntry) => void;
}) {
  const dialogs = useDialogs();

  const openMenu = (at: { clientX: number; clientY: number }) => {
    dialogs.openMenu(at, menu(entry));
  };

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(event);
      }}
      onClick={() => onSelect?.(entry)}
      style={cascadeStyle(index)}
      className={`group flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pr-2 text-[13px] transition-colors hover:bg-accent/30 ${TREE_INDENT[depth]} cursor-default`}
    >
      <Archive aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate flex-1 font-medium">{entry.message}</span>

      <span className="shrink-0 text-[11px] text-muted-foreground">
        {formatDate(entry.authoredAt)}
      </span>

      <span className="ml-1 flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton
          icon={MoreVertical}
          label={`Actions for stash ${entry.selector}`}
          size="sm"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu({
              clientX: event.clientX || rect.left,
              clientY: event.clientY || rect.bottom,
            });
          }}
        />
      </span>
    </div>
  );
}
