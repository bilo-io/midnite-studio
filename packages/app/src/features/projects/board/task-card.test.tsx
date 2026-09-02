import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  },
  fieldValues: { 'f-priority': { fieldId: 'f-priority', dataType: 'text', text: 'High' } },
};

const draft: ForgeProjectItem = {
  id: 'item2',
  content: { type: 'draft', id: 'DI_1', title: 'Write the design doc', assignees: [] },
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
  });
});
