import type { ForgePull, ForgeRun } from '@midnite/studio-shared';
import React from 'react';
import { LuGitPullRequest } from 'react-icons/lu';

import { useReviewsStore } from '../../store/reviews-store';
import { useUiStore } from '../../store/ui-store';
import type { ForgeTone } from '../forge/forge-status';

export type ActionItemStyle = {
  textClass: string;
  subtextClass: string;
  glowClass: string;
  rowClass: string;
};

export function getActionItemStyle(tone: ForgeTone): ActionItemStyle {
  switch (tone) {
    case 'ok':
      return {
        textClass: 'text-emerald-500 dark:text-emerald-400',
        subtextClass: 'text-emerald-500/80 dark:text-emerald-400/80',
        glowClass: 'actions-glow-ok',
        rowClass: '',
      };
    case 'fail':
      return {
        textClass: 'text-red-500 dark:text-red-400',
        subtextClass: 'text-red-500/80 dark:text-red-400/80',
        glowClass: 'actions-glow-fail',
        rowClass: '',
      };
    case 'busy':
      return {
        textClass: 'text-orange-500 dark:text-orange-400',
        subtextClass: 'text-orange-500/80 dark:text-orange-400/80',
        glowClass: '',
        rowClass: 'actions-item-running',
      };
    case 'warn':
      return {
        textClass: 'text-amber-500 dark:text-amber-400',
        subtextClass: 'text-amber-500/80 dark:text-amber-400/80',
        glowClass: '',
        rowClass: '',
      };
    case 'idle':
    default:
      return {
        textClass: 'text-muted-foreground',
        subtextClass: 'text-muted-foreground/80',
        glowClass: '',
        rowClass: '',
      };
  }
}

/**
 * Resolve the pull request number associated with a workflow run.
 *
 * Checks:
 * 1. Matching head branch against pull requests list (if provided)
 * 2. Pull request branch pattern in headBranch (e.g. pull/123, pr-123)
 * 3. Pull request reference in displayTitle (e.g. (#123), pull/123)
 */
export function findRunPrNumber(
  run: ForgeRun,
  pulls?: readonly ForgePull[] | null,
): number | null {
  if (pulls && run.headBranch) {
    const matched = pulls.find((p) => p.headBranch === run.headBranch);
    if (matched) return matched.number;
  }

  if (run.headBranch) {
    const branchMatch = run.headBranch.match(/(?:^|\/)(?:pull|pr)[/-](\d+)(?:$|\/)/i);
    if (branchMatch?.[1]) {
      const num = parseInt(branchMatch[1], 10);
      if (!Number.isNaN(num)) return num;
    }
  }

  if (run.displayTitle) {
    const titleMatch = run.displayTitle.match(/(?:#|pull\/)(\d+)\b/);
    if (titleMatch?.[1]) {
      const num = parseInt(titleMatch[1], 10);
      if (!Number.isNaN(num)) return num;
    }
  }

  return null;
}

export function RunPrLink({
  repoId,
  prNumber,
  className = '',
}: {
  repoId: string;
  prNumber: number;
  className?: string;
}) {
  const selectRepo = useUiStore((s) => s.selectRepo);
  const selectPull = useReviewsStore((s) => s.selectPull);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    selectRepo(repoId);
    selectPull(repoId, prNumber);
    setActiveView('reviews');
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded bg-accent/60 px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors hover:bg-accent hover:underline cursor-pointer ${className}`}
      title={`Open review #${prNumber}`}
      aria-label={`Open review #${prNumber}`}
    >
      <LuGitPullRequest className="size-3 shrink-0" aria-hidden />
      <span className="tabular-nums">#{prNumber}</span>
    </span>
  );
}
