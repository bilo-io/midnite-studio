import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applySettingsSync, resetSettingsMirrorForTests } from '../settings-mirror';
import { locateAgentConversation } from './index';
import { slugifyCwd } from './slugify';

/** Phase 115 Theme F: "Read Claude and Codex history" off means no read under ~/.claude or ~/.codex. */
describe('locateAgentConversation and the Read Claude and Codex history switch', () => {
  let root: string;
  const cwd = '/Users/x/Dev/app';
  const uuid = '006b0bca-579e-4004-b7a6-3fd1243b7000';

  beforeEach(async () => {
    resetSettingsMirrorForTests();
    root = await mkdtemp(join(tmpdir(), 'conv-switch-'));
    const dir = join(root, slugifyCwd(cwd));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${uuid}.jsonl`), '');
    await utimes(join(dir, `${uuid}.jsonl`), 10, 10);
  });
  afterEach(async () => {
    resetSettingsMirrorForTests();
    await rm(root, { recursive: true, force: true });
  });

  it('finds the conversation while the switch is on (the default)', async () => {
    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 60_000, readAgentHistory: true });
    expect(await locateAgentConversation('claude', cwd, 5_000, 15_000, { claudeProjectsDir: root })).toBe(uuid);
  });

  it('answers null before the renderer has pushed its settings (fail closed)', async () => {
    expect(await locateAgentConversation('claude', cwd, 5_000, 15_000, { claudeProjectsDir: root })).toBeNull();
  });

  it('answers null without touching the directory once the switch is off', async () => {
    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 60_000, readAgentHistory: false });
    expect(await locateAgentConversation('claude', cwd, 5_000, 15_000, { claudeProjectsDir: root })).toBeNull();
  });

  it('locates agy conversations only when the history reads switch is on', async () => {
    const agyBrain = join(root, 'agy-brain');
    const agyUuid = '88888888-8888-4888-8888-888888888888';
    await mkdir(join(agyBrain, agyUuid), { recursive: true });
    await utimes(join(agyBrain, agyUuid), 10, 10);

    expect(
      await locateAgentConversation('agy', cwd, 5_000, 15_000, { agyBrainDir: agyBrain }),
    ).toBeNull();

    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 60_000, readAgentHistory: true });
    expect(
      await locateAgentConversation('agy', cwd, 5_000, 15_000, { agyBrainDir: agyBrain }),
    ).toBe(agyUuid);

    applySettingsSync({ autoFetchEnabled: true, autoFetchIntervalMs: 60_000, readAgentHistory: false });
    expect(
      await locateAgentConversation('agy', cwd, 5_000, 15_000, { agyBrainDir: agyBrain }),
    ).toBeNull();
  });
});
