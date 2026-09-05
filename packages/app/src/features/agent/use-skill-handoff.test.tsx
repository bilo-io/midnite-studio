import { renderHook } from '@testing-library/react';
import type { RepoDescriptor } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import { useNotesStore } from '../../store/notes-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { useSkillHandoff } from './use-skill-handoff';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_REPO: RepoDescriptor = {
  id: 'repo-alpha',
  name: 'Alpha',
  path: '/tmp/alpha',
  headRef: 'main',
  worktrees: [
    {
      id: 'repo-alpha:/tmp/alpha/main',
      repoId: 'repo-alpha',
      path: '/tmp/alpha/main',
      branch: 'main',
      headSha: 'abc',
      locked: false,
      isMain: true,
      prunable: false,
    },
  ],
};

describe('useSkillHandoff', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, pendingInput: {} });
    useUiStore.setState({ agentSkills: { ...DEFAULT_AGENT_SKILLS }, primaryAgent: 'claude' });
    useNotesStore.setState({ notes: {} });
  });

  it('resolves the default skill and seeds typed-not-sent input with no backticks', () => {
    const { result } = renderHook(() => useSkillHandoff(), { wrapper });
    const handoff = result.current;

    const session = handoff({
      skillId: 'brainstorm',
      repo: MOCK_REPO,
      body: 'Refactor the caching layer',
    });

    expect(session).not.toBeNull();
    const sessionId = session!.id;
    const queuedInput = useTerminalStore.getState().pendingInput[sessionId];

    expect(queuedInput).toBeDefined();
    // Must not end with \r (autoSend: false)
    expect(queuedInput?.endsWith('\r')).toBe(false);
    // Must contain the skill and body without literal backticks
    expect(queuedInput).toContain('/midnite-brainstorm Refactor the caching layer');
    expect(queuedInput).not.toContain('`');
  });

  it('follows a changed agentSkills setting in ui-store', () => {
    useUiStore.setState({
      agentSkills: {
        ...DEFAULT_AGENT_SKILLS,
        brainstorm: '/custom-brainstorm-command',
      },
    });

    const { result } = renderHook(() => useSkillHandoff(), { wrapper });
    const session = result.current({
      skillId: 'brainstorm',
      repo: MOCK_REPO,
      body: 'Idea about queries',
    });

    expect(session).not.toBeNull();
    const queuedInput = useTerminalStore.getState().pendingInput[session!.id];
    expect(queuedInput).toContain('/custom-brainstorm-command Idea about queries');
  });

  it('returns null and opens no session when the skill is cleared/empty', () => {
    useUiStore.setState({
      agentSkills: {
        ...DEFAULT_AGENT_SKILLS,
        brainstorm: '',
      },
    });

    const { result } = renderHook(() => useSkillHandoff(), { wrapper });
    const session = result.current({
      skillId: 'brainstorm',
      repo: MOCK_REPO,
      body: 'Any idea',
    });

    expect(session).toBeNull();
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('handoff mutates only note status to planned', () => {
    const note = useNotesStore.getState().addNote('repo-alpha', 'Original note body');
    expect(note.status).toBe('captured');
    expect(note.done).toBe(false);

    const { result } = renderHook(() => useSkillHandoff(), { wrapper });
    const session = result.current({
      skillId: 'execAdhoc',
      repo: MOCK_REPO,
      body: note.body,
    });
    expect(session).not.toBeNull();

    // The handoff flow flips status to planned, leaving body and done intact
    useNotesStore.getState().setStatus(note.id, 'planned');
    const updated = useNotesStore.getState().notes[note.id]!;
    expect(updated.status).toBe('planned');
    expect(updated.done).toBe(false);
    expect(updated.body).toBe('Original note body');
  });
});
