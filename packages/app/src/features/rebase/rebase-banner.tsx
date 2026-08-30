import React from 'react';
import { RebaseStatusState } from '@midnite/git-shared';
import { LuTriangleAlert, LuCheck, LuFastForward, LuX } from 'react-icons/lu';

export type RebaseBannerProps = {
  status: RebaseStatusState;
  onContinue: () => Promise<void>;
  onSkip: () => Promise<void>;
  onAbort: () => Promise<void>;
};

export const RebaseBanner: React.FC<RebaseBannerProps> = ({
  status,
  onContinue,
  onSkip,
  onAbort,
}) => {
  if (!status.inProgress) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs font-medium animate-in fade-in duration-150">
      <div className="flex items-center gap-2">
        <LuTriangleAlert className="w-4 h-4 text-amber-500 animate-pulse" />
        <span>
          Interactive Rebase In Progress
          {status.currentStep && status.totalSteps
            ? ` (step ${status.currentStep} of ${status.totalSteps})`
            : ''}
          : {status.pausedReason === 'conflict' ? 'Resolve conflicts in Changes tab' : 'Paused'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm"
        >
          <LuCheck className="w-3.5 h-3.5" />
          Continue Rebase
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-amber-500/40 bg-background/50 hover:bg-background/80 transition-colors"
        >
          <LuFastForward className="w-3.5 h-3.5" />
          Skip Commit
        </button>
        <button
          type="button"
          onClick={onAbort}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LuX className="w-3.5 h-3.5" />
          Abort Rebase
        </button>
      </div>
    </div>
  );
};
