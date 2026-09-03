import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeProjectItem, TerminalSession } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CardComposer } from './card-composer';
import { DialogHost } from '../../../components/dialog-host';
import { useUiStore } from '../../../store/ui-store';
import { useToastStore } from '../../../store/toast-store';
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
  // Launch and run's confirm (Theme B) reaches `useDialogs()` unconditionally
  // — every render needs the host it expects in the real app tree, same as
  // `board-view.test.tsx`'s own `renderWithClient`.
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <CardComposer projectId="PVT_1" repoId="repo-1" worktreePath="/repo/widgets" item={item} />
      </DialogHost>
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
    useUiStore.setState({ terminalOpen: false, terminalListOpen: false, launchAndRunEnabled: false });
    useToastStore.setState({ toasts: [] });
  });

  it('seeds the prompt from the card and shows the composed command above Start', () => {
    renderComposer();

    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Fix the flaky test (#42)');
    expect(textarea.value).toContain('Steps to reproduce…');

    // Theme B (Phase 50) wraps Start alongside a conditional "Launch and
    // run" button in its own row div, so the composed-command preview is no
    // longer inside `card-start`'s nearest ancestor `div` — asserted on its
    // own stable test id instead of a DOM-distance-dependent traversal.
    expect(screen.getByTestId('card-command-preview').textContent).toContain('claude');
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

  it('Stop puts the session to sleep — the session stays bound, so the form does not come back on its own (Phase 50 Theme A)', () => {
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
    expect(screen.queryByTestId('card-start')).toBeNull();
    expect(screen.getByTestId('card-dismiss')).toBeDefined();
  });

  describe('the concurrent-session soft warning (Phase 50 Theme A)', () => {
    const otherLiveSession = (n: number): TerminalSession => ({
      id: `other-${n}`,
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo/widgets',
      repoId: 'repo-1',
      createdAt: 1,
      surface: 'kanban',
      taskRef: { projectId: 'PVT_1', itemId: `other-item-${n}` },
    });

    it('warns, but still launches, once this would be the 6th concurrently-live card session', () => {
      const others = [1, 2, 3, 4, 5].map(otherLiveSession);
      useTerminalStore.setState({
        sessions: others,
        activeId: null,
        states: Object.fromEntries(others.map((s) => [s.id, 'open'])),
        pendingInput: {},
      });

      renderComposer();
      fireEvent.click(screen.getByTestId('card-start'));

      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0]).toMatchObject({ status: 'warning' });
      // Soft — never a block: the launch still happens.
      expect(useTerminalStore.getState().sessions).toHaveLength(6);
    });

    it('no warning below the threshold', () => {
      const others = [1, 2, 3, 4].map(otherLiveSession);
      useTerminalStore.setState({
        sessions: others,
        activeId: null,
        states: Object.fromEntries(others.map((s) => [s.id, 'open'])),
        pendingInput: {},
      });

      renderComposer();
      fireEvent.click(screen.getByTestId('card-start'));

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('Dismiss (Phase 50 Theme A)', () => {
    it('is absent for a still-live session — Stop is the control there, not Dismiss', () => {
      useTerminalStore.setState({
        sessions: [liveSession()],
        activeId: null,
        states: { s1: 'open' },
        pendingInput: {},
      });

      renderComposer();

      expect(screen.queryByTestId('card-dismiss')).toBeNull();
    });

    it('clears the binding and brings the Start form back', () => {
      useTerminalStore.setState({
        sessions: [liveSession()],
        activeId: null,
        states: { s1: 'exited' },
        pendingInput: {},
      });

      renderComposer();
      expect(screen.queryByTestId('card-start')).toBeNull();

      fireEvent.click(screen.getByTestId('card-dismiss'));

      const dismissed = useTerminalStore.getState().sessions.find((s) => s.id === 's1');
      expect(dismissed?.surface).toBeUndefined();
      expect(dismissed?.taskRef).toBeUndefined();
      expect(screen.getByTestId('card-start')).toBeDefined();
    });

    it('a fresh Start after Dismiss is the session findAnyCardSession resolves — not the old one', () => {
      useTerminalStore.setState({
        sessions: [liveSession()],
        activeId: null,
        states: { s1: 'exited' },
        pendingInput: {},
      });

      renderComposer();
      fireEvent.click(screen.getByTestId('card-dismiss'));
      fireEvent.click(screen.getByTestId('card-start'));

      const bound = useTerminalStore
        .getState()
        .sessions.filter((s) => s.surface === 'kanban' && s.taskRef?.itemId === 'item1');
      expect(bound).toHaveLength(1);
      expect(bound[0]?.id).not.toBe('s1');
    });
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

  describe('the Terminal button', () => {
    it('is absent until this card has a session', () => {
      renderComposer();
      expect(screen.queryByTestId('composer-reveal-terminal')).toBeNull();
    });

    it('reveals a live session in the terminal panel', () => {
      useTerminalStore.setState({
        sessions: [liveSession()],
        states: { s1: 'open' },
        activeId: null,
        pendingInput: {},
      });

      renderComposer();
      fireEvent.click(screen.getByTestId('composer-reveal-terminal'));

      expect(useUiStore.getState().terminalOpen).toBe(true);
      expect(useTerminalStore.getState().activeId).toBe('s1');
    });

    it('is offered for an ENDED session too — the scrollback is the answer to "what did it do"', () => {
      useTerminalStore.setState({
        sessions: [liveSession()],
        states: { s1: 'exited' },
        activeId: null,
        pendingInput: {},
      });

      renderComposer();
      expect(screen.getByText('Ended')).toBeDefined();
      expect(screen.queryByTestId('card-stop')).toBeNull();
      expect(screen.getByTestId('card-dismiss')).toBeDefined();
      fireEvent.click(screen.getByTestId('composer-reveal-terminal'));

      expect(useTerminalStore.getState().activeId).toBe('s1');
    });
  });

  describe('Launch and run (Phase 50 Theme B)', () => {
    it('is not rendered at all with the setting off — the default', () => {
      renderComposer();

      expect(screen.getByTestId('card-start')).toBeDefined();
      expect(screen.queryByTestId('card-launch-and-run')).toBeNull();
    });

    it('appears beside Start once the setting is on', () => {
      useUiStore.setState({ launchAndRunEnabled: true });
      renderComposer();

      expect(screen.getByTestId('card-launch-and-run')).toBeDefined();
    });

    it('opens a confirm showing the exact command and sends nothing before it is accepted', () => {
      useUiStore.setState({ launchAndRunEnabled: true });
      renderComposer();

      const preview = screen.getByTestId('card-command-preview').textContent!;
      fireEvent.click(screen.getByTestId('card-launch-and-run'));

      // The dialog body is the command preview verbatim: what gets confirmed
      // is what gets run, which is the whole reason this path is confirmed
      // every time rather than only the first. Queried inside the dialog,
      // since the composer's own preview line carries the same text.
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByText('Launch and run?')).toBeDefined();
      expect(dialog.getByText(preview)).toBeDefined();
      // Nothing launched yet — the confirm is a gate, not a receipt.
      expect(useTerminalStore.getState().sessions).toHaveLength(0);
    });

    it('cancelling the confirm launches nothing', () => {
      useUiStore.setState({ launchAndRunEnabled: true });
      renderComposer();

      fireEvent.click(screen.getByTestId('card-launch-and-run'));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      expect(useTerminalStore.getState().sessions).toHaveLength(0);
    });

    it('confirming queues the prompt WITH the send — the one difference from Start', () => {
      useUiStore.setState({ launchAndRunEnabled: true });
      renderComposer();

      fireEvent.click(screen.getByTestId('card-launch-and-run'));
      // Scoped to the dialog: the trigger button carries the same label.
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Launch and run' }),
      );

      const sessions = useTerminalStore.getState().sessions;
      expect(sessions).toHaveLength(1);
      const created = sessions[0]!;
      // Same binding as Start's: only `autoSend` differs, because both paths
      // funnel through the one `launch()`.
      expect(created.surface).toBe('kanban');
      expect(created.taskRef).toEqual({ projectId: 'PVT_1', itemId: 'item1' });

      const queued = useTerminalStore.getState().pendingInput[created.id];
      expect(queued).toContain('Fix the flaky test (#42)');
      expect(queued?.endsWith('\r')).toBe(true); // autoSend: true — sent, not just typed
    });
  });
});
