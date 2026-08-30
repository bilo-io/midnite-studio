import type { StatusEntry } from '@midnite/studio-shared';

/**
 * The one-letter code git prints for a path's state, in the app's colours.
 *
 * Promoted out of the status panel so the multi-file diff accordion can use
 * the same glyph rather than growing a second, subtly different legend — the
 * same reason `TreeSection` was lifted out of it in Phase 13. Two places
 * disagreeing about whether a rename is `R` or `M` is exactly the kind of
 * drift a shared module prevents.
 */
const MARKS: Record<string, { char: string; className: string }> = {
  modified: { char: 'M', className: 'text-amber-500' },
  added: { char: 'A', className: 'text-success' },
  deleted: { char: 'D', className: 'text-destructive' },
  renamed: { char: 'R', className: 'text-primary' },
  copied: { char: 'C', className: 'text-primary' },
  untracked: { char: 'U', className: 'text-muted-foreground' },
  ignored: { char: 'I', className: 'text-muted-foreground' },
  typeChanged: { char: 'T', className: 'text-amber-500' },
  conflicted: { char: '!', className: 'text-destructive' },
};

export function StatusMark({
  code,
  conflicted,
}: {
  code: StatusEntry['staged'];
  conflicted: boolean;
}) {
  const mark = MARKS[conflicted ? 'conflicted' : code] ?? MARKS['modified']!;
  return (
    <span className={`w-3 shrink-0 text-center font-mono text-xs ${mark.className}`} aria-hidden>
      {mark.char}
    </span>
  );
}

/**
 * Which of an entry's two codes to show when there is room for only one.
 *
 * porcelain-v2 tracks index-vs-HEAD and worktree-vs-index independently, and
 * the Changes panel handles that by listing such a path twice. A single-row
 * surface cannot, so it shows the unstaged side — the edit the user made most
 * recently is the one they are looking for.
 */
export const primaryCode = (entry: StatusEntry): StatusEntry['staged'] =>
  entry.unstaged !== 'unmodified' ? entry.unstaged : entry.staged;
