import type { Forge } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listProjects,
  parseFields,
  parseItemsPage,
  parseProjectList,
  projectFields,
  projectItems,
} from './gh-project';

/*
  Same arrangement `gh-graphql.test.ts` uses: `runInShell` mocked, the rest of
  `gh-shell` real, so `shellQuote` and the flag choices are still exercised
  rather than assumed.
*/
const { runInShell } = vi.hoisted(() => ({
  runInShell: vi.fn<
    (
      command: string,
      timeout: number,
      options?: { combine?: boolean },
    ) => Promise<{ output: string; stdout: string; stderr: string; exitCode: number | null }>
  >(),
}));

vi.mock('./gh-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gh-shell')>();
  return {
    ...actual,
    runInShell,
    ghStatus: vi.fn(async () => ({ reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' })),
    invalidateGhProbe: vi.fn(),
  };
});

const forge: Forge = { kind: 'github', host: 'github.com', owner: 'acme', repo: 'widgets' };

beforeEach(() => {
  runInShell.mockReset();
});

const okShell = (output: string) => ({ output, stdout: output, stderr: '', exitCode: 0 });
const failedShell = (output: string) => ({ output, stdout: '', stderr: output, exitCode: 1 });

describe('parseProjectList', () => {
  it('reads a user-owned board off the User fragment', () => {
    const output = JSON.stringify({
      data: {
        repositoryOwner: {
          projectsV2: {
            nodes: [
              { id: 'PVT_user1', number: 3, title: 'Personal board', url: 'https://github.com/users/octocat/projects/3', closed: false },
            ],
          },
        },
      },
    });
    expect(parseProjectList(output)).toEqual([
      { id: 'PVT_user1', number: 3, title: 'Personal board', url: 'https://github.com/users/octocat/projects/3', closed: false },
    ]);
  });

  it('reads an org-owned board off the Organization fragment', () => {
    const output = JSON.stringify({
      data: {
        repositoryOwner: {
          projectsV2: {
            nodes: [
              { id: 'PVT_org1', number: 7, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/7', closed: true },
            ],
          },
        },
      },
    });
    expect(parseProjectList(output)).toEqual([
      { id: 'PVT_org1', number: 7, title: 'Roadmap', url: 'https://github.com/orgs/acme/projects/7', closed: true },
    ]);
  });

  it('drops a board with no id rather than failing the whole listing', () => {
    const output = JSON.stringify({
      data: {
        repositoryOwner: {
          projectsV2: {
            nodes: [
              { number: 1, title: 'No id', url: 'https://x', closed: false },
              { id: 'PVT_ok', number: 2, title: 'Fine', url: 'https://x', closed: false },
            ],
          },
        },
      },
    });
    expect(parseProjectList(output)).toHaveLength(1);
  });
});

describe('parseFields', () => {
  it('parses text, number, date, single_select and iteration fields', () => {
    const output = JSON.stringify({
      data: {
        node: {
          fields: {
            nodes: [
              { __typename: 'ProjectV2Field', id: 'F_text', name: 'Notes', dataType: 'TEXT' },
              { __typename: 'ProjectV2Field', id: 'F_num', name: 'Estimate', dataType: 'NUMBER' },
              { __typename: 'ProjectV2Field', id: 'F_date', name: 'Due', dataType: 'DATE' },
              {
                __typename: 'ProjectV2SingleSelectField',
                id: 'F_status',
                name: 'Status',
                dataType: 'SINGLE_SELECT',
                options: [{ id: 'opt1', name: 'Todo', color: 'GRAY' }],
              },
              {
                __typename: 'ProjectV2IterationField',
                id: 'F_sprint',
                name: 'Sprint',
                dataType: 'ITERATION',
              },
            ],
          },
        },
      },
    });

    const fields = parseFields(output);
    expect(fields).toHaveLength(5);
    expect(fields.find((f) => f.id === 'F_status')).toEqual({
      id: 'F_status',
      name: 'Status',
      dataType: 'single_select',
      options: [{ id: 'opt1', name: 'Todo', color: 'GRAY' }],
    });
  });

  it('drops a built-in field whose dataType this contract does not carry', () => {
    // Title/Assignees/Labels/etc. all arrive as ProjectV2Field with a
    // dataType this app does not render — the board must still load.
    const output = JSON.stringify({
      data: {
        node: {
          fields: {
            nodes: [
              { __typename: 'ProjectV2Field', id: 'F_title', name: 'Title', dataType: 'TITLE' },
              { __typename: 'ProjectV2Field', id: 'F_text', name: 'Notes', dataType: 'TEXT' },
            ],
          },
        },
      },
    });
    const fields = parseFields(output);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.id).toBe('F_text');
  });
});

describe('parseItemsPage', () => {
  const fieldValueNode = (over: Record<string, unknown>): Record<string, unknown> => ({
    field: { id: 'F_status' },
    ...over,
  });

  it('reads an item with every field type intact', () => {
    const output = JSON.stringify({
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'PVTI_1',
                content: {
                  __typename: 'Issue',
                  id: 'I_1',
                  number: 42,
                  title: 'Fix the thing',
                  url: 'https://github.com/acme/widgets/issues/42',
                  state: 'OPEN',
                  assignees: { nodes: [{ login: 'octocat' }] },
                },
                fieldValues: {
                  nodes: [
                    fieldValueNode({
                      __typename: 'ProjectV2ItemFieldSingleSelectValue',
                      optionId: 'opt1',
                      name: 'Todo',
                    }),
                    { __typename: 'ProjectV2ItemFieldTextValue', field: { id: 'F_text' }, text: 'hi' },
                    { __typename: 'ProjectV2ItemFieldNumberValue', field: { id: 'F_num' }, number: 3 },
                    {
                      __typename: 'ProjectV2ItemFieldDateValue',
                      field: { id: 'F_date' },
                      date: '2026-01-01',
                    },
                    {
                      __typename: 'ProjectV2ItemFieldIterationValue',
                      field: { id: 'F_sprint' },
                      iterationId: 'iter1',
                      title: 'Sprint 3',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    const { items, nextCursor } = parseItemsPage(output);
    expect(nextCursor).toBeNull();
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item?.content).toEqual({
      type: 'issue',
      id: 'I_1',
      number: 42,
      title: 'Fix the thing',
      url: 'https://github.com/acme/widgets/issues/42',
      state: 'open',
      assignees: ['octocat'],
    });
    expect(item?.fieldValues['F_status']).toEqual({
      fieldId: 'F_status',
      dataType: 'single_select',
      optionId: 'opt1',
      name: 'Todo',
    });
    expect(item?.fieldValues['F_num']).toEqual({ fieldId: 'F_num', dataType: 'number', number: 3 });
    expect(Object.keys(item?.fieldValues ?? {})).toHaveLength(5);
  });

  it('reads a draft item with no number and no url', () => {
    const output = JSON.stringify({
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'PVTI_draft',
                content: {
                  __typename: 'DraftIssue',
                  id: 'DI_1',
                  title: 'Untriaged idea',
                  assignees: { nodes: [] },
                },
                fieldValues: { nodes: [] },
              },
            ],
          },
        },
      },
    });

    const { items } = parseItemsPage(output);
    expect(items).toEqual([
      { id: 'PVTI_draft', content: { type: 'draft', id: 'DI_1', title: 'Untriaged idea', assignees: [] }, fieldValues: {} },
    ]);
  });

  it('reads a pull request item', () => {
    const output = JSON.stringify({
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'PVTI_pr',
                content: {
                  __typename: 'PullRequest',
                  id: 'PR_1',
                  number: 9,
                  title: 'Add feature',
                  url: 'https://github.com/acme/widgets/pull/9',
                  state: 'MERGED',
                  assignees: { nodes: [] },
                },
                fieldValues: { nodes: [] },
              },
            ],
          },
        },
      },
    });

    const { items } = parseItemsPage(output);
    expect(items[0]?.content).toMatchObject({ type: 'pull', number: 9, state: 'merged' });
  });

  it('carries the next cursor when a further page exists', () => {
    const output = JSON.stringify({
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
            nodes: [],
          },
        },
      },
    });
    expect(parseItemsPage(output).nextCursor).toBe('cursor-2');
  });

  it('nulls the cursor once the last page has been read, even if GitHub echoes one', () => {
    const output = JSON.stringify({
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: false, endCursor: 'stale-cursor' },
            nodes: [],
          },
        },
      },
    });
    expect(parseItemsPage(output).nextCursor).toBeNull();
  });

  /**
   * The load-bearing test: one field-value node this contract does not
   * recognise must degrade that one field, never the item — proving the
   * per-element-`safeParse` rule in `parseFieldValues` was followed rather
   * than handing the whole array to one schema.
   */
  it('keeps an item intact when one of its field values has an unrecognised type', () => {
    const output = JSON.stringify({
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'PVTI_weird',
                content: {
                  __typename: 'DraftIssue',
                  id: 'DI_2',
                  title: 'Has an odd field',
                  assignees: { nodes: [] },
                },
                fieldValues: {
                  nodes: [
                    { __typename: 'ProjectV2ItemFieldTextValue', field: { id: 'F_text' }, text: 'kept' },
                    // A field type this contract's union does not name — e.g.
                    // a future ProjectV2ItemFieldMilestoneValue GitHub adds.
                    // GraphQL sends it back as a bare object with only the
                    // fragments that DID match, so it carries no usable value.
                    { __typename: 'ProjectV2ItemFieldMilestoneValue', field: { id: 'F_milestone' } },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    const { items } = parseItemsPage(output);
    expect(items).toHaveLength(1);
    expect(items[0]?.fieldValues).toEqual({ F_text: { fieldId: 'F_text', dataType: 'text', text: 'kept' } });
  });
});

describe('listProjects / projectFields / projectItems — transport', () => {
  it('sends owner as -f, never -F, to keep a numeric-looking login a string', async () => {
    runInShell.mockResolvedValueOnce(
      okShell(JSON.stringify({ data: { repositoryOwner: { projectsV2: { nodes: [] } } } })),
    );
    await listProjects(forge);
    const [command] = runInShell.mock.calls[0] ?? [];
    expect(command).toContain("-f owner='acme'");
    expect(command).not.toContain('-F owner=');
  });

  it('projectFields sends projectId as -f', async () => {
    runInShell.mockResolvedValueOnce(
      okShell(JSON.stringify({ data: { node: { fields: { nodes: [] } } } })),
    );
    await projectFields(forge, 'PVT_abc');
    const [command] = runInShell.mock.calls[0] ?? [];
    expect(command).toContain("-f projectId='PVT_abc'");
  });

  it('projectItems omits the cursor flag on the first page', async () => {
    runInShell.mockResolvedValueOnce(
      okShell(
        JSON.stringify({
          data: { node: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } },
        }),
      ),
    );
    await projectItems(forge, 'PVT_abc');
    const [command] = runInShell.mock.calls[0] ?? [];
    expect(command).not.toContain('cursor=');
  });

  it('projectItems sends the cursor on a follow-up page', async () => {
    runInShell.mockResolvedValueOnce(
      okShell(
        JSON.stringify({
          data: { node: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } },
        }),
      ),
    );
    await projectItems(forge, 'PVT_abc', 'cursor-1');
    const [command] = runInShell.mock.calls[0] ?? [];
    expect(command).toContain("-f cursor='cursor-1'");
  });

  it('recognises an INSUFFICIENT_SCOPES error as a distinct kind, not a generic failure', async () => {
    runInShell.mockResolvedValueOnce(
      failedShell(
        JSON.stringify({
          errors: [
            {
              type: 'INSUFFICIENT_SCOPES',
              message: 'Your token has not been granted the required scopes to execute this query.',
            },
          ],
        }),
      ),
    );
    const result = await listProjects(forge);
    expect(result.kind).toBe('insufficient-scope');
    expect(result.error).toMatch(/required scopes/);
  });

  it('treats every other failure as a generic error kind', async () => {
    runInShell.mockResolvedValueOnce(
      failedShell(JSON.stringify({ errors: [{ message: 'Could not resolve to a Repository.' }] })),
    );
    const result = await listProjects(forge);
    expect(result.kind).toBe('error');
  });
});
