import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createOllamaSettingsStore, parseStoredSettings } from './settings-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-ollama-settings-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('createOllamaSettingsStore', () => {
  it('loads unset settings when the file is missing', async () => {
    const dir = await tempDir();
    const store = createOllamaSettingsStore(dir);
    expect(await store.load()).toEqual({ host: null, defaultModel: null });
  });

  it('round-trips host + defaultModel through save/load', async () => {
    const dir = await tempDir();
    const store = createOllamaSettingsStore(dir);
    await store.save({ host: 'http://10.0.0.5:11434', defaultModel: 'qwen3.5:14b' });
    expect(await store.load()).toEqual({
      host: 'http://10.0.0.5:11434',
      defaultModel: 'qwen3.5:14b',
    });
  });

  it('starts unset on a corrupt file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'ollama-settings.json'), '{not json', 'utf8');
    const store = createOllamaSettingsStore(dir);
    expect(await store.load()).toEqual({ host: null, defaultModel: null });
  });
});

describe('parseStoredSettings', () => {
  it('rejects a non-object value', () => {
    expect(parseStoredSettings(null)).toEqual({ host: null, defaultModel: null });
    expect(parseStoredSettings('nope')).toEqual({ host: null, defaultModel: null });
  });

  it('treats a non-string field as unset', () => {
    expect(parseStoredSettings({ host: 42, defaultModel: 7 })).toEqual({
      host: null,
      defaultModel: null,
    });
    expect(parseStoredSettings({})).toEqual({ host: null, defaultModel: null });
  });

  it('keeps one field set while the other is missing', () => {
    expect(parseStoredSettings({ host: '127.0.0.1:11434' })).toEqual({
      host: '127.0.0.1:11434',
      defaultModel: null,
    });
  });
});
