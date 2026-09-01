import { useEffect, useRef } from 'react';
import type { FabTab } from '../../store/ui-store';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { TerminalView } from '../terminal/terminal-view';
import { startAgent } from '../terminal/start-agent';
import { useRepos } from '../../services/queries';

interface FabTerminalViewProps {
  tabId: FabTab;
  prompt: string;
}

export function FabTerminalView({ tabId, prompt }: FabTerminalViewProps) {
  const sessionIdRef = useRef<string | null>(null);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const sessions = useTerminalStore((s) => s.sessions);
  const repos = useRepos();
  const selectedRepo = repos.data?.find((r) => r.id === selectedRepoId);

  useEffect(() => {
    if (!selectedRepoId || !selectedRepo || sessionIdRef.current) return;

    // Spawn a new terminal session for this FAB tab
    startAgent({
      repoId: selectedRepoId,
      cwd: selectedRepo.path,
      title: `FAB: ${tabId}`,
      prompt,
      agentId: 'claude',
      command: 'claude',
    });

    // Find the most recently created session (should be ours)
    if (sessions.length > 0) {
      const newestSession = sessions[sessions.length - 1];
      sessionIdRef.current = newestSession.id;
    }
  }, [selectedRepoId, selectedRepo, tabId, prompt, sessions]);

  const sessionId = sessionIdRef.current;
  if (!sessionId) return null;

  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  return (
    <div className="h-full w-full">
      <TerminalView sessionId={sessionId} fitSignal={0} />
    </div>
  );
}
