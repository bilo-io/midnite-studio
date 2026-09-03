import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { TaskCard } from './task-card';

afterEach(cleanup);

const priorityField: ForgeProjectField = { id: 'f-priority', name: 'Priority', dataType: 'text' };

const issue: ForgeProjectItem = {
  id: 'item1',
  content: {
    type: 'issue',
    id: 'I_1',
    number: 42,
    title: 'Fix the flaky test',
    url: 'https://github.com/acme/widgets/issues/42',
    state: 'open',
    assignees: ['octocat'],
    body: '',
    labels: [],
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
    render(<TaskCard item={issue} fields={[priorityField]} />);

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    const link = screen.getByText('#42').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
  });

  it('a draft item has no number and no link — never a dead one', () => {
    render(<TaskCard item={draft} fields={[]} />);

    expect(screen.getByText('Write the design doc')).toBeDefined();
    expect(screen.queryByText(/^#/)).toBeNull();
  });

  it('renders an avatar per assignee, by GitHub login', () => {
    render(<TaskCard item={issue} fields={[]} />);

    const avatar = screen.getByAltText('octocat') as HTMLImageElement;
    expect(avatar.src).toContain('github.com/octocat.png');
  });

  it('renders a chip for each field with a value, skipping empty ones', () => {
    const emptyField: ForgeProjectField = { id: 'f-empty', name: 'Empty', dataType: 'text' };
    render(<TaskCard item={issue} fields={[priorityField, emptyField]} />);

    expect(screen.getByText('High')).toBeDefined();
  });

  it('calls onClick when the card is clicked', () => {
    const onClick = vi.fn();
    render(<TaskCard item={issue} fields={[]} onClick={onClick} />);

    fireEvent.click(screen.getByText('Fix the flaky test'));

    expect(onClick).toHaveBeenCalled();
  });

  describe('the running glow (Theme F)', () => {
    beforeEach(() => {
      useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    });

    it('no glow class with no projectId — a card with no board context stays plain', () => {
      const { container } = render(<TaskCard item={issue} fields={[]} />);
      expect(container.querySelector('.card-run-glow')).toBeNull();
    });

    it('no glow class with a projectId but no bound session', () => {
      const { container } = render(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      expect(container.querySelector('.card-run-glow')).toBeNull();
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

      const { container } = render(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      const card = container.querySelector('.card-run-glow');
      expect(card).not.toBeNull();
      expect(card?.className).toContain('is-running');
    });

    it('no glow for an open pane with no session ever launched — plain browsing, not a left-open terminal', () => {
      const { container } = render(<TaskCard item={issue} fields={[]} projectId="proj1" isOpen />);
      expect(container.querySelector('.card-run-glow')).toBeNull();
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

      const { container } = render(<TaskCard item={issue} fields={[]} projectId="proj1" isOpen />);
      const card = container.querySelector('.card-run-glow');
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

      const { container } = render(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      const card = container.querySelector('.card-run-glow') as HTMLElement;
      expect(card.style.getPropertyValue('--card-glow-color')).toBe('');
      expect(card.getAttribute('style')).toBeNull();
    });
  });

  describe('the reveal-terminal button', () => {
    beforeEach(() => {
      useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
      useUiStore.setState({ terminalOpen: false, terminalListOpen: false });
    });

    it('is absent on a card that has never launched an agent', () => {
      render(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      expect(screen.queryByTestId('card-reveal-terminal')).toBeNull();
    });

    it('reveals the bound session in the terminal panel', () => {
      const session = useTerminalStore.getState().openSession({
        kind: 'agent',
        agentId: 'claude',
        title: 'card',
        cwd: '/repo',
        repoId: 'r1',
        surface: 'kanban',
        taskRef: { projectId: 'proj1', itemId: issue.id },
      });

      render(<TaskCard item={issue} fields={[]} projectId="proj1" />);
      fireEvent.click(screen.getByTestId('card-reveal-terminal'));

      expect(useUiStore.getState().terminalOpen).toBe(true);
      expect(useTerminalStore.getState().activeId).toBe(session.id);
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

      render(<TaskCard item={issue} fields={[]} projectId="proj1" onClick={onClick} />);
      fireEvent.click(screen.getByTestId('card-reveal-terminal'));

      expect(onClick).not.toHaveBeenCalled();
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
    // `card-terminal.test.tsx`'s job; the granted-vs-visible split is
    // `card-terminal-mounts.test.ts`'s.
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

      render(<TaskCard item={issue} fields={[]} projectId="proj1" />);

      expect(screen.getByText('Running')).toBeDefined();
    });

    it('renders neither for a card with no session', () => {
      render(<TaskCard item={issue} fields={[]} projectId="proj1" />);
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

      render(<TaskCard item={issue} fields={[]} projectId="proj1" />);

      expect(screen.queryByText('Running')).toBeNull();
    });
  });
});
