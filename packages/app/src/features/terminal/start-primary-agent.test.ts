import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { startClaude, startPrimaryAgent } from './start-primary-agent';
import { useTerminalStore } from './terminal-store';

describe('startPrimaryAgent', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], pendingInput: {} });
    useUiStore.setState({ primaryAgent: 'claude', terminalOpen: false });
  });

  it('launches the default primary agent (Claude) into a new session with prompt queued', () => {
    startPrimaryAgent({
      repoId: 'repo-1',
      cwd: '/path/to/repo',
      title: 'Conflict resolution',
      prompt: 'Resolve conflict in file.ts',
    });

    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      kind: 'agent',
      agentId: 'claude',
      title: 'Conflict resolution',
      cwd: '/path/to/repo',
      repoId: 'repo-1',
    });
    expect(useTerminalStore.getState().pendingInput[sessions[0]!.id]).toContain(
      'Resolve conflict in file.ts',
    );
    expect(useUiStore.getState().terminalOpen).toBe(true);
  });

  it('launches whichever primary agent is selected in ui-store', () => {
    useUiStore.setState({ primaryAgent: 'codex' });

    startPrimaryAgent({
      repoId: 'repo-1',
      cwd: '/path/to/repo',
      title: 'Codex resolution',
      prompt: 'Fix it',
    });

    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      kind: 'agent',
      agentId: 'codex',
      title: 'Codex resolution',
    });
  });

  it('startClaude is an alias for startPrimaryAgent', () => {
    useUiStore.setState({ primaryAgent: 'agy' });

    startClaude({
      repoId: 'repo-1',
      cwd: '/path/to/repo',
      title: 'Antigravity session',
      prompt: 'Help me',
    });

    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      kind: 'agent',
      agentId: 'agy',
    });
  });
});
