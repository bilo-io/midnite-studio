// vitest/jsdom: the Tasks tab, issue detail and New issue over the real provider tree and a fake data source
// (Phase 146 H). jsdom is enough: sheets and writes are driven through events, not real layout or pointer drag.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerCalls, setParams } from '../../test/mocks/expo-router';
import { renderInShell, resetShellState } from '../../test/shell-harness';
import { fail, ok } from '../data/source';
import { usePrefs } from '../state/prefs';
import { IssueDetailScreen } from './issue-detail-screen';
import { MoveSheet } from './move-sheet';
import { NewIssueScreen } from './new-issue-screen';
import { TasksScreen } from './tasks-screen';
import { useMoveItem } from './use-move-item';

const repoPref = { owner: 'bilo-io', name: 'midnite-studio', defaultBranch: 'main' };
const REPO = { owner: 'bilo-io', name: 'midnite-studio' };
const project = { id: 'P1', number: 1, title: 'Roadmap', url: '', closed: false, linkedToRepo: true };
const fields = [
  {
    id: 'f1',
    name: 'Status',
    dataType: 'single_select',
    options: [
      { id: 'o1', name: 'Todo', color: 'GRAY' },
      { id: 'o2', name: 'Done', color: 'GREEN' },
    ],
  },
];
const item = (id: string, n: number, title: string, optionId: string) => ({
  id,
  content: {
    type: 'issue',
    id: `c-${id}`,
    number: n,
    repo: '',
    title,
    url: '',
    state: 'open',
    assignees: ['octo'],
    body: '',
    labels: ['ui'],
    dependencies: { blockedBy: [], parent: null, subIssues: [] },
    linkedPrs: [],
  },
  fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select', optionId, name: '' } },
});
const items = [item('i1', 1, 'First task', 'o1'), item('i2', 2, 'Second task', 'o2')];
const page = (xs: unknown[]) => ok({ items: xs, nextCursor: null });

const base = () => ({
  viewer: async () => ok({ login: 'octo', name: null, avatarUrl: null }),
  listProjects: async () => ok([project]),
  projectFields: async () => ok(fields),
  projectItems: async () => page(items),
  projectGraph: async () => ok({ nodes: [], edges: [], truncated: false, totalCount: 0, kind: 'ok' }),
});

beforeEach(() => {
  routerCalls.length = 0;
  setParams({});
  resetShellState({ currentRepo: repoPref });
});
afterEach(cleanup);

describe('Tasks tab', () => {
  it('shows the project chip, the view switch and the board columns with cards', async () => {
    await renderInShell(<TasksScreen />, base());
    expect(await screen.findByText('Roadmap')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Board', 'List', 'Graph']);
    expect(await screen.findByText('First task')).toBeTruthy();
    expect(screen.getByText('Second task')).toBeTruthy();
    expect(screen.getAllByTestId(/^column-dot/)).toHaveLength(3); // No Status, Todo, Done
  });

  it('a card reads as one sentence', async () => {
    await renderInShell(<TasksScreen />, base());
    const card = await screen.findByTestId('task-card-i1');
    expect(card.getAttribute('aria-label')).toContain('#1, First task.');
    expect(card.getAttribute('aria-label')).toContain('Labels ui.');
  });

  it('remembers the chosen view per project and renders the list grouped, searchable', async () => {
    await renderInShell(<TasksScreen />, base());
    await screen.findByText('First task');
    fireEvent.click(screen.getByText('List'));
    expect(usePrefs.getState().tasksViewByProject.P1).toBe('list');
    expect(await screen.findByTestId('list-view')).toBeTruthy();
    expect(screen.getByText(/TODO · 1/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No items match')).toBeTruthy();
    fireEvent.click(screen.getByText('Clear filters'));
    expect(await screen.findByText('First task')).toBeTruthy();
  });

  it('a graph with no edges offers the list instead', async () => {
    usePrefs.getState().setTasksView('P1', 'graph');
    await renderInShell(<TasksScreen />, base());
    expect(await screen.findByText('No dependencies in this project')).toBeTruthy();
    fireEvent.click(screen.getByText('View as list'));
    expect(usePrefs.getState().tasksViewByProject.P1).toBe('list');
  });

  it('a graph with edges draws one path per edge', async () => {
    usePrefs.getState().setTasksView('P1', 'graph');
    const graph = {
      nodes: [
        { itemId: 'i1', number: 1, repo: '', title: 'First task', kind: 'issue', state: 'open', blocked: true, ready: false, unmetBlockerCount: 1, foreign: false, truncated: false },
        { itemId: 'i2', number: 2, repo: '', title: 'Second task', kind: 'issue', state: 'open', blocked: false, ready: true, unmetBlockerCount: 0, foreign: false, truncated: false },
      ],
      edges: [{ from: '#1', to: '#2', kind: 'blocks', source: 'api' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };
    await renderInShell(<TasksScreen />, { ...base(), projectGraph: async () => ok(graph) });
    expect(await screen.findByTestId('graph-view')).toBeTruthy();
    expect(screen.getByTestId('graph-zoom').textContent).toBe('100%');
  });

  it('a repo with no projects falls back to its issues', async () => {
    await renderInShell(<TasksScreen />, {
      ...base(),
      listProjects: async () => ok([]),
      listIssues: async () => page([{ number: 5, title: 'Plain issue', state: 'open' }]),
    });
    expect(await screen.findByText('This repo has no GitHub Projects')).toBeTruthy();
    fireEvent.click(await screen.findByText('Plain issue'));
    expect(routerCalls).toContainEqual({ method: 'push', href: '/tasks/issue/5' });
  });

  it('a missing permission reads as a scope state', async () => {
    await renderInShell(<TasksScreen />, { ...base(), listProjects: async () => fail('scope', 'x') });
    expect(await screen.findByText('This needs another GitHub permission')).toBeTruthy();
  });
});

describe('Move to…', () => {
  const field = fields[0] as never;

  it('lists the options and reports the choice', async () => {
    const chosen: string[] = [];
    await renderInShell(<MoveSheet open onOpenChange={() => undefined} field={field} currentOptionId="o1" onChoose={(o) => chosen.push(o)} />);
    expect(await screen.findByText('Move to…')).toBeTruthy();
    fireEvent.click(screen.getByTestId('move-option-o2'));
    expect(chosen).toEqual(['o2']);
  });

  function Harness() {
    const { moves, error, move } = useMoveItem('P1', field);
    return <button onClick={() => void move(items[0] as never, 'o2')}>{`go|${[...moves.entries()].join(',')}|${error ?? ''}`}</button>;
  }

  it('applies the move optimistically, then drops the override once the write lands', async () => {
    let release: () => void = () => undefined;
    const setItemField = vi.fn(() => new Promise((r) => (release = () => r(ok(null)))));
    await renderInShell(<Harness />, { ...base(), setItemField });
    fireEvent.click(await screen.findByText('go||'));
    expect(await screen.findByText('go|i1,o2|')).toBeTruthy();
    release();
    expect(await screen.findByText('go||')).toBeTruthy();
    expect(setItemField).toHaveBeenCalledWith('P1', 'i1', 'f1', 'o2');
  });

  it('rolls back and reports a failure', async () => {
    const setItemField = vi.fn(async () => fail('error', 'denied'));
    await renderInShell(<Harness />, { ...base(), setItemField });
    fireEvent.click(await screen.findByText('go||'));
    expect(await screen.findByText("go||Couldn't move #1: denied")).toBeTruthy();
  });
});

describe('New issue', () => {
  it('needs a title, creates in the current repo and adds the issue to the project', async () => {
    const createIssueWithId = vi.fn(async () => ok({ id: 'I_1', number: 9 }));
    const addProjectItem = vi.fn(async () => ok(null));
    await renderInShell(<NewIssueScreen />, { ...base(), createIssueWithId, addProjectItem });
    fireEvent.click(await screen.findByText('Create issue'));
    expect(createIssueWithId).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' Fix it ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'details' } });
    fireEvent.click(screen.getByText('Create issue'));
    await waitFor(() => expect(addProjectItem).toHaveBeenCalledWith('P1', 'I_1'));
    expect(createIssueWithId).toHaveBeenCalledWith(REPO, 'Fix it', 'details');
  });

  it('a failed board add stays put, and a retry does not create a second issue', async () => {
    const createIssueWithId = vi.fn(async () => ok({ id: 'I_1', number: 9 }));
    const addProjectItem = vi.fn().mockResolvedValueOnce(fail('error', 'no scope')).mockResolvedValue(ok(null));
    await renderInShell(<NewIssueScreen />, { ...base(), createIssueWithId, addProjectItem });
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'T' } });
    fireEvent.click(screen.getByText('Create issue'));
    expect(await screen.findByText(/Issue #9 was created, but adding it to Roadmap failed/)).toBeTruthy();
    fireEvent.click(screen.getByText('Create issue'));
    await waitFor(() => expect(addProjectItem).toHaveBeenCalledTimes(2));
    expect(createIssueWithId).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(routerCalls).toContainEqual({ method: 'replace', href: '/tasks/issue/9' }));
  });

  it('shows the failure and stays put', async () => {
    const createIssueWithId = vi.fn(async () => fail('error', 'nope'));
    await renderInShell(<NewIssueScreen />, { ...base(), createIssueWithId });
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'T' } });
    fireEvent.click(screen.getByText('Create issue'));
    expect(await screen.findByText(/Couldn't create the issue: nope/)).toBeTruthy();
    expect(routerCalls).toHaveLength(0);
  });
});

describe('Issue detail', () => {
  const detail = {
    issue: { id: 'I_1', number: 1, title: 'First task', state: 'open', author: 'octo', labels: [{ name: 'ui', color: '' }], assignees: ['octo'], updatedAt: '', createdAt: null, url: '' },
    body: 'See https://example.com/x for more',
  };
  const source = (over: Record<string, unknown> = {}) => ({
    ...base(),
    issue: async () => ok(detail),
    issueComments: async () => ok([{ id: 'c1', author: 'hubot', body: 'looks good', createdAt: '2026-11-01T00:00:00Z' }]),
    ...over,
  });

  it('shows the state, body link, field chips and comments, and posts a comment', async () => {
    setParams({ number: '1' });
    const commentIssue = vi.fn(async () => ok(null));
    await renderInShell(<IssueDetailScreen />, source({ commentIssue }));
    expect(await screen.findByText('First task')).toBeTruthy();
    expect(screen.getByTestId('state-badge').textContent).toBe('Open');
    expect(screen.getByRole('link').textContent).toBe('https://example.com/x');
    expect(await screen.findByText('Status: Todo')).toBeTruthy();
    expect(await screen.findByText('looks good')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'thanks' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(commentIssue).toHaveBeenCalledWith(REPO, 1, 'thanks'));
  });

  it('tapping a field chip changes it through a sheet', async () => {
    setParams({ number: '1' });
    const setItemField = vi.fn(async () => ok(null));
    await renderInShell(<IssueDetailScreen />, source({ setItemField }));
    fireEvent.click(await screen.findByText('Status: Todo'));
    fireEvent.click(await screen.findByTestId('field-option-o2'));
    await waitFor(() => expect(setItemField).toHaveBeenCalledWith('P1', 'i1', 'f1', 'o2'));
  });

  it('Close sends CLOSED; a failure shows a banner', async () => {
    setParams({ number: '1' });
    const setIssueState = vi.fn(async () => fail('error', 'denied'));
    await renderInShell(<IssueDetailScreen />, source({ setIssueState }));
    fireEvent.click(await screen.findByText('Close'));
    await waitFor(() => expect(setIssueState).toHaveBeenCalledWith(REPO, 1, 'CLOSED'));
    expect(await screen.findByText(/Couldn't close: denied/)).toBeTruthy();
  });
});
