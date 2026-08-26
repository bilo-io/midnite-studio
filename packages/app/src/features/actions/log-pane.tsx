import { useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, SquareArrowOutUpRight } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { openExternal } from '../../services/queries';
import { parseAnsi } from './ansi';
import { groupCount, visibleRows, type LogNode } from './log-model';

/** One row's height, fixed — a log is uniform monospace and measuring is waste. */
const ROW_HEIGHT = 18;

/**
 * A job's log: folded groups, ANSI colour, virtualised rows.
 *
 * Virtualised because the cap is a *byte* cap — 800KB of head and tail is
 * comfortably tens of thousands of lines, and "show the whole log" widens that
 * tenfold. Folding is modelled as a different visible-rows array over the same
 * parsed tree rather than as hidden rows, so the virtualiser's index space and
 * its measurements always agree with what is on screen.
 */
export function LogPane({
  nodes,
  truncated,
  omittedLines,
  totalBytes,
  runUrl,
  onLoadFull,
  loadingFull,
}: {
  nodes: readonly LogNode[];
  truncated: boolean;
  omittedLines: number;
  totalBytes: number;
  runUrl: string;
  /** Absent once the full log is already showing — there is nothing left to ask for. */
  onLoadFull: (() => void) | null;
  loadingFull: boolean;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => visibleRows(nodes, collapsed), [nodes, collapsed]);
  const total = useMemo(() => groupCount(nodes), [nodes]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 24,
  });

  const toggle = (group: number): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const allCollapsed = collapsed.size >= total && total > 0;

  return (
    <section aria-label="Job log" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Log
        </span>
        {total > 0 ? (
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(range(total)))}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
          </button>
        ) : null}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          {rows.length.toLocaleString('en-US')} rows
        </span>
      </div>

      {/*
        The truncation notice sits ABOVE the log, as well as at the splice.

        A marker buried a thousand rows down is a marker nobody sees, and the
        one thing that must never happen here is a capped log reading as a
        complete one. So it is said twice: this banner up front, and a `gap` row
        at the point where the middle was actually removed.
      */}
      {truncated ? (
        <p className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          <span>
            Log truncated — {omittedLines.toLocaleString('en-US')} lines omitted from the middle of{' '}
            {formatBytes(totalBytes)}.
          </span>
          {onLoadFull === null ? null : (
            <button
              type="button"
              onClick={onLoadFull}
              disabled={loadingFull}
              className="underline underline-offset-2 disabled:no-underline disabled:opacity-60"
            >
              {loadingFull ? 'Loading…' : 'Load the full log'}
            </button>
          )}
          <IconButton
            icon={SquareArrowOutUpRight}
            label="Open the full log on GitHub"
            size="sm"
            onClick={() => openExternal(runUrl)}
          />
        </p>
      ) : null}

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize() }} className="relative">
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                className="absolute inset-x-0 top-0"
              >
                {row.kind === 'gap' ? (
                  /*
                    The in-band marker, rendered where the splice actually is.
                    The banner above states the truncation up front; this says
                    WHERE it happened, which is the part that changes how you
                    read the lines either side of it.
                  */
                  <p className="flex h-full items-center px-2 font-mono text-[11px] text-amber-700 dark:text-amber-400">
                    {row.text}
                  </p>
                ) : row.kind === 'header' ? (
                  <button
                    type="button"
                    onClick={() => toggle(row.group)}
                    aria-expanded={row.open}
                    className="flex h-full w-full items-center gap-1 px-2 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent/30"
                  >
                    {row.open ? (
                      <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight aria-hidden className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{row.label}</span>
                    <span className="ml-auto shrink-0 tabular-nums opacity-70">{row.count}</span>
                  </button>
                ) : (
                  <LogLine text={row.text} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * One line, with its ANSI resolved.
 *
 * `whitespace-pre` and no wrapping: a log's alignment is information — a stack
 * trace's indentation, a table of test names — and reflowing it to the pane
 * width destroys that. The pane scrolls horizontally instead.
 */
function LogLine({ text }: { text: string }) {
  const spans = useMemo(() => parseAnsi(text), [text]);
  return (
    <pre className="h-full whitespace-pre px-2 font-mono text-[11px] leading-[18px] text-foreground/90">
      {/* Index keys: the spans of one line have no identity of their own, and
          the line is re-parsed as a unit whenever its text changes. */}
      {spans.map((span, at) => (
        <span key={at} className={span.className}>
          {span.text}
        </span>
      ))}
    </pre>
  );
}

const range = (count: number): number[] => Array.from({ length: count }, (_, at) => at);

/** Bytes as a reader sees them. Binary units, because this is a payload size. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
