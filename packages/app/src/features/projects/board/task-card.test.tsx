import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { EMPTY_ISSUE_LINK_SET } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { TaskCard } from './task-card';

afterEach(cleanup);

/** `useCardPlay` (Theme A/D) reaches `useDialogs()` unconditionally, so
 *  every render needs the host it expects in the real app tree. */
function renderCard(ui: ReactElement) {
  return render(<DialogHost>{ui}</DialogHost>);
}

const priorityField: ForgeProjectField = { id: 'f-priority', name: 'Priority', dataType: 'text' };

const issue: ForgeProjectItem = {
  id: 'item1',
  content: {
    type: 'issue',
    id: 'I_1',
    number: 42,
    repo: '',
    title: 'Fix the flaky test',
    url: 'https://github.com/acme/widgets/issues/42',
    state: 'open',
    assignees: ['octocat'],
    body: '',
    labels: [],
    dependencies: EMPTY_ISSUE_LINK_SET,
    linkedPrs: [],
  },
  fieldValues: { 'f-priority': { fieldId: 'f-priority', dataType: 'text', text: 'High' } },
};

const draft: ForgeProjectItem = {
  id: 'item2',
  content: { type: 'draft', id: 'DI_1', title: 'Write the design doc', assignees: [], body: '' },
  fieldValues: {},
};

describe('TaskCard', () => {
  it('renders the title, and the issue number linked to github.com', () => {
    renderCard(<TaskCard item={issue} fields={[priorityField]} />);

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    const link = screen.getByText('#42').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
  });

  it('a draft item has no number and no link — never a dead one', () => {
    renderCard(<TaskCard item={draft} fields={[]} />);

    expect(screen.getByText('Write the design doc')).toBeDefined();
    expect(screen.queryByText(/^#/)).toBeNull();
  });

  it('renders an avatar per assignee, by GitHub login', () => {
    renderCard(<TaskCard item={issue} fields={[]} />);

    const avatar = screen.getByAltText('octocat') as HTMLImageElement;
    expect(avatar.src).toContain('github.com/octocat.png');
  });

  it('renders a chip for each field with a value, skipping empty ones', () => {
    const emptyField: ForgeProjectField = { id: 'f-empty', name: 'Empty', dataType: 'text' };
    renderCard(<TaskCard item={issue} fields={[priorityField, emptyField]} />);

    expect(screen.getByText('High')).toBeDefined();
  });

  it('calls onClick when the card is clicked', () => {
    const onClick = vi.fn();
    renderCard(<TaskCard item={issue} fields={[]} onClick={onClick} />);

    fireEvent.click(screen.getByText('Fix the flaky test'));

    expect(onClick).toHaveBeenCalled();
  });

  describe('the running glow (Theme F)', () => {
    beforeEach(() => {
      useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    });

    it('no glow class with no projectId — a card with no board context stays plain', () => {
      const { container } = renderCard(<TaskCard item={issue} fields={[]} />);
      expect(container.querySelector('.agent-run-glow')).toBeNull();
    });

    it('no glow class with a projectId but no bound session', () => {
      const { container } = renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      expect(container.querySelector('.agent-run-glow')).toBeNull();
    });

    it('pulses running once a kanban session is bound to this card', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });

      const { container } = renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      const card = container.querySelector('.agent-run-glow');
      expect(card).not.toBeNull();
      expect(card?.className).toContain('is-running');
    });

    it('no glow for an open pane with no session ever launched — plain browsing, not a left-open terminal', () => {
      const { container } = renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" isOpen />);
      expect(container.querySelector('.agent-run-glow')).toBeNull();
    });

    it('a session bound to this card, ended, with the detail pane open: a static ring', () => {
      const session = useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });
      useTerminalStore.getState().setState(session.id, 'exited');

      const { container } = renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" isOpen />);
      const card = container.querySelector('.agent-run-glow');
      expect(card?.className).toContain('is-open');
    });

    /*
      The colour used to come from `loopGlowColor(agentId)` through a
      `--card-glow-color` custom property — but that table is keyed by LOOP
      id, and `claude` is an AGENT id, so every card resolved to its
      `currentColor` fallback and glowed in the card's own text colour. The
      ramp replaced it, and the ramp is pure CSS: no inline custom property
      at all is the assertion, because a stray one would mean someone
      reintroduced the per-agent colour without touching the stylesheet.
    */
    it('sets no inline glow colour — the ring is the rotating rainbow ramp, from CSS alone', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });

      const { container } = renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      const card = container.querySelector('.agent-run-glow') as HTMLElement;
      expect(card.style.getPropertyValue('--card-glow-color')).toBe('');
      expect(card.getAttribute('style')).toBeNull();
    });
  });

  describe('the play agent / reveal terminal button', () => {
    beforeEach(() => {
      useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
      useUiStore.setState({ terminalOpen: false, terminalListOpen: false, cardSkillByTask: {} });
    });

    it('shows "Start agent" title and aria-label on a card with no session', () => {
      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      const btn = screen.getByTestId('card-play-agent');
      expect(btn).toBeDefined();
      expect(btn.getAttribute('title')).toBe('Start agent');
      expect(btn.getAttribute('aria-label')).toBe('Start agent');
    });

    it('shows Stop and a `>_` toggle instead of Start once a session is bound (Theme G)', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });

      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);

      expect(screen.queryByTestId('card-play-agent')).toBeNull();
      const stopBtn = screen.getByTestId('card-stop-agent');
      expect(stopBtn.getAttribute('title')).toBe('Stop agent');
      const toggleBtn = screen.getByTestId('card-terminal-toggle');
      expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('the `>_` toggle hides the card\'s own embedded terminal (Theme G)', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });

      // No IntersectionObserver in jsdom, so `CardTerminal` renders its
      // off-screen fallback — the "Running" activity line — when open,
      // exactly as `the in-card terminal (Theme E)`'s own suite already
      // asserts for the default-open case.
      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      expect(screen.getByText('Running')).toBeDefined();

      fireEvent.click(screen.getByTestId('card-terminal-toggle'));

      expect(screen.getByTestId('card-terminal-toggle').getAttribute('aria-pressed')).toBe('false');
      expect(screen.queryByText('Running')).toBeNull();
    });

    it('Stop closes the session, confirming first when it is still live', () => {
      const session = useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });
      useTerminalStore.getState().setState(session.id, 'open');

      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      fireEvent.click(screen.getByTestId('card-stop-agent'));

      // No foreground command recorded for this session, so
      // `closeSessionWithConfirm` closes it directly with no dialog.
      expect(useTerminalStore.getState().sessions.find((s) => s.id === session.id)).toBeUndefined();
    });

    it('does not also open the detail pane — the click stops at the button', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });
      const onClick = vi.fn();

      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" onClick={onClick} />);
      fireEvent.click(screen.getByTestId('card-stop-agent'));

      expect(onClick).not.toHaveBeenCalled();
    });

    it('starts an agent session directly when a skill is already set for this card (Theme D)', () => {
      useUiStore.setState({ cardSkillByTask: { 'proj1:item1': 'execAdhoc' } });
      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      fireEvent.click(screen.getByTestId('card-play-agent'));

      expect(useTerminalStore.getState().sessions.length).toBe(1);
      expect(useUiStore.getState().terminalOpen).toBe(true);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('opens a fallback menu with exactly Exec, Ideate, Refine when no skill is set (Theme D)', () => {
      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      fireEvent.click(screen.getByTestId('card-play-agent'));

      expect(screen.getByRole('menuitem', { name: 'Exec' })).toBeDefined();
      expect(screen.getByRole('menuitem', { name: 'Ideate' })).toBeDefined();
      expect(screen.getByRole('menuitem', { name: 'Refine' })).toBeDefined();
      // No launch until a menu entry is actually picked.
      expect(useTerminalStore.getState().sessions.length).toBe(0);
    });

    it('picking a fallback menu entry launches with it and persists the choice (Theme D)', () => {
      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      fireEvent.click(screen.getByTestId('card-play-agent'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ideate' }));

      expect(useTerminalStore.getState().sessions.length).toBe(1);
      expect(useUiStore.getState().terminalOpen).toBe(true);
      expect(useUiStore.getState().cardSkillByTask['proj1:item1']).toBe('brainstorm');
    });
  });

  describe('the in-card terminal (Theme E)', () => {
    beforeEach(() => {
      useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    });

    // jsdom has no `IntersectionObserver` (unstubbed in this file), so every
    // card here behaves exactly as an off-screen one does for real — the
    // free, mount-independent fallback is the one thing that can be asserted
    // without a real browser. The visible/mounted path is
    // `card-terminal.test.tsx`'s job.
    it('renders the activity line for a running session, not the terminal, with no IntersectionObserver', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });

      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);

      expect(screen.getByText('Running')).toBeDefined();
    });

    it('clicking the activity line still opens the card — it is a status pill, not a terminal', () => {
      useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });
      const onClick = vi.fn();

      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" onClick={onClick} />);
      fireEvent.click(screen.getByText('Running'));

      expect(onClick).toHaveBeenCalled();
    });

    it('renders neither for a card with no session', () => {
      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      expect(screen.queryByText('Running')).toBeNull();
    });

    it('renders neither once the session has ended', () => {
      const session = useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });
      useTerminalStore.getState().setState(session.id, 'exited');

      renderCard(<TaskCard item={issue} fields={[]} projectId="proj1" />);

      expect(screen.queryByText('Running')).toBeNull();
    });
  });
});
