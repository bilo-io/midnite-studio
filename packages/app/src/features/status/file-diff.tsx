import { useQuery } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { useActiveWorktree } from '../../services/use-status';

/**
 * Unified-diff text pane.
 *
 * A deliberate stub (docs/INITIAL_PLAN.md → Post-MVP): a real side-by-side diff
 * viewer is out of scope, and rendering git's own unified output — coloured by
 * line prefix, nothing more — is honest about that rather than half-building
 * one.
 */
export function FileDiff({
  repoId,
  path,
  staged,
}: {
  repoId: string;
  path: string;
  staged: boolean;
}) {
  const { worktreePath } = useActiveWorktree();

  const { data, isLoading } = useQuery({
    queryKey: ['diff', repoId, worktreePath ?? 'main', path, staged],
    queryFn: async () =>
      bridge()?.status.fileDiff({
        repoId,
        path,
        staged,
        ...(worktreePath ? { worktreePath } : {}),
      }),
  });

  if (isLoading) return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;

  const patch = data?.patch ?? '';
  if (!patch.trim()) {
    return <p className="p-3 text-xs text-muted-foreground">No textual diff for this file.</p>;
  }

  return (
    <div className="h-full overflow-auto">
      <header className="sticky top-0 border-b border-border bg-background px-3 py-1.5 text-xs">
        <span className="font-medium">{path}</span>
        <span className="ml-2 text-muted-foreground">{staged ? 'staged' : 'working tree'}</span>
      </header>
      <pre className="px-3 py-2 font-mono text-[11px] leading-[1.45]" data-selectable>
        {patch.split('\n').map((line, index) => (
          <div key={index} className={lineClass(line)}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

/**
 * Colour by line prefix. Order matters: `+++`/`---` are file headers, not
 * added/removed lines, so they must be matched before the single-character
 * cases or every diff opens with a spurious green and red line.
 */
function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted-foreground';
  if (line.startsWith('@@')) return 'text-primary';
  if (line.startsWith('+')) return 'text-success';
  if (line.startsWith('-')) return 'text-destructive';
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-muted-foreground';
  return '';
}
