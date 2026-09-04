import { LuFolderOpen, LuPlay } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { FileIcon, FolderIcon } from '../files/file-icons';
import { openVideoFile, revealVideoFile, useVideoFiles } from './use-video';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMtime(mtimeMs: number): string {
  return new Date(mtimeMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * A shallow, read-only listing for one of `assets/`, `input/` or `output/`
 * (Phase 44 Themes E/G) — reuses `FileIcon`/`FolderIcon` (pure glyph pickers,
 * no fs-scope dependency) rather than the writable `FileTree`: "nothing
 * writes into assets/" is this phase's own rule, so there is no rename,
 * create or delete affordance to reuse from that component either.
 */
export function VideoFileList({
  projectId,
  area,
  emptyLabel,
}: {
  projectId: string | null;
  area: 'assets' | 'input' | 'output';
  emptyLabel: string;
}) {
  const files = useVideoFiles(projectId, area);

  if (files.isLoading) return <p className="px-2 py-2 text-[11px] text-muted-foreground">Loading…</p>;
  if (files.data.length === 0 || projectId === null) {
    return <p className="px-2 py-2 text-[11px] text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul role="list" className="flex flex-col">
      {files.data.map((entry) => (
        <li key={entry.name} className="group flex items-center gap-1.5 px-2 py-1 text-xs">
          {entry.isDir ? <FolderIcon name={entry.name} open={false} /> : <FileIcon name={entry.name} />}
          <span className="flex-1 truncate text-foreground">{entry.name}</span>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {formatMtime(entry.mtimeMs)}
          </span>
          {entry.isDir ? null : (
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {formatSize(entry.size)}
            </span>
          )}
          {/* Reveal-in-Finder everywhere; play-in-default-app only for a render (Theme E). */}
          <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
            {!entry.isDir && area === 'output' ? (
              <IconButton
                icon={LuPlay}
                label={`Play ${entry.name}`}
                size="sm"
                onClick={() => openVideoFile(projectId, area, entry.name)}
              />
            ) : null}
            <IconButton
              icon={LuFolderOpen}
              label={`Reveal ${entry.name} in Finder`}
              size="sm"
              onClick={() => revealVideoFile(projectId, area, entry.name)}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
