import { useMemo, useState, type ReactNode } from 'react';

import type { ConflictHunkSide, ConflictRegion, ConflictSide } from '@midnite/studio-shared';

import { useConflictApplyHunk, useConflictResolveWholeFile } from '../../services/use-status';
import { flattenConflictHunks } from './flatten-conflict-hunks';
import { useConflictRegions } from './use-conflict-regions';

/**
 * The Conflict Resolution Studio (Phase 47 Theme D) — opened for one
 * conflicted path from `ConflictBanner`'s path list.
 *
 * Deliberately **not** built on `DiffCell`/`toSplitRows`: those are Phase 26's
 * two-way model (`left`/`right`), and a conflict region is three-sided
 * (ours/theirs/optional base) — stretching `SplitCell.type` to fit would cost
 * more than this plain rendering does. Shiki highlighting and virtualization
 * are left for a follow-up pass: the functional core — per-region accept
 * controls, incremental resolution, and the stale-write recovery `Theme C`'s
 * IPC contract requires — is this theme's actual risk, not the row's paint.
 *
 * Resolving a region never mutates local state directly: `useConflictRegions`
 * is nested under the same `keys.status(...)` prefix every write op already
 * invalidates on settlement, and the file watcher invalidates it again the
 * moment `applyConflictHunk`'s worktree write lands — so an accepted region
 * disappearing here is the same "server state is authoritative but not
 * synchronous" reconciliation the rest of the app relies on, not a bespoke
 * local append.
 */
export function ConflictResolutionStudio({
  repoId,
  worktreePath,
  path,
  onClose,
  onError,
}: {
  repoId: string;
  worktreePath?: string;
  path: string;
  onClose: () => void;
  onError?: (message: string) => void;
}) {
  const { hunks, isLoading } = useConflictRegions({ repoId, worktreePath, path });
  const items = useMemo(() => flattenConflictHunks(hunks), [hunks]);
  const conflictCount = items.filter((item) => item.kind === 'conflict').length;

  const target = { repoId, ...(worktreePath ? { worktreePath } : {}) };
  const applyHunk = useConflictApplyHunk(target);
  const resolveWholeFile = useConflictResolveWholeFile(target);
  const [error, setError] = useState('');
  const busy = applyHunk.isPending || resolveWholeFile.isPending;

  const acceptRegion = async (
    regionIndex: number,
    region: ConflictRegion,
    side: ConflictHunkSide,
  ) => {
    const result = await applyHunk.mutateAsync({ path, regionIndex, region, side });
    if (result.ok) {
      setError('');
      return;
    }
    const message =
      result.kind === 'error' && result.code === 'stale-write'
        ? 'This file changed since these regions were read — refreshed below.'
        : result.kind === 'error'
          ? result.message
          : 'That resolution failed.';
    setError(message);
    onError?.(message);
  };

  const acceptWholeFile = async (side: ConflictSide) => {
    const result = await resolveWholeFile.mutateAsync({ path, side });
    if (result.ok) {
      setError('');
      onClose();
      return;
    }
    const message = result.kind === 'error' ? result.message : 'That resolution failed.';
    setError(message);
    onError?.(message);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="conflict-resolution-studio">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <span className="truncate text-xs font-medium" title={path}>
          {path}
        </span>
        <span className="text-xs text-muted-foreground">
          {isLoading
            ? 'loading…'
            : conflictCount > 0
              ? `${conflictCount} region${conflictCount === 1 ? '' : 's'} left`
              : 'all regions resolved'}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void acceptWholeFile('ours')}
            className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40"
          >
            Accept all mine
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void acceptWholeFile('theirs')}
            className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40"
          >
            Accept all theirs
          </button>
        </span>
      </div>

      {error ? (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        {items.map((item, i) =>
          item.kind === 'context' ? (
            <pre
              key={`context-${i}`}
              className="whitespace-pre-wrap px-2 py-0.5 text-muted-foreground"
            >
              {item.lines.join('\n')}
            </pre>
          ) : (
            <ConflictRegionRow
              key={`conflict-${item.regionIndex}`}
              region={item.region}
              busy={busy}
              onAccept={(side) => void acceptRegion(item.regionIndex, item.region, side)}
            />
          ),
        )}
        {!isLoading && items.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No conflict markers found in this file.</div>
        ) : null}
      </div>
    </div>
  );
}

function ConflictRegionRow({
  region,
  busy,
  onAccept,
}: {
  region: ConflictRegion;
  busy: boolean;
  onAccept: (side: ConflictHunkSide) => void;
}) {
  return (
    <div className="my-1 border-y border-border" data-testid="conflict-region">
      <RegionSide label="Ours" tone="blue" lines={region.ours}>
        <AcceptButton disabled={busy} onClick={() => onAccept('ours')}>
          Accept mine
        </AcceptButton>
      </RegionSide>
      {region.base !== null ? <RegionSide label="Base" tone="muted" lines={region.base} /> : null}
      <RegionSide label="Theirs" tone="green" lines={region.theirs}>
        <AcceptButton disabled={busy} onClick={() => onAccept('theirs')}>
          Accept theirs
        </AcceptButton>
      </RegionSide>
      <div className="flex justify-end px-2 py-0.5">
        <AcceptButton disabled={busy} onClick={() => onAccept('both')}>
          Accept both
        </AcceptButton>
      </div>
    </div>
  );
}

const TONE_BG: Record<'blue' | 'green' | 'muted', string> = {
  blue: 'bg-blue-500/10',
  green: 'bg-green-500/10',
  muted: 'bg-muted/40',
};
const TONE_BODY_BG: Record<'blue' | 'green' | 'muted', string> = {
  blue: 'bg-blue-500/5',
  green: 'bg-green-500/5',
  muted: 'bg-muted/20',
};
const TONE_TEXT: Record<'blue' | 'green' | 'muted', string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  muted: 'text-muted-foreground',
};

function RegionSide({
  label,
  tone,
  lines,
  children,
}: {
  label: string;
  tone: 'blue' | 'green' | 'muted';
  lines: string[];
  children?: ReactNode;
}) {
  return (
    <>
      <div className={`flex items-center gap-1 px-2 py-0.5 ${TONE_BG[tone]}`}>
        <span className={`text-[10px] font-semibold uppercase ${TONE_TEXT[tone]}`}>{label}</span>
        {children ? <span className="ml-auto">{children}</span> : null}
      </div>
      <pre className={`whitespace-pre-wrap px-2 py-0.5 ${TONE_BODY_BG[tone]}`}>{lines.join('\n')}</pre>
    </>
  );
}

function AcceptButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-border px-1.5 py-0.5 text-[10px] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
