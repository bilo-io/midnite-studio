import { DIFF_FULL_CONTEXT, type FileDiff } from '@midnite/git-shared';
import { ChevronsUpDown, Columns2, Columns3 } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { useUiStore } from '../../store/ui-store';
import { canSplit } from './diff-rows';

export function DiffToolbar({
  diff,
  onExpandContext,
  showStats = true,
}: {
  diff: FileDiff;
  onExpandContext?: (lines: number) => void;
  showStats?: boolean;
}) {
  const showOldGutter = useUiStore((s) => s.diffShowOldGutter);
  const toggleOldGutter = useUiStore((s) => s.toggleDiffOldGutter);
  const diffLayoutPref = useUiStore((s) => s.diffLayout);
  const toggleDiffLayout = useUiStore((s) => s.toggleDiffLayout);

  const effectiveLayout = canSplit(diff) ? diffLayoutPref : 'unified';
  const isSplit = effectiveLayout === 'split';
  const canExpandAll = diff.contextLines < DIFF_FULL_CONTEXT && onExpandContext !== undefined;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showStats ? (
        <span className="mr-auto truncate text-[11px] text-muted-foreground">
          <span className="font-medium text-success tabular-nums">+{diff.insertions}</span>
          {' / '}
          <span className="font-medium text-destructive tabular-nums">−{diff.deletions}</span>
        </span>
      ) : null}

      {canSplit(diff) ? (
        <IconButton
          icon={Columns2}
          label={isSplit ? 'Switch to unified diff' : 'Switch to side-by-side diff'}
          aria-pressed={isSplit}
          size="sm"
          onClick={toggleDiffLayout}
        />
      ) : null}

      {!isSplit ? (
        <IconButton
          icon={showOldGutter ? Columns3 : Columns2}
          label={showOldGutter ? 'Hide original line numbers' : 'Show original line numbers'}
          aria-pressed={showOldGutter}
          size="sm"
          onClick={toggleOldGutter}
        />
      ) : null}

      {canExpandAll ? (
        <IconButton
          icon={ChevronsUpDown}
          label="Show the whole file"
          size="sm"
          onClick={() => onExpandContext(DIFF_FULL_CONTEXT)}
        />
      ) : null}
    </div>
  );
}
