import type { Forge, ForgeProjectFieldValue } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addItemToProject,
  addProjectItem,
  clearItemFieldValue,
  createProject,
  deleteProject,
  editProject,
  removeProjectItem,
  setItemFieldValue,
} from './gh-project-write';

/* Same arrangement `gh-project.test.ts` uses — see its own note. */
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

const okShell = () => ({
  output: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'i1' } } } }),
  stdout: '',
  stderr: '',
  exitCode: 0,
});

/** The one field this whole module is most likely to be built wrong — see the file's own docblock. */
describe('setItemFieldValue — command construction', () => {
  it('sends a JSON body on stdin through --input -, never -f/-F flags', async () => {
    runInShell.mockResolvedValue(okShell());
    const value: ForgeProjectFieldValue = { fieldId: 'f1', dataType: 'text', text: 'hello' };

    await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('gh api graphql --input -');
    expect(command).not.toMatch(/-f |-F /);
    expect(command).toMatch(/^printf %s /);
  });

  it('a numeric field value survives as a JSON number, not a quoted string', async () => {
    runInShell.mockResolvedValue(okShell());
    const value: ForgeProjectFieldValue = { fieldId: 'f1', dataType: 'number', number: 42 };

    await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    const [command] = runInShell.mock.calls[0]!;
    // The JSON body is single-quoted for the shell; the number inside it must
    // still read as `42`, never `"42"` — the exact `-f`/`-F` failure mode this
    // module exists to avoid.
    expect(command).toMatch(/"number":42(?!")/);
  });

  it('a text value of "true" is sent as a string, not coerced to a boolean', async () => {
    runInShell.mockResolvedValue(okShell());
    const value: ForgeProjectFieldValue = { fieldId: 'f1', dataType: 'text', text: 'true' };

    await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('"text":"true"');
  });

  it('a single_select value sends singleSelectOptionId, not the option name', async () => {
    runInShell.mockResolvedValue(okShell());
    const value: ForgeProjectFieldValue = {
      fieldId: 'f1',
      dataType: 'single_select',
      optionId: 'opt1',
      name: 'In Progress',
    };

    await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('singleSelectOptionId');
    expect(command).not.toContain('In Progress');
  });

  it('refuses an iteration value — this phase writes nothing past single_select', async () => {
    const value: ForgeProjectFieldValue = {
      fieldId: 'f1',
      dataType: 'iteration',
      iterationId: 'it1',
      title: 'Sprint 1',
    };

    const result = await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    expect(runInShell).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('recognises INSUFFICIENT_SCOPES as a distinct kind, with the fix command as the hint', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ errors: [{ type: 'INSUFFICIENT_SCOPES', message: 'missing project scope' }] }),
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const value: ForgeProjectFieldValue = { fieldId: 'f1', dataType: 'text', text: 'hi' };

    const result = await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    expect(result).toEqual({ ok: false, kind: 'insufficient-scope', hint: 'gh auth refresh -s project' });
  });

  it('a generic failure carries gh\'s own error text, not a placeholder', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ errors: [{ message: 'Field does not belong to this project' }] }),
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    const value: ForgeProjectFieldValue = { fieldId: 'f1', dataType: 'text', text: 'hi' };

    const result = await setItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1', value });

    expect(result).toMatchObject({ ok: false, kind: 'error' });
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toContain('Field does not belong to this project');
    }
  });
});

describe('addItemToProject', () => {
  it('sends contentId and projectId as a JSON body, never -f/-F', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'i2' } } } }),
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await addItemToProject(forge, { projectId: 'p1', contentId: 'c1' });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('gh api graphql --input -');
    expect(command).not.toMatch(/-f |-F /);
    expect(command).toContain('addProjectV2ItemById');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });
});

describe('clearItemFieldValue (Phase 50 Theme C)', () => {
  it('sends projectId/itemId/fieldId as a JSON body, with no value at all', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ data: { clearProjectV2ItemFieldValue: { projectV2Item: { id: 'i1' } } } }),
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await clearItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1' });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('gh api graphql --input -');
    expect(command).not.toMatch(/-f |-F /);
    expect(command).toContain('clearProjectV2ItemFieldValue');
    expect(command).not.toContain('"value"');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('recognises INSUFFICIENT_SCOPES the same way every other mutation here does', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ errors: [{ type: 'INSUFFICIENT_SCOPES', message: 'missing project scope' }] }),
      stdout: '',
      stderr: '',
      exitCode: 1,
    });

    const result = await clearItemFieldValue(forge, { projectId: 'p1', itemId: 'i1', fieldId: 'f1' });

    expect(result).toEqual({ ok: false, kind: 'insufficient-scope', hint: 'gh auth refresh -s project' });
  });
});

/** Phase 95 Theme D — board CRUD, item add/remove. */
describe('createProject', () => {
  const ownerIdShell = {
    output: JSON.stringify({ data: { repositoryOwner: { id: 'O_owner1' } } }),
    stdout: '',
    stderr: '',
    exitCode: 0,
  };
  const createdShell = {
    output: JSON.stringify({
      data: { createProjectV2: { projectV2: { id: 'PVT_1', number: 7, title: 'Roadmap', url: 'https://x', closed: false } } },
    }),
    stdout: '',
    stderr: '',
    exitCode: 0,
  };

  it('resolves the owner id first, then sends ownerId + title as the mutation body', async () => {
    runInShell.mockResolvedValueOnce(ownerIdShell).mockResolvedValueOnce(createdShell);

    const result = await createProject(forge, 'Roadmap');

    expect(runInShell).toHaveBeenCalledTimes(2);
    // Owner resolution uses `-f` flags for its two String! variables — a
    // plain lookup query, not a polymorphic value, so `-f`'s "everything is
    // a string" behaviour is exactly right here.
    expect(runInShell.mock.calls[0]?.[0]).toContain('-f login=');
    expect(runInShell.mock.calls[1]?.[0]).toContain('gh api graphql --input -');
    expect(runInShell.mock.calls[1]?.[0]).toContain('createProjectV2');

    expect(result).toEqual({
      ok: true,
      kind: 'ok',
      project: { id: 'PVT_1', number: 7, title: 'Roadmap', url: 'https://x', closed: false, linkedToRepo: false },
    });
  });

  it('never reaches the mutation when the owner cannot be resolved', async () => {
    runInShell.mockResolvedValueOnce({ output: '{}', stdout: '', stderr: '', exitCode: 1 });

    const result = await createProject(forge, 'Roadmap');

    expect(runInShell).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });
});

describe('editProject / deleteProject', () => {
  const okMutation = (field: string) => ({
    output: JSON.stringify({ data: { [field]: { projectV2: { id: 'PVT_1' } } } }),
    stdout: '',
    stderr: '',
    exitCode: 0,
  });

  it('editProject sends only the fields given, never an unset closed/title', async () => {
    runInShell.mockResolvedValue(okMutation('updateProjectV2'));
    await editProject(forge, { projectId: 'PVT_1', title: 'New name' });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('updateProjectV2');
    expect(command).toContain('"title":"New name"');
    expect(command).not.toContain('"closed"');
  });

  it('editProject can close a board with no title change', async () => {
    runInShell.mockResolvedValue(okMutation('updateProjectV2'));
    await editProject(forge, { projectId: 'PVT_1', closed: true });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('"closed":true');
    expect(command).not.toContain('"title"');
  });

  it('deleteProject sends the projectId to deleteProjectV2', async () => {
    runInShell.mockResolvedValue(okMutation('deleteProjectV2'));
    const result = await deleteProject(forge, 'PVT_1');

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('deleteProjectV2');
    expect(command).toContain('"projectId":"PVT_1"');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });
});

describe('addProjectItem — existing issue or a brand-new draft', () => {
  it('an existing issue/PR (contentId) reaches addProjectV2ItemById', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'i2' } } } }),
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await addProjectItem(forge, { projectId: 'p1', contentId: 'c1' });

    expect(runInShell.mock.calls[0]?.[0]).toContain('addProjectV2ItemById');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });

  it('a draft (draftTitle/draftBody) reaches addProjectV2DraftIssue instead', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ data: { addProjectV2DraftIssue: { projectItem: { id: 'i3' } } } }),
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await addProjectItem(forge, { projectId: 'p1', draftTitle: 'A draft', draftBody: 'notes' });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('addProjectV2DraftIssue');
    expect(command).toContain('"title":"A draft"');
    expect(command).toContain('"body":"notes"');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });
});

describe('removeProjectItem', () => {
  it('sends projectId + itemId to deleteProjectV2Item', async () => {
    runInShell.mockResolvedValue({
      output: JSON.stringify({ data: { deleteProjectV2Item: { deletedItemId: 'i1' } } }),
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await removeProjectItem(forge, { projectId: 'p1', itemId: 'i1' });

    const [command] = runInShell.mock.calls[0]!;
    expect(command).toContain('deleteProjectV2Item');
    expect(command).toContain('"itemId":"i1"');
    expect(result).toEqual({ ok: true, kind: 'ok' });
  });
});
