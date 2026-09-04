import type { ForgeProjectField, ForgeProjectItem, TerminalSession } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  composeCardPrompt,
  CONCURRENT_CARD_SESSION_SOFT_LIMIT,
  countLiveCardSessions,
  deriveColumns,
  NO_STATUS_COLUMN_ID,
  sessionsToRehome,
} from './board-derive';
import type { ConnectionState } from '../../terminal/terminal-store';

const statusField: ForgeProjectField = {
  id: 'f1',
  name: 'Status',
  dataType: 'single_select',
  options: [
    { id: 'todo', name: 'Todo', color: 'GRAY' },
    { id: 'doing', name: 'In Progress', color: 'YELLOW' },
    { id: 'done', name: 'Done', color: 'GREEN' },
  ],
};

const draft = (id: string, title: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [], body: '' },
  fieldValues: {},
});

const withStatus = (id: string, title: string, optionId: string, name: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [], body: '' },
  fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select', optionId, name } },
});

describe('deriveColumns', () => {
  it('returns no columns for a missing field', () => {
    expect(deriveColumns(null, [draft('i1', 'a')])).toEqual([]);
    expect(deriveColumns(undefined, [draft('i1', 'a')])).toEqual([]);
  });

  it('returns no columns for a field that is neither single_select nor iteration', () => {
    const textField: ForgeProjectField = { id: 'f2', name: 'Notes', dataType: 'text' };
    expect(deriveColumns(textField, [draft('i1', 'a')])).toEqual([]);
  });

  it("orders columns as No <field name>, then the field's own option order", () => {
    const columns = deriveColumns(statusField, []);
    expect(columns.map((c) => c.id)).toEqual([NO_STATUS_COLUMN_ID, 'todo', 'doing', 'done']);
    // Generalised off the field's own name (Phase 52 Theme B) rather than a
    // hardcoded "No status" — a field named "Priority" reads "No Priority".
    expect(columns.map((c) => c.name)).toEqual(['No Status', 'Todo', 'In Progress', 'Done']);
  });

  it('carries the option colour onto its column, and none for No status', () => {
    const columns = deriveColumns(statusField, []);
    expect(columns.find((c) => c.id === 'todo')?.color).toBe('GRAY');
    expect(columns.find((c) => c.id === NO_STATUS_COLUMN_ID)?.color).toBe('');
  });

  it('an item with no Status value goes to No status, not the first real column', () => {
    const columns = deriveColumns(statusField, [draft('i1', 'a')]);
    expect(columns.find((c) => c.id === NO_STATUS_COLUMN_ID)?.items).toHaveLength(1);
    expect(columns.find((c) => c.id === 'todo')?.items).toHaveLength(0);
  });

  it('an item whose option id no longer exists on the field goes to No status, not dropped', () => {
    const columns = deriveColumns(statusField, [withStatus('i1', 'a', 'deleted-option', 'Old Name')]);
    expect(columns.find((c) => c.id === NO_STATUS_COLUMN_ID)?.items.map((i) => i.id)).toEqual(['i1']);
  });

  it('sorts items into their matching column by option id', () => {
    const items = [
      withStatus('i1', 'a', 'todo', 'Todo'),
      withStatus('i2', 'b', 'done', 'Done'),
      withStatus('i3', 'c', 'todo', 'Todo'),
    ];
    const columns = deriveColumns(statusField, items);
    expect(columns.find((c) => c.id === 'todo')?.items.map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(columns.find((c) => c.id === 'done')?.items.map((i) => i.id)).toEqual(['i2']);
    expect(columns.find((c) => c.id === 'doing')?.items).toHaveLength(0);
  });

  it('a field with no items still produces every column, empty', () => {
    const columns = deriveColumns(statusField, []);
    expect(columns.every((c) => c.items.length === 0)).toBe(true);
    expect(columns).toHaveLength(4);
  });
});

describe('deriveColumns — iteration grouping (Phase 52 Theme B)', () => {
  const iterationField: ForgeProjectField = { id: 'f3', name: 'Sprint', dataType: 'iteration' };

  const withIteration = (id: string, iterationId: string, title: string): ForgeProjectItem => ({
    id,
    content: { type: 'draft', id: `DI_${id}`, title: id, assignees: [], body: '' },
    fieldValues: { f3: { fieldId: 'f3', dataType: 'iteration', iterationId, title } },
  });

  it('has no fixed option list — columns are discovered from the items, first-seen order', () => {
    const items = [
      withIteration('i1', 'sprint-2', 'Sprint 2'),
      withIteration('i2', 'sprint-1', 'Sprint 1'),
      withIteration('i3', 'sprint-2', 'Sprint 2'),
    ];
    const columns = deriveColumns(iterationField, items);
    expect(columns.map((c) => c.id)).toEqual([NO_STATUS_COLUMN_ID, 'sprint-2', 'sprint-1']);
    expect(columns.find((c) => c.id === 'sprint-2')?.items.map((i) => i.id)).toEqual(['i1', 'i3']);
  });

  it('an item with no iteration value goes to No <field name>', () => {
    const columns = deriveColumns(iterationField, [draft('i1', 'a')]);
    expect(columns.map((c) => c.id)).toEqual([NO_STATUS_COLUMN_ID]);
    expect(columns[0]?.name).toBe('No Sprint');
    expect(columns[0]?.items).toHaveLength(1);
  });

  it("falls back to the iteration's own id when it carries no title", () => {
    const columns = deriveColumns(iterationField, [withIteration('i1', 'sprint-9', '')]);
    expect(columns.find((c) => c.id === 'sprint-9')?.name).toBe('sprint-9');
  });
});

describe('composeCardPrompt', () => {
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
      body: 'Steps to reproduce…',
      labels: ['bug', 'flaky'],
    },
    fieldValues: {},
  };

  it('carries title, number, url, assignees, labels, repo path and body', () => {
    const prompt = composeCardPrompt(issue, '/repo/widgets');
    expect(prompt).toContain('Fix the flaky test (#42)');
    expect(prompt).toContain('https://github.com/acme/widgets/issues/42');
    expect(prompt).toContain('Assignees: octocat');
    expect(prompt).toContain('Labels: bug, flaky');
    expect(prompt).toContain('Repo: /repo/widgets');
    expect(prompt).toContain('Steps to reproduce…');
  });

  it('a draft has no number, url or labels line', () => {
    const draftItem: ForgeProjectItem = {
      id: 'item2',
      content: { type: 'draft', id: 'DI_1', title: 'Untriaged idea', assignees: [], body: '' },
      fieldValues: {},
    };
    const prompt = composeCardPrompt(draftItem, '/repo/widgets');
    expect(prompt).toContain('Untriaged idea');
    expect(prompt).not.toContain('Labels:');
    expect(prompt).not.toContain('https://');
  });

  it('caps the body at 4 000 characters with a visible truncation notice', () => {
    const longBody = 'x'.repeat(4500);
    const withLongBody: ForgeProjectItem = {
      ...issue,
      content: { ...issue.content, body: longBody },
    };
    const prompt = composeCardPrompt(withLongBody, '/repo/widgets');
    expect(prompt).toContain('x'.repeat(4000));
    expect(prompt).not.toContain('x'.repeat(4001));
    expect(prompt).toContain('truncated — 500 more characters omitted');
  });

  it('omits the body section entirely when there is no body', () => {
    const noBody: ForgeProjectItem = { ...issue, content: { ...issue.content, body: '' } };
    const prompt = composeCardPrompt(noBody, '/repo/widgets');
    expect(prompt.trim().endsWith('Repo: /repo/widgets')).toBe(true);
  });
});

describe('sessionsToRehome', () => {
  function kanbanSession(id: string, projectId: string, itemId: string): TerminalSession {
    return {
      id,
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      createdAt: 1,
      surface: 'kanban',
      taskRef: { projectId, itemId },
    };
  }

  it('names a kanban session whose item is gone from the current board', () => {
    const sessions = [kanbanSession('s1', 'PVT_1', 'PVTI_gone'), kanbanSession('s2', 'PVT_1', 'PVTI_1')];
    const ids = sessionsToRehome(sessions, { projectId: 'PVT_1', itemIds: new Set(['PVTI_1']) });
    expect(ids).toEqual(['s1']);
  });

  it('leaves a session bound to a different board alone, even if its item id is unknown here', () => {
    const sessions = [kanbanSession('s1', 'PVT_other', 'PVTI_1')];
    const ids = sessionsToRehome(sessions, { projectId: 'PVT_1', itemIds: new Set() });
    expect(ids).toEqual([]);
  });

  it('ignores a main-surface session entirely', () => {
    const main: TerminalSession = {
      id: 's1',
      kind: 'shell',
      title: 'repo',
      cwd: '/repo',
      repoId: 'r1',
      createdAt: 1,
    };
    const ids = sessionsToRehome([main], { projectId: 'PVT_1', itemIds: new Set() });
    expect(ids).toEqual([]);
  });
});

describe('countLiveCardSessions (Phase 50 Theme A)', () => {
  function kanbanSession(id: string, projectId: string, itemId: string): TerminalSession {
    return {
      id,
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      createdAt: 1,
      surface: 'kanban',
      taskRef: { projectId, itemId },
    };
  }

  it('CONCURRENT_CARD_SESSION_SOFT_LIMIT is 5 — Phase 41 Theme I\'s own recorded recommendation', () => {
    expect(CONCURRENT_CARD_SESSION_SOFT_LIMIT).toBe(5);
  });

  it('counts only live sessions bound to this board', () => {
    const sessions = [
      kanbanSession('s1', 'PVT_1', 'i1'),
      kanbanSession('s2', 'PVT_1', 'i2'),
      kanbanSession('s3', 'PVT_1', 'i3'),
    ];
    const states: Record<string, ConnectionState> = { s1: 'open', s2: 'exited', s3: 'idle' };

    expect(countLiveCardSessions(sessions, states, 'PVT_1')).toBe(2);
  });

  it('ignores a session bound to a different board', () => {
    const sessions = [kanbanSession('s1', 'PVT_other', 'i1')];
    expect(countLiveCardSessions(sessions, { s1: 'open' }, 'PVT_1')).toBe(0);
  });

  it('an asleep session does not count, even with a "live" connection state', () => {
    const asleep: TerminalSession = { ...kanbanSession('s1', 'PVT_1', 'i1'), asleep: true };
    expect(countLiveCardSessions([asleep], { s1: 'open' }, 'PVT_1')).toBe(0);
  });

  it('ignores a main-surface session entirely', () => {
    const main: TerminalSession = {
      id: 's1',
      kind: 'shell',
      title: 'repo',
      cwd: '/repo',
      repoId: 'r1',
      createdAt: 1,
    };
    expect(countLiveCardSessions([main], { s1: 'open' }, 'PVT_1')).toBe(0);
  });
});
