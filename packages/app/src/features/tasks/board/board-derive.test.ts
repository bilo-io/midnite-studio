import type { ForgeProjectField, ForgeProjectItem, TerminalSession } from '@midnite/studio-shared';
import { EMPTY_ISSUE_LINK_SET } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  columnSkillKey,
  composeCardPrompt,
  composeSkillLaunchPrompt,
  CONCURRENT_CARD_SESSION_SOFT_LIMIT,
  countLiveCardSessions,
  decideColumnSkillAction,
  DEFAULT_COLUMN_SKILLS,
  deriveColumns,
  NO_STATUS_COLUMN_ID,
  resolveColumnSkill,
  resolveDragSkillLink,
  resolveMostRecentAgentId,
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
      repo: '',
      title: 'Fix the flaky test',
      url: 'https://github.com/acme/widgets/issues/42',
      state: 'open',
      assignees: ['octocat'],
      body: 'Steps to reproduce…',
      labels: ['bug', 'flaky'],
      dependencies: EMPTY_ISSUE_LINK_SET,
      linkedPrs: [],
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

describe('composeSkillLaunchPrompt (Phase 92 Theme B)', () => {
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
      body: 'Steps to reproduce…',
      labels: ['bug', 'flaky'],
      dependencies: EMPTY_ISSUE_LINK_SET,
      linkedPrs: [],
    },
    fieldValues: {},
  };

  const pull: ForgeProjectItem = {
    id: 'item3',
    content: {
      type: 'pull',
      id: 'PR_1',
      number: 7,
      repo: '',
      title: 'Add the thing',
      url: 'https://github.com/acme/widgets/pull/7',
      state: 'open',
      assignees: [],
      body: 'A pull body nobody should see here',
      labels: [],
    },
    fieldValues: {},
  };

  const draftItem: ForgeProjectItem = {
    id: 'item2',
    content: { type: 'draft', id: 'DI_1', title: 'Untriaged idea', assignees: [], body: 'Some notes' },
    fieldValues: {},
  };

  it('an issue composes as "<skill template> <issue url>" — never the title, assignees, labels or body', () => {
    const prompt = composeSkillLaunchPrompt(issue, '/midnite-create-adhoc');
    expect(prompt).toBe('/midnite-create-adhoc https://github.com/acme/widgets/issues/42');
    expect(prompt).not.toContain('Fix the flaky test');
    expect(prompt).not.toContain('octocat');
    expect(prompt).not.toContain('Steps to reproduce');
  });

  it('a pull composes the same way, off its own url', () => {
    const prompt = composeSkillLaunchPrompt(pull, '/midnite-ideate');
    expect(prompt).toBe('/midnite-ideate https://github.com/acme/widgets/pull/7');
  });

  it('a draft has no url — falls back to composeCardPrompt\'s draft-safe output', () => {
    const prompt = composeSkillLaunchPrompt(draftItem, '/midnite-refine');
    expect(prompt).toBe(composeCardPrompt(draftItem, ''));
    expect(prompt).not.toContain('/midnite-refine');
  });

  it('an empty skill template still composes — a pure function is tested against its own inputs', () => {
    expect(composeSkillLaunchPrompt(issue, '')).toBe(' https://github.com/acme/widgets/issues/42');
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

describe('resolveColumnSkill (Phase 95 Theme G)', () => {
  it('matches a default column name case-insensitively, with no override at all', () => {
    expect(resolveColumnSkill('In Progress', undefined)).toBe('/midnite-create');
    expect(resolveColumnSkill('in progress', {})).toBe('/midnite-create');
    expect(resolveColumnSkill('IN REVIEW', undefined)).toBe('/midnite-review');
  });

  it('a column with no default and no override keeps today\'s status-only drop', () => {
    expect(resolveColumnSkill('Backlog', undefined)).toBeUndefined();
    expect(resolveColumnSkill('Done', {})).toBeUndefined();
  });

  it('a project override replaces the default for that column', () => {
    const overrides = { 'in progress': '/midnite-create-adhoc' };
    expect(resolveColumnSkill('In progress', overrides)).toBe('/midnite-create-adhoc');
  });

  it('an override on a column with no default maps it for the first time', () => {
    const overrides = { backlog: '/midnite-ideate' };
    expect(resolveColumnSkill('Backlog', overrides)).toBe('/midnite-ideate');
  });

  it('an empty-string override explicitly un-maps a default, rather than falling through to it', () => {
    const overrides = { 'in progress': '' };
    expect(resolveColumnSkill('In progress', overrides)).toBeUndefined();
  });

  it('DEFAULT_COLUMN_SKILLS is exactly the phase doc\'s own two defaults', () => {
    expect(DEFAULT_COLUMN_SKILLS).toEqual({ 'in progress': '/midnite-create', 'in review': '/midnite-review' });
  });

  it('columnSkillKey trims and lower-cases', () => {
    expect(columnSkillKey('  In Progress  ')).toBe('in progress');
  });
});

describe('resolveDragSkillLink (Phase 95 Theme G)', () => {
  const issueWithPr: ForgeProjectItem = {
    id: 'item1',
    content: {
      type: 'issue',
      id: 'I_1',
      number: 42,
      repo: '',
      title: 'Fix the flaky test',
      url: 'https://github.com/acme/widgets/issues/42',
      state: 'open',
      assignees: [],
      body: '',
      labels: [],
      dependencies: EMPTY_ISSUE_LINK_SET,
      linkedPrs: [{ number: 99, url: 'https://github.com/acme/widgets/pull/99' }],
    },
    fieldValues: {},
  };

  const issueNoPr: ForgeProjectItem = {
    id: 'item1b',
    content: {
      type: 'issue',
      id: 'I_1b',
      number: 42,
      repo: '',
      title: 'Fix the flaky test',
      url: 'https://github.com/acme/widgets/issues/42',
      state: 'open',
      assignees: [],
      body: '',
      labels: [],
      dependencies: EMPTY_ISSUE_LINK_SET,
      linkedPrs: [],
    },
    fieldValues: {},
  };

  const pull: ForgeProjectItem = {
    id: 'item3',
    content: {
      type: 'pull',
      id: 'PR_1',
      number: 7,
      repo: '',
      title: 'Add the thing',
      url: 'https://github.com/acme/widgets/pull/7',
      state: 'open',
      assignees: [],
      body: '',
      labels: [],
    },
    fieldValues: {},
  };

  const draftItem: ForgeProjectItem = {
    id: 'item2',
    content: { type: 'draft', id: 'DI_1', title: 'Untriaged idea', assignees: [], body: '' },
    fieldValues: {},
  };

  it('prefers an issue\'s own linked PR over the issue link', () => {
    expect(resolveDragSkillLink(issueWithPr)).toEqual({
      url: 'https://github.com/acme/widgets/pull/99',
      usedIssueFallback: false,
    });
  });

  it('falls back to the issue link when it has no linked PR, and flags the fallback', () => {
    expect(resolveDragSkillLink(issueNoPr)).toEqual({
      url: 'https://github.com/acme/widgets/issues/42',
      usedIssueFallback: true,
    });
  });

  it('a pull item resolves its own url, never a fallback', () => {
    expect(resolveDragSkillLink(pull)).toEqual({
      url: 'https://github.com/acme/widgets/pull/7',
      usedIssueFallback: false,
    });
  });

  it('a draft has no link at all', () => {
    expect(resolveDragSkillLink(draftItem)).toBeNull();
  });
});

describe('resolveMostRecentAgentId (Phase 92 Theme A, hoisted in Theme G)', () => {
  function agentSession(id: string, repoId: string, createdAt: number): TerminalSession {
    return {
      id,
      kind: 'agent',
      agentId: 'codex',
      title: 'agent',
      cwd: '/repo',
      repoId,
      createdAt,
      surface: 'kanban',
    };
  }

  it('falls back to the roster\'s first built-in agent with no prior session in this repo', () => {
    expect(resolveMostRecentAgentId([], 'r1')).toBe('claude');
  });

  it('picks the most recently created agent session in the same repo', () => {
    const sessions = [agentSession('s1', 'r1', 100), agentSession('s2', 'r1', 200)];
    expect(resolveMostRecentAgentId(sessions, 'r1')).toBe('codex');
  });

  it('ignores a session from a different repo', () => {
    const sessions = [agentSession('s1', 'r2', 500)];
    expect(resolveMostRecentAgentId(sessions, 'r1')).toBe('claude');
  });
});

describe('decideColumnSkillAction (Phase 95 Theme G)', () => {
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
      assignees: [],
      body: '',
      labels: [],
      dependencies: EMPTY_ISSUE_LINK_SET,
      linkedPrs: [],
    },
    fieldValues: {},
  };

  const draftItem: ForgeProjectItem = {
    id: 'item2',
    content: { type: 'draft', id: 'DI_1', title: 'Untriaged idea', assignees: [], body: '' },
    fieldValues: {},
  };

  it('an unmapped column keeps today\'s status-only drop', () => {
    expect(decideColumnSkillAction(issue, 'Backlog', undefined, undefined)).toEqual({ kind: 'none' });
  });

  it('a mapped column with no existing session launches, with the resolved link', () => {
    // This fixture's own `issue` carries no `linkedPrs` — `usedIssueFallback`
    // is `resolveDragSkillLink`'s own flag (tested directly above) and is
    // `true` here regardless of column name; only the toast copy in
    // `board-view.tsx` reads it differently for "In review" specifically.
    expect(decideColumnSkillAction(issue, 'In progress', undefined, undefined)).toEqual({
      kind: 'launch',
      skillTemplate: '/midnite-create',
      url: 'https://github.com/acme/widgets/issues/42',
      usedIssueFallback: true,
    });
  });

  it('"In review" with no linked PR launches with the issue link, flagged as a fallback', () => {
    expect(decideColumnSkillAction(issue, 'In review', undefined, undefined)).toEqual({
      kind: 'launch',
      skillTemplate: '/midnite-review',
      url: 'https://github.com/acme/widgets/issues/42',
      usedIssueFallback: true,
    });
  });

  it('an existing LIVE session on the card reveals it instead of launching a second one', () => {
    expect(decideColumnSkillAction(issue, 'In progress', undefined, 'sess-1')).toEqual({
      kind: 'reveal',
      sessionId: 'sess-1',
    });
  });

  it('a draft in a mapped column has no link to hand the skill — skipped, not launched', () => {
    expect(decideColumnSkillAction(draftItem, 'In progress', undefined, undefined)).toEqual({ kind: 'skip' });
  });

  it('a project override changes the launched skill', () => {
    expect(
      decideColumnSkillAction(issue, 'In progress', { 'in progress': '/midnite-create-adhoc' }, undefined),
    ).toEqual({
      kind: 'launch',
      skillTemplate: '/midnite-create-adhoc',
      url: 'https://github.com/acme/widgets/issues/42',
      usedIssueFallback: true,
    });
  });

  it('an explicit empty-string override turns a default column off — back to "none"', () => {
    expect(decideColumnSkillAction(issue, 'In progress', { 'in progress': '' }, undefined)).toEqual({
      kind: 'none',
    });
  });
});
