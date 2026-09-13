import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createClaudeConversationAdapter } from './claude';
import { slugifyCwd } from './slugify';

describe('createClaudeConversationAdapter', () => {
  let rootDir: string;
  let projectsDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'claude-adapter-test-'));
    projectsDir = join(rootDir, 'projects');
    await mkdir(projectsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const touchFile = async (
    slug: string,
    filename: string,
    timeMs: number,
    content = '',
  ): Promise<string> => {
    const dir = join(projectsDir, slug);
    await mkdir(dir, { recursive: true });
    const fullPath = join(dir, filename);
    await writeFile(fullPath, content, 'utf8');
    const timeSec = timeMs / 1000;
    await utimes(fullPath, timeSec, timeSec);
    return fullPath;
  };

  it('locates conversation UUID when a valid .jsonl file falls within [since, until]', async () => {
    const cwd = '/Users/bilo/Dev/midnite-studio';
    const slug = slugifyCwd(cwd);
    const uuid = '006b0bca-579e-4004-b7a6-3fd1243b7000';

    await touchFile(slug, `${uuid}.jsonl`, 10_000);

    const adapter = createClaudeConversationAdapter({ projectsDir });
    const result = await adapter.locate(cwd, 5_000, 15_000);

    expect(result).toBe(uuid);
  });

  it('picks the newest file by mtime when multiple fall within the window', async () => {
    const cwd = '/Users/bilo/Dev/midnite-studio';
    const slug = slugifyCwd(cwd);
    const uuidOld = '11111111-1111-1111-1111-111111111111';
    const uuidNew = '22222222-2222-2222-2222-222222222222';

    await touchFile(slug, `${uuidOld}.jsonl`, 10_000);
    await touchFile(slug, `${uuidNew}.jsonl`, 20_000);

    const adapter = createClaudeConversationAdapter({ projectsDir });
    const result = await adapter.locate(cwd, 5_000, 25_000);

    expect(result).toBe(uuidNew);
  });

  it('returns null when the project directory does not exist', async () => {
    const adapter = createClaudeConversationAdapter({ projectsDir });
    const result = await adapter.locate('/Users/bilo/Dev/non-existent-project', 1_000, 2_000);

    expect(result).toBeNull();
  });

  it('returns null when the project directory is empty', async () => {
    const cwd = '/Users/bilo/Dev/empty-project';
    const slug = slugifyCwd(cwd);
    await mkdir(join(projectsDir, slug), { recursive: true });

    const adapter = createClaudeConversationAdapter({ projectsDir });
    const result = await adapter.locate(cwd, 1_000, 2_000);

    expect(result).toBeNull();
  });

  it('returns null when all files fall outside the [since, until] window', async () => {
    const cwd = '/Users/bilo/Dev/midnite-studio';
    const slug = slugifyCwd(cwd);
    const uuid = '33333333-3333-3333-3333-333333333333';

    await touchFile(slug, `${uuid}.jsonl`, 50_000);

    const adapter = createClaudeConversationAdapter({ projectsDir });
    // Window is before file
    expect(await adapter.locate(cwd, 10_000, 20_000)).toBeNull();
    // Window is after file
    expect(await adapter.locate(cwd, 60_000, 70_000)).toBeNull();
  });

  it('ignores malformed filenames (non-UUID, non-jsonl, random text)', async () => {
    const cwd = '/Users/bilo/Dev/midnite-studio';
    const slug = slugifyCwd(cwd);

    await touchFile(slug, 'not-a-uuid.jsonl', 10_000);
    await touchFile(slug, '12345.jsonl', 10_000);
    await touchFile(slug, '33333333-3333-3333-3333-333333333333.txt', 10_000);
    await touchFile(slug, 'random-notes.md', 10_000);

    const adapter = createClaudeConversationAdapter({ projectsDir });
    expect(await adapter.locate(cwd, 5_000, 15_000)).toBeNull();
  });

  it('returns null when two newest files have identical mtime (treats ties as no match)', async () => {
    const cwd = '/Users/bilo/Dev/midnite-studio';
    const slug = slugifyCwd(cwd);
    const uuid1 = '44444444-4444-4444-4444-444444444444';
    const uuid2 = '55555555-5555-5555-5555-555555555555';

    await touchFile(slug, `${uuid1}.jsonl`, 10_000);
    await touchFile(slug, `${uuid2}.jsonl`, 10_000);

    const adapter = createClaudeConversationAdapter({ projectsDir });
    expect(await adapter.locate(cwd, 5_000, 15_000)).toBeNull();
  });
});
