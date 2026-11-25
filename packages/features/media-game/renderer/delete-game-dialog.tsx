import { useState } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';

import { useGameDeleteInfo } from './use-games';
import { useOccludeWhile } from './chrome';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * Delete game (Phase 149 Theme I): the blast-radius confirm. It reads what would be lost, says it moves the folder
 * to the Trash, and enables **Move to Trash** only once the game's name is typed exactly.
 */
export function DeleteGameDialog({
  gameId,
  name,
  busy = false,
  onCancel,
  onConfirm,
}: {
  gameId: string;
  /** The game's name — what the user types. */
  name: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (confirmName: string) => void;
}) {
  useOccludeWhile(true);
  const info = useGameDeleteInfo(gameId);
  const [typed, setTyped] = useState('');
  const loaded = info.data ?? null;
  const matches = typed === name;
  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${name}`}
      onClick={(event) => event.target === event.currentTarget && onCancel()}
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <div className="w-full max-w-md rounded-lg border border-destructive/60 bg-popover shadow-xl ring-1 ring-destructive/25">
        <div className="space-y-2 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <LuTriangleAlert aria-hidden className="h-4 w-4" />
            Delete {name}?
          </h2>
          <p className="text-xs text-muted-foreground">This moves the game&rsquo;s folder to the Trash. You can put it back from there.</p>
          {info.isPending ? (
            <p className="text-xs text-muted-foreground">Checking what would be lost…</p>
          ) : loaded ? (
            <div role="status" className="space-y-1 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">
              <p className="break-all font-mono">{loaded.path}</p>
              <p>{formatBytes(loaded.bytes)}</p>
              <p>{plural(loaded.uncommitted, 'uncommitted file')}</p>
              {!loaded.hasRemote ? (
                <p className="font-medium text-destructive">No remote — this is the only copy</p>
              ) : loaded.unpushed === null ? (
                <p>No upstream branch, so unpushed commits could not be counted</p>
              ) : (
                <p>{plural(loaded.unpushed, 'commit')} not pushed</p>
              )}
            </div>
          ) : (
            <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">Could not read what would be lost. Delete only if you are sure.</p>
          )}
          <label className="block text-xs">
            <span className="mb-1 block">
              Type <strong>{name}</strong> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              spellCheck={false}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs hover:bg-accent">
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || busy || info.isPending}
            onClick={() => onConfirm(typed)}
            className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-40"
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
}
