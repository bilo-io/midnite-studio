import { useRef } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import { useRefs } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { CommitDetail } from '../commit/commit-detail';
import { CommitGraphRow } from './graph-row';
import { useGraphStore } from './graph-store';
import { LANE_WIDTH, ROW_HEIGHT } from './graph-svg';
import { useRefsBySha } from './ref-badge';
import { useGraphStream } from './use-graph-stream';

/**
 * The commit graph.
 *
 * Virtualized with @tanstack/react-virtual: a large repo is 50 000 rows, and
 * rendering that many DOM nodes is not a rendering problem so much as a memory
 * and layout one — the browser will do it and then scroll at single-digit fps.
 */
export function GraphView() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const selectedSha = useUiStore((s) => s.selectedCommitSha);
  const selectCommit = useUiStore((s) => s.selectCommit);

  useGraphStream(repoId);

  const rows = useGraphStore((s) => s.rows);
  const loading = useGraphStore((s) => s.loading);
  const truncated = useGraphStore((s) => s.truncated);
  const error = useGraphStore((s) => s.error);

  const { data: refs = [] } = useRefs(repoId);
  const refsBySha = useRefsBySha(refs);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Every row is exactly ROW_HEIGHT, so measurement is pure overhead.
    overscan: 24,
  });

  /**
   * One gutter width for the whole list, not per row.
   *
   * A per-row width would make the subject column jog left and right as the
   * graph narrows and widens while you scroll, which is far more distracting
   * than a little empty space. Capped because a pathological history should not
   * push the subjects off screen.
   */
  const gutterLanes = Math.min(
    12,
    rows.reduce((max, row) => Math.max(max, row.laneCount), 1),
  );

  if (!repoId) {
    return <EmptyState title="No repository selected" body="Pick one from the sidebar." />;
  }

  if (error) {
    return <EmptyState title="Could not read the history" body={error} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={loading ? 'Reading history…' : 'No commits yet'}
        body={loading ? '' : 'This repository has no commits.'}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" role="grid">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={row.commit.sha}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <CommitGraphRow
                    row={row}
                    refs={refsBySha.get(row.commit.sha) ?? EMPTY_REFS}
                    selected={selectedSha === row.commit.sha}
                    gutterLanes={gutterLanes}
                    onSelect={selectCommit}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{rows.length.toLocaleString()} commits</span>
          {loading ? <span>loading…</span> : null}
          {truncated ? <span>history truncated at the row cap</span> : null}
          <span className="ml-auto tabular-nums">{gutterLanes * LANE_WIDTH}px gutter</span>
        </footer>
      </div>

      {selectedSha ? (
        <aside className="w-96 shrink-0 border-l border-border">
          <CommitDetail repoId={repoId} sha={selectedSha} />
        </aside>
      ) : null}
    </div>
  );
}

const EMPTY_REFS: never[] = [];

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
    </div>
  );
}
