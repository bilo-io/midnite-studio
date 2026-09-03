import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ScaffoldEntry } from '@midnite/studio-shared';

import { applyScaffold } from './apply';
import { planScaffold } from './plan';

/**
 * Fixture helpers over real temp directories — the plan/apply engine's own
 * contract is about real filesystem races (a file changing between plan and
 * apply, a `.midnite/` with no manifest), which a mocked `fs` cannot stand in
 * for honestly.
 */

const hashOf = (content: string): string => createHash('sha256').update(content).digest('hex');

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, ...relPath.split('/'));
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
}

async function makeTemplate(files: Record<string, string>, version = '1.0.0'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mstudio-scaffold-template-'));
  await writeFile(join(root, '.template-version'), version);
  await writeTree(root, files);
  return root;
}

async function makeTarget(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mstudio-scaffold-target-'));
  await writeTree(root, files);
  return root;
}

function statusOf(entries: readonly ScaffoldEntry[], path: string): string | undefined {
  return entries.find((e) => e.path === path)?.status;
}

const roots: string[] = [];
async function track<T extends string>(root: T): Promise<T> {
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('planScaffold', () => {
  it('classifies every file as create on a fresh repo', async () => {
    const templateRoot = await track(
      await makeTemplate({ 'CLAUDE.md': 'hello', '.midnite/settings.json': '{"version":1}' }),
    );
    const targetRoot = await track(await makeTarget());

    const result = await planScaffold(templateRoot, targetRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toHaveLength(2);
    expect(result.value.entries.every((e) => e.status === 'create')).toBe(true);
    // The version marker is never itself a scaffold entry.
    expect(statusOf(result.value.entries, '.template-version')).toBeUndefined();
  });

  it('classifies unchanged on an identical re-run', async () => {
    const templateRoot = await track(await makeTemplate({ 'CLAUDE.md': 'hello' }));
    const targetRoot = await track(
      await makeTarget({
        'CLAUDE.md': 'hello',
        '.midnite/settings.json': JSON.stringify({
          version: 1,
          template: { version: '1.0.0', files: { 'CLAUDE.md': hashOf('hello') } },
        }),
      }),
    );

    const result = await planScaffold(templateRoot, targetRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statusOf(result.value.entries, 'CLAUDE.md')).toBe('unchanged');
  });

  it('classifies stale when the template moved on since the manifest was written', async () => {
    const templateRoot = await track(await makeTemplate({ 'CLAUDE.md': 'hello v2' }));
    const targetRoot = await track(
      await makeTarget({
        'CLAUDE.md': 'hello v1',
        '.midnite/settings.json': JSON.stringify({
          version: 1,
          template: { version: '1.0.0', files: { 'CLAUDE.md': hashOf('hello v1') } },
        }),
      }),
    );

    const result = await planScaffold(templateRoot, targetRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statusOf(result.value.entries, 'CLAUDE.md')).toBe('stale');
  });

  it('classifies a genuinely hand-edited file as locally-edited, and never stale', async () => {
    const templateRoot = await track(await makeTemplate({ 'CLAUDE.md': 'hello v2' }));
    const targetRoot = await track(
      await makeTarget({
        'CLAUDE.md': 'a human wrote this, not Setup',
        '.midnite/settings.json': JSON.stringify({
          version: 1,
          template: { version: '1.0.0', files: { 'CLAUDE.md': hashOf('hello v1') } },
        }),
      }),
    );

    const result = await planScaffold(templateRoot, targetRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statusOf(result.value.entries, 'CLAUDE.md')).toBe('locally-edited');
  });

  it('classifies a pre-existing .midnite/ with no manifest as locally-edited, wholesale', async () => {
    const templateRoot = await track(
      await makeTemplate({ '.midnite/tasks/_INDEX.md': 'template content' }),
    );
    // Byte-identical to the template, but there is no manifest at all — a
    // hand-made tracker that happens to match is still unprovenanced.
    const targetRoot = await track(
      await makeTarget({
        '.midnite/tasks/_INDEX.md': 'template content',
        '.midnite/settings.json': '{"version":1}', // Theme A's seed shape, no `template` field
      }),
    );

    const result = await planScaffold(templateRoot, targetRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statusOf(result.value.entries, '.midnite/tasks/_INDEX.md')).toBe('locally-edited');
  });

  it('fails the whole plan, loudly, on a template entry that would escape the target root', async () => {
    const templateRoot = await track(await makeTemplate({ 'CLAUDE.md': 'hello' }));
    const targetRoot = await track(await makeTarget());
    // A real directory walk can never produce a traversal segment — this is
    // the one case the plan doc itself calls "never possible from walkFiles's
    // own output" — so exercising the guard means injecting a fake listing
    // rather than a fake directory tree.
    const fakeWalk = async () => ['CLAUDE.md', '../escape.md'];

    const result = await planScaffold(templateRoot, targetRoot, fakeWalk);

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') return;
    expect(result.message).toContain('../escape.md');
  });
});

describe('applyScaffold', () => {
  it('writes every create entry and records their hashes in a fresh manifest', async () => {
    const templateRoot = await track(await makeTemplate({ 'CLAUDE.md': 'hello' }));
    const targetRoot = await track(await makeTarget());

    const result = await applyScaffold(templateRoot, targetRoot, ['CLAUDE.md']);

    expect(result.written).toEqual(['CLAUDE.md']);
    expect(result.skipped).toEqual([]);
    expect(await readFile(join(targetRoot, 'CLAUDE.md'), 'utf8')).toBe('hello');

    const manifest = JSON.parse(await readFile(join(targetRoot, '.midnite', 'settings.json'), 'utf8'));
    expect(manifest.template.files['CLAUDE.md']).toBe(hashOf('hello'));
  });

  it('writes a stale entry and skips a locally-edited one in the same batch', async () => {
    const templateRoot = await track(await makeTemplate({ 'a.md': 'v2', 'b.md': 'template b' }));
    const targetRoot = await track(
      await makeTarget({
        'a.md': 'v1',
        'b.md': 'a human wrote this',
        '.midnite/settings.json': JSON.stringify({
          version: 1,
          template: { version: '1.0.0', files: { 'a.md': hashOf('v1') } },
        }),
      }),
    );

    // The dialog never sends a locally-edited path — 'b.md' is included here
    // only to prove apply refuses to write over it even if asked.
    const result = await applyScaffold(templateRoot, targetRoot, ['a.md', 'b.md']);

    expect(result.written).toEqual(['a.md']);
    expect(result.skipped).toEqual([{ path: 'b.md', reason: 'changed on disk since the plan was read' }]);
    expect(await readFile(join(targetRoot, 'a.md'), 'utf8')).toBe('v2');
    expect(await readFile(join(targetRoot, 'b.md'), 'utf8')).toBe('a human wrote this');
  });

  it('skips a path that changed underneath an approved plan, rather than overwriting it', async () => {
    const templateRoot = await track(await makeTemplate({ 'a.md': 'from template' }));
    const targetRoot = await track(await makeTarget());
    // Simulates the plan-to-apply race: the file appears between the two,
    // with content the plan never saw and no manifest entry to vouch for it.
    await writeFile(join(targetRoot, 'a.md'), 'appeared after the plan was read');

    const result = await applyScaffold(templateRoot, targetRoot, ['a.md']);

    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([{ path: 'a.md', reason: 'changed on disk since the plan was read' }]);
    expect(await readFile(join(targetRoot, 'a.md'), 'utf8')).toBe('appeared after the plan was read');
  });

  it('writes files under directories that do not exist yet', async () => {
    const templateRoot = await track(
      await makeTemplate({ '.claude/skills/midnite-exec/SKILL.md': 'the skill' }),
    );
    const targetRoot = await track(await makeTarget());

    const result = await applyScaffold(templateRoot, targetRoot, [
      '.claude/skills/midnite-exec/SKILL.md',
    ]);

    expect(result.written).toEqual(['.claude/skills/midnite-exec/SKILL.md']);
    expect(await readFile(join(targetRoot, '.claude/skills/midnite-exec/SKILL.md'), 'utf8')).toBe(
      'the skill',
    );
  });

  it('a plan-then-apply round trip leaves a repo planScaffold reads back as unchanged', async () => {
    const templateRoot = await track(await makeTemplate({ 'CLAUDE.md': 'hello' }));
    const targetRoot = await track(await makeTarget());

    await applyScaffold(templateRoot, targetRoot, ['CLAUDE.md']);
    const result = await planScaffold(templateRoot, targetRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statusOf(result.value.entries, 'CLAUDE.md')).toBe('unchanged');
  });
});
