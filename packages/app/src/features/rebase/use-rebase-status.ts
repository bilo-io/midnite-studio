import { useState, useEffect, useCallback } from 'react';
import { RebaseStatusState } from '@midnite/git-shared';

export function useRebaseStatus(repoId: string | null) {
  const [status, setStatus] = useState<RebaseStatusState>({ inProgress: false });

  const refreshStatus = useCallback(async () => {
    if (!repoId || !window.midniteGit) {
      setStatus({ inProgress: false });
      return;
    }
    try {
      const res = await window.midniteGit.rebase.status({ repoId });
      setStatus(res);
    } catch {
      setStatus({ inProgress: false });
    }
  }, [repoId]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 2000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleContinue = async () => {
    if (!repoId) return;
    await window.midniteGit?.rebase.continue({ repoId });
    await refreshStatus();
  };

  const handleSkip = async () => {
    if (!repoId) return;
    await window.midniteGit?.rebase.skip({ repoId });
    await refreshStatus();
  };

  const handleAbort = async () => {
    if (!repoId) return;
    await window.midniteGit?.rebase.abort({ repoId });
    await refreshStatus();
  };

  return {
    status,
    refreshStatus,
    handleContinue,
    handleSkip,
    handleAbort,
  };
}
