import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgyConversationAdapter } from './agy';

describe('createAgyConversationAdapter', () => {
  let root: string;
  let brainDir: string;
  let historyPath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'agy-conv-'));
    brainDir = join(root, 'brain');
    historyPath = join(root, 'history.jsonl');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns null when brainDir does not exist', async () => {
    const adapter = createAgyConversationAdapter({ brainDir, historyPath });
    expect(await adapter.locate('/Users/me/repo', 1_000, 10_000)).toBeNull();
  });

  it('matches a unique UUID directory via transcript.jsonl mtime within [since, until]', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const logsDir = join(brainDir, uuid, '.system_generated', 'logs');
    await mkdir(logsDir, { recursive: true });
    const transcript = join(logsDir, 'transcript.jsonl');
    await writeFile(transcript, '{"step_index":0}\n');
    await utimes(transcript, 10, 10);

    const adapter = createAgyConversationAdapter({ brainDir, historyPath });
    expect(await adapter.locate('/Users/me/repo', 5_000, 15_000)).toBe(uuid);
  });

  it('falls back to directory mtime when transcript.jsonl is absent', async () => {
    const uuid = '22222222-2222-4222-8222-222222222222';
    const entryDir = join(brainDir, uuid);
    await mkdir(entryDir, { recursive: true });
    await utimes(entryDir, 10, 10);

    const adapter = createAgyConversationAdapter({ brainDir, historyPath });
    expect(await adapter.locate('/Users/me/repo', 5_000, 15_000)).toBe(uuid);
  });

  it('excludes a newer brain/<uuid> mapped to another workspace in history.jsonl', async () => {
    const otherUuid = '33333333-3333-4333-8333-333333333333';
    const targetUuid = '44444444-4444-4444-8444-444444444444';

    await mkdir(join(brainDir, otherUuid, '.system_generated', 'logs'), { recursive: true });
    await writeFile(join(brainDir, otherUuid, '.system_generated', 'logs', 'transcript.jsonl'), '');
    await utimes(join(brainDir, otherUuid, '.system_generated', 'logs', 'transcript.jsonl'), 14, 14);

    await mkdir(join(brainDir, targetUuid, '.system_generated', 'logs'), { recursive: true });
    await writeFile(
      join(brainDir, targetUuid, '.system_generated', 'logs', 'transcript.jsonl'),
      '',
    );
    await utimes(
      join(brainDir, targetUuid, '.system_generated', 'logs', 'transcript.jsonl'),
      10,
      10,
    );

    await writeFile(
      historyPath,
      [
        'not-json',
        JSON.stringify({
          timestamp: 14_000,
          workspace: '/Users/me/other-repo',
          conversationId: otherUuid,
        }),
        JSON.stringify({
          timestamp: 10_000,
          workspace: '/Users/me/target-repo',
          conversationId: targetUuid,
        }),
      ].join('\n'),
    );

    const adapter = createAgyConversationAdapter({ brainDir, historyPath });
    expect(await adapter.locate('/Users/me/target-repo', 5_000, 15_000)).toBe(targetUuid);
  });

  it('ignores non-UUID directories and timestamps outside [since, until]', async () => {
    const validUuid = '55555555-5555-4555-8555-555555555555';
    await mkdir(join(brainDir, 'temp-folder'), { recursive: true });
    await utimes(join(brainDir, 'temp-folder'), 10, 10);

    await mkdir(join(brainDir, validUuid), { recursive: true });
    await utimes(join(brainDir, validUuid), 2, 2);

    const adapter = createAgyConversationAdapter({ brainDir, historyPath });
    expect(await adapter.locate('/Users/me/repo', 5_000, 15_000)).toBeNull();
  });

  it('returns null on an exact timestamp tie between two candidates', async () => {
    const uuidA = '66666666-6666-4666-8666-666666666666';
    const uuidB = '77777777-7777-4777-8777-777777777777';

    await mkdir(join(brainDir, uuidA), { recursive: true });
    await utimes(join(brainDir, uuidA), 10, 10);
    await mkdir(join(brainDir, uuidB), { recursive: true });
    await utimes(join(brainDir, uuidB), 10, 10);

    const adapter = createAgyConversationAdapter({ brainDir, historyPath });
    expect(await adapter.locate('/Users/me/repo', 5_000, 15_000)).toBeNull();
  });
});
