import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCodexConversationAdapter, parseCodexTimestamp } from './codex';

describe('parseCodexTimestamp', () => {
  it('parses timestamps with hyphen-separated times', () => {
    const parsed = parseCodexTimestamp('2026-06-11T13-05-11');
    expect(parsed).toBe(Date.parse('2026-06-11T13:05:11Z'));
  });

  it('parses timestamps with milliseconds', () => {
    const parsed = parseCodexTimestamp('2026-08-28T21-52-45-123');
    expect(parsed).toBe(Date.parse('2026-08-28T21:52:45.123Z'));
  });

  it('parses standard ISO strings', () => {
    const parsed = parseCodexTimestamp('2026-06-11T13:05:11.000Z');
    expect(parsed).toBe(Date.parse('2026-06-11T13:05:11.000Z'));
  });

  it('returns null for non-date strings', () => {
    expect(parseCodexTimestamp('invalid-date')).toBeNull();
  });
});

describe('createCodexConversationAdapter', () => {
  let rootDir: string;
  let sessionsDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'codex-adapter-test-'));
    sessionsDir = join(rootDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const touchFile = async (
    subDir: string,
    filename: string,
    timeMs: number,
    content = '',
  ): Promise<string> => {
    const dir = join(sessionsDir, subDir);
    await mkdir(dir, { recursive: true });
    const fullPath = join(dir, filename);
    await writeFile(fullPath, content, 'utf8');
    const timeSec = timeMs / 1000;
    await utimes(fullPath, timeSec, timeSec);
    return fullPath;
  };

  it('locates conversation UUID matching filename timestamp in window', async () => {
    const uuid = '72141a4f-9e55-4d20-b659-c5074cdacb65';
    const tsIso = '2026-06-11T13-05-11';
    const tsMs = Date.parse('2026-06-11T13:05:11Z');

    await touchFile('', `rollout-${tsIso}-${uuid}.jsonl`, tsMs);

    const adapter = createCodexConversationAdapter({ sessionsDir });
    const result = await adapter.locate('/Users/bilo/Dev/midnite', tsMs - 1_000, tsMs + 1_000);

    expect(result).toBe(uuid);
  });

  it('locates conversation UUID when stored in nested directories (e.g. 2026/08/28)', async () => {
    const uuid = '01a049ee-8c61-7311-a0d1-63b0fb7c175b';
    const tsIso = '2026-08-28T21-52-45';
    const tsMs = Date.parse('2026-08-28T21:52:45Z');

    await touchFile('2026/08/28', `rollout-${tsIso}-${uuid}.jsonl`, tsMs);

    const adapter = createCodexConversationAdapter({ sessionsDir });
    const result = await adapter.locate('/Users/bilo/Dev/midnite', tsMs - 1_000, tsMs + 1_000);

    expect(result).toBe(uuid);
  });

  it('picks the newest file when multiple match within the window', async () => {
    const uuidOld = '11111111-1111-1111-1111-111111111111';
    const uuidNew = '22222222-2222-2222-2222-222222222222';
    const tOld = Date.parse('2026-06-11T10:00:00Z');
    const tNew = Date.parse('2026-06-11T12:00:00Z');

    await touchFile('', `rollout-2026-06-11T10-00-00-${uuidOld}.jsonl`, tOld);
    await touchFile('2026/06/11', `rollout-2026-06-11T12-00-00-${uuidNew}.jsonl`, tNew);

    const adapter = createCodexConversationAdapter({ sessionsDir });
    const result = await adapter.locate('/Users/bilo/Dev/midnite', tOld - 1_000, tNew + 1_000);

    expect(result).toBe(uuidNew);
  });

  it('returns null when the sessions directory does not exist', async () => {
    const adapter = createCodexConversationAdapter({
      sessionsDir: join(rootDir, 'non-existent-sessions'),
    });
    const result = await adapter.locate('/Users/bilo/Dev/midnite', 1_000, 2_000);

    expect(result).toBeNull();
  });

  it('returns null when the directory is empty', async () => {
    const adapter = createCodexConversationAdapter({ sessionsDir });
    const result = await adapter.locate('/Users/bilo/Dev/midnite', 1_000, 2_000);

    expect(result).toBeNull();
  });

  it('returns null when all files fall outside the window', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const tFile = Date.parse('2026-06-11T13:05:11Z');

    await touchFile('', `rollout-2026-06-11T13-05-11-${uuid}.jsonl`, tFile);

    const adapter = createCodexConversationAdapter({ sessionsDir });
    // Window is before file
    expect(await adapter.locate('/Users/bilo/Dev/midnite', tFile - 100_000, tFile - 50_000)).toBeNull();
    // Window is after file
    expect(await adapter.locate('/Users/bilo/Dev/midnite', tFile + 50_000, tFile + 100_000)).toBeNull();
  });

  it('ignores malformed filenames (not rollout-, bad date, non-UUID)', async () => {
    const tsMs = Date.parse('2026-06-11T13:05:11Z');

    await touchFile('', 'session-12345.jsonl', tsMs);
    await touchFile('', 'rollout-notadate-72141a4f-9e55-4d20-b659-c5074cdacb65.jsonl', tsMs);
    await touchFile('', 'rollout-2026-06-11T13-05-11-notauuid.jsonl', tsMs);
    await touchFile('', 'rollout-2026-06-11T13-05-11-72141a4f-9e55-4d20-b659-c5074cdacb65.txt', tsMs);

    const adapter = createCodexConversationAdapter({ sessionsDir });
    expect(await adapter.locate('/Users/bilo/Dev/midnite', tsMs - 1_000, tsMs + 1_000)).toBeNull();
  });

  it('returns null on ties for newest candidate', async () => {
    const uuid1 = '44444444-4444-4444-4444-444444444444';
    const uuid2 = '55555555-5555-5555-5555-555555555555';
    const tsIso = '2026-06-11T13-05-11';
    const tsMs = Date.parse('2026-06-11T13:05:11Z');

    await touchFile('', `rollout-${tsIso}-${uuid1}.jsonl`, tsMs);
    await touchFile('sub', `rollout-${tsIso}-${uuid2}.jsonl`, tsMs);

    const adapter = createCodexConversationAdapter({ sessionsDir });
    expect(await adapter.locate('/Users/bilo/Dev/midnite', tsMs - 1_000, tsMs + 1_000)).toBeNull();
  });
});
