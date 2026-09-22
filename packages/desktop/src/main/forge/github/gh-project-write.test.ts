import type { Forge, ForgeProjectFieldValue } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addItemToProject, clearItemFieldValue, setItemFieldValue } from './gh-project-write';

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
