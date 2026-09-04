import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProjectsStore, parseStoredSettings } from './projects-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-video-settings-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('createProjectsStore', () => {
  it('loads an unset root when the file is missing', async () => {
    const dir = await tempDir();
    const store = createProjectsStore(dir);
    expect(await store.load()).toEqual({ videoRoot: null });
  });

  it('round-trips the video root through save/load', async () => {
    const dir = await tempDir();
    const store = createProjectsStore(dir);
    await store.save({ videoRoot: '/Users/me/videos' });
    expect(await store.load()).toEqual({ videoRoot: '/Users/me/videos' });
  });

  it('starts unset on a corrupt file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'video-settings.json'), '{not json', 'utf8');
    const store = createProjectsStore(dir);
    expect(await store.load()).toEqual({ videoRoot: null });
  });
});

describe('parseStoredSettings', () => {
  it('rejects a non-object value', () => {
    expect(parseStoredSettings(null)).toEqual({ videoRoot: null });
    expect(parseStoredSettings('nope')).toEqual({ videoRoot: null });
  });

  it('treats a non-string videoRoot as unset', () => {
    expect(parseStoredSettings({ videoRoot: 42 })).toEqual({ videoRoot: null });
    expect(parseStoredSettings({})).toEqual({ videoRoot: null });
  });
});
