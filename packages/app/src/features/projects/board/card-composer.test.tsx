import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectItem, TerminalSession } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardComposer } from './card-composer';
import { useTerminalStore } from '../../terminal/terminal-store';

afterEach(cleanup);

const agentList = vi.fn(async () => ({
  agents: [
    { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#000' },
    { id: 'codex', label: 'Codex', command: 'codex', args: [], accent: '#111' },
  ],
  status: [],
}));

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    terminal: { list: vi.fn(async () => ({ sessions: [] })), save: vi.fn() },
    agent: { list: agentList },
  }),
  hasBridge: () => true,
}));

const item: ForgeProjectItem = {
  id: 'item1',
  content: {
    type: 'issue',
    id: 'I_1',
    number: 42,
    title: 'Fix the flaky test',
    url: 'https://github.com/acme/widgets/issues/42',
    state: 'open',
    assignees: ['octocat'],
    body: 'Steps to reproduce…',
    labels: ['bug'],
  },
  fieldValues: {},
};

function renderComposer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardComposer projectId="PVT_1" repoId="repo-1" worktreePath="/repo/widgets" item={item} />
    </QueryClientProvider>,
  );
}

const liveSession = (): TerminalSession => ({
  id: 's1',
  kind: 'agent',
  agentId: 'claude',
  title: 'card',
  cwd: '/repo/widgets',
  repoId: 'repo-1',
  createdAt: 1,
  surface: 'kanban',
  taskRef: { projectId: 'PVT_1', itemId: 'item1' },
});

describe('CardComposer', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      sessions: [],
      activeId: null,
      states: {},
      pendingInput: {},
    });
  });

  it('seeds the prompt from the card and shows the composed command above Start', () => {
    renderComposer();

    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Fix the flaky test (#42)');
    expect(textarea.value).toContain('Steps to reproduce…');

    expect(screen.getByTestId('card-start').closest('div')?.textContent).toContain('claude');
  });

  it('Start opens a kanban session bound to the card via taskRef, prompt queued but not sent', () => {
    renderComposer();

    fireEvent.click(screen.getByTestId('card-start'));

    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    const created = sessions[0]!;
    expect(created.surface).toBe('kanban');
    expect(created.taskRef).toEqual({ projectId: 'PVT_1', itemId: 'item1' });
    expect(created.repoId).toBe('repo-1');
    expect(created.cwd).toBe('/repo/widgets');

    const queued = useTerminalStore.getState().pendingInput[created.id];
    expect(queued).toContain('Fix the flaky test (#42)');
    expect(queued?.endsWith('\r')).toBe(false); // autoSend: false — typed, not sent
  });

  it('editing the prompt before Start changes what gets queued', () => {
    renderComposer();

    const textarea = screen.getByLabelText('Prompt');
    fireEvent.change(textarea, { target: { value: 'A hand-edited prompt' } });
    fireEvent.click(screen.getByTestId('card-start'));

    const created = useTerminalStore.getState().sessions[0]!;
    expect(useTerminalStore.getState().pendingInput[created.id]).toContain('A hand-edited prompt');
  });

  it('a live session (found via findCardSession) hides the form and shows Stop instead of a second Start', () => {
    useTerminalStore.setState({
      sessions: [liveSession()],
      activeId: null,
      states: { s1: 'open' },
      pendingInput: {},
    });

    renderComposer();

    expect(screen.getByText('Running')).toBeDefined();
    expect(screen.queryByTestId('card-start')).toBeNull();
    expect(screen.getByTestId('card-stop')).toBeDefined();
  });

  it('Stop puts the session to sleep, and the form comes back — reactively, off the store', () => {
    useTerminalStore.setState({
      sessions: [liveSession()],
      activeId: null,
      states: { s1: 'open' },
      pendingInput: {},
    });

    renderComposer();
    fireEvent.click(screen.getByTestId('card-stop'));

    const slept = useTerminalStore.getState().sessions.find((s) => s.id === 's1');
    expect(slept?.asleep).toBe(true);
    expect(screen.getByTestId('card-start')).toBeDefined();
  });

  it('picking a model for Claude adds a --model flag to the queued command', () => {
    renderComposer();

    const modelInput = screen.getByLabelText('Model');
    fireEvent.mouseDown(modelInput);
    fireEvent.click(screen.getByText('Opus 5'));

    fireEvent.click(screen.getByTestId('card-start'));

    const created = useTerminalStore.getState().sessions[0]!;
    expect(useTerminalStore.getState().pendingInput[created.id]).toContain('--model claude-opus-5');
  });

  it('switching to an agent with no model flag disables Model and drops back to Default', () => {
    renderComposer();

    const agentInput = screen.getByLabelText('Agent');
    fireEvent.mouseDown(agentInput);
    fireEvent.click(screen.getByText('Codex'));

    const modelInput = screen.getByLabelText('Model') as HTMLInputElement;
    expect(modelInput.disabled).toBe(true);
    expect(screen.getByText('Default')).toBeDefined();

    fireEvent.click(screen.getByTestId('card-start'));
    const created = useTerminalStore.getState().sessions[0]!;
    expect(useTerminalStore.getState().pendingInput[created.id]).not.toContain('--model');
  });
});
