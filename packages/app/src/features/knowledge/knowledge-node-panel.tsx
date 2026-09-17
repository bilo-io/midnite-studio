import { useEffect, useState } from 'react';

import { LuX } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { bridge } from '../../services/bridge';
import { FilePreview } from '../files/preview/file-preview';
import { parseSourceLocationLine } from './knowledge-source-location';

type DetailState =
  | { status: 'loading' }
  | { status: 'ok'; sourceFile: string; targetLine: number | undefined }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * Theme E's "click a node to open its file" — Decision 7's Explorer
 * preview, not the editor: a side panel mounting `FilePreview` (the same
 * component `search-view.tsx` mounts inline for its own content hits)
 * rather than navigating to the Files view, since `files-store.ts`'s
 * `revealFile` has no line parameter and Knowledge needs one. Fetches the
 * node's `source_file`/`source_location` by id on open — the lean graph
 * `getGraph` returns never carries it for all 14,881 nodes.
 */
export function KnowledgeNodePanel({
  repoId,
  worktreePath,
  nodeId,
  onClose,
  width,
  style,
  className = '',
}: {
  repoId: string;
  worktreePath?: string;
  nodeId: string;
  onClose: () => void;
  width?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setDetail({ status: 'loading' });
    const b = bridge();
    if (!b) return;

    void b.knowledge.getNodeDetail({ repoId, nodeId })?.then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setDetail(
          result.kind === 'not-found'
            ? { status: 'not-found' }
            : {
                status: 'error',
                message: 'message' in result ? result.message : 'Could not open this node.',
              },
        );
        return;
      }
      setDetail({
        status: 'ok',
        sourceFile: result.value.sourceFile,
        targetLine: parseSourceLocationLine(result.value.sourceLocation) ?? undefined,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [repoId, nodeId]);

  return (
    <div
      data-testid="knowledge-node-panel"
      style={{ ...(width !== undefined ? { width } : {}), ...style }}
      className={`flex h-full min-h-0 w-full flex-col border-l border-border bg-background ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-xs font-medium text-muted-foreground">Knowledge · node</span>
        <IconButton icon={LuX} label="Close" onClick={onClose} />
      </div>
      {/*
        `flex flex-col`, not a plain block: `FilePreview`'s root is `flex-1
        flex-col` and only stretches inside a flex column — as a block child it
        collapsed to its header's height, leaving the editor a few pixels tall.
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {detail.status === 'loading' ? (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        ) : detail.status === 'not-found' ? (
          <div className="p-4 text-xs text-muted-foreground">
            This node has no source location to open.
          </div>
        ) : detail.status === 'error' ? (
          <div className="p-4 text-xs text-muted-foreground">{detail.message}</div>
        ) : (
          <FilePreview
            scope={{ scope: 'repo', repoId, ...(worktreePath ? { worktreePath } : {}) }}
            relPath={detail.sourceFile}
            targetLine={detail.targetLine}
          />
        )}
      </div>
    </div>
  );
}
