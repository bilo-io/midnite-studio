import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { boardFields, boardItems, listBoards, setItemField } from './gitlab-board';

const forge: Forge = { host: 'gitlab.com', owner: 'group', repo: 'project', kind: 'gitlab' };
function account(overrides: Partial<ForgeAccount> = {}): ForgeAccount {
  return {
    id: 'gitlab:gitlab.com:me',
    kind: 'gitlab',
    host: 'gitlab.com',
    login: 'me',
    displayName: 'Me',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
    ...overrides,
  };
}

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('glpat-token') }));

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const LISTS = [
  { id: 1, list_type: 'backlog' },
  { id: 2, list_type: 'label', label: { name: 'To Do', color: '#ff0000' } },
  { id: 3, list_type: 'label', label: { name: 'Doing', color: '#00ff00' } },
  { id: 4, list_type: 'closed' },
];

describe('listBoards', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps boards, every one linked to this repo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [{ id: 9, name: 'Main board' }])));
    const result = await listBoards(forge, account());
    expect(result.kind).toBe('ok');
    expect(result.projects[0]).toMatchObject({ id: '9', title: 'Main board', linkedToRepo: true, closed: false });
  });

  it('reports insufficient-scope on a 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { message: '403 Forbidden' })));
    const result = await listBoards(forge, account());
    expect(result.kind).toBe('insufficient-scope');
  });
});

describe('boardFields', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds one synthetic single_select field, skipping backlog/closed system lists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, LISTS)));
    const result = await boardFields(forge, account(), '9');
    expect(result.fields).toHaveLength(1);
    const field = result.fields[0]!;
    expect(field.dataType).toBe('single_select');
    if (field.dataType !== 'single_select') return;
    expect(field.options.map((o) => o.name)).toEqual(['To Do', 'Doing']);
    expect(field.options.map((o) => o.color)).toEqual(['ff0000', '00ff00']);
  });
});

describe('boardItems', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('paginates by sweeping through lists, one page at a time', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, LISTS)) // fetchLabelLists
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          [{ id: 100, iid: 1, title: 'Issue A', state: 'opened', web_url: 'https://gitlab.com/x', assignees: [] }],
          { 'x-next-page': '' },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await boardItems(forge, account(), '9');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: '1' });
    expect(result.items[0]?.fieldValues['list']).toMatchObject({ optionId: '2', name: 'To Do' });
    // No more pages on list 0, but there is a second list (Doing) to sweep next.
    expect(result.nextCursor).toBe('1:1');
  });

  it('returns null cursor once every list has been swept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, LISTS)).mockResolvedValueOnce(jsonResponse(200, [], { 'x-next-page': '' })),
    );
    // Ask for the last list directly.
    const result = await boardItems(forge, account(), '9', '1:1');
    expect(result.nextCursor).toBeNull();
  });
});

describe('setItemField', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replaces the board’s list labels with the target list, keeping unrelated labels', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, LISTS)) // fetchLabelLists
      .mockResolvedValueOnce(jsonResponse(200, { labels: ['To Do', 'priority::high'] })) // GET issue
      .mockResolvedValueOnce(jsonResponse(200, {})); // PUT issue
    vi.stubGlobal('fetch', fetchMock);

    const result = await setItemField(forge, account(), {
      projectId: '9',
      itemId: '1',
      fieldId: 'list',
      value: { fieldId: 'list', dataType: 'single_select', optionId: '3', name: 'Doing' },
    });
    expect(result).toEqual({ ok: true, kind: 'ok' });

    const putCall = fetchMock.mock.calls[2] as [URL, RequestInit];
    const body = JSON.parse(putCall[1].body as string) as { labels: string };
    expect(body.labels.split(',').sort()).toEqual(['Doing', 'priority::high'].sort());
  });

  it('refuses a field other than the synthetic List field', async () => {
    const result = await setItemField(forge, account(), {
      projectId: '9',
      itemId: '1',
      fieldId: 'not-list',
      value: { fieldId: 'not-list', dataType: 'text', text: 'x' },
    });
    expect(result.ok).toBe(false);
  });
});
