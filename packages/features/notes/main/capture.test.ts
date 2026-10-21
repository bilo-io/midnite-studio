// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { launcherInstalledFile } from '@midnite/studio-runtime';

import { captureTarget, createCapture, mindNotebookFile } from './capture';
import { createNotesStore } from './notes-store';

let appData: string;
let studioDir: string;
beforeEach(async () => {
  appData = await mkdtemp(join(tmpdir(), 'capture-appdata-'));
  studioDir = await mkdtemp(join(tmpdir(), 'capture-studio-'));
});
afterEach(async () => {
  await rm(appData, { recursive: true, force: true });
  await rm(studioDir, { recursive: true, force: true });
});

async function install(content: string): Promise<void> {
  const file = launcherInstalledFile(appData);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, content);
}

function capturer() {
  const local = createNotesStore(studioDir, { debounceMs: 0 });
  let n = 0;
  const capture = createCapture({
    appData,
    localStore: () => local,
    now: () => 5,
    newId: () => `id${++n}`,
    openMindStore: (dir) => createNotesStore(dir, { debounceMs: 0 }),
  });
  return { capture, local };
}

describe('quick capture target', () => {
  it('goes to the Inbox with no installed.json', async () => {
    const { capture, local } = capturer();
    expect(await capture('  a thought ')).toEqual({ ok: true, target: 'inbox', noteId: 'id1' });
    expect((await local.list('inbox')).map((n) => n.body)).toEqual(['a thought']);
    await expect(readFile(mindNotebookFile(appData))).rejects.toThrow();
  });

  it('goes to Mind\'s notebook file when installed.json lists mind', async () => {
    await install(JSON.stringify({ schemaVersion: 1, apps: [{ id: 'browser' }, { id: 'mind' }] }));
    const { capture, local } = capturer();
    expect(await capture('into mind')).toMatchObject({ ok: true, target: 'mind' });
    const stored = JSON.parse(await readFile(mindNotebookFile(appData), 'utf8'));
    expect(stored.notes.map((n: { body: string; repoId: string }) => [n.repoId, n.body])).toEqual([['mind', 'into mind']]);
    expect(await local.list('inbox')).toEqual([]);
  });

  it('appends beside notes Mind already has, newest on top', async () => {
    await install(JSON.stringify({ schemaVersion: 1, apps: [{ id: 'mind' }] }));
    const { capture } = capturer();
    await capture('first');
    await capture('second');
    const stored = JSON.parse(await readFile(mindNotebookFile(appData), 'utf8')).notes;
    expect(stored.map((n: { body: string; order: number }) => [n.body, n.order])).toEqual([
      ['first', 0],
      ['second', -1],
    ]);
  });

  it('treats a malformed or unrelated installed.json as not installed', async () => {
    for (const bad of ['{ nope', '{}', JSON.stringify({ schemaVersion: 2, apps: [{ id: 'mind' }] })]) {
      await install(bad);
      expect(captureTarget(appData)).toBe('inbox');
    }
    await install(JSON.stringify({ schemaVersion: 1, apps: [{ id: 'monitor' }] }));
    expect(captureTarget(appData)).toBe('inbox');
  });

  it('does not save an empty capture', async () => {
    const { capture, local } = capturer();
    expect(await capture('   ')).toMatchObject({ ok: false });
    expect(await local.list('inbox')).toEqual([]);
  });

  it('is not overwritten by a Mind store that cached the notebook before the capture', async () => {
    await install(JSON.stringify({ schemaVersion: 1, apps: [{ id: 'mind' }] }));
    const { capture } = capturer();
    await capture('one');
    // Mind (a separate process) opens the notebook, then Studio captures again, then Mind saves.
    const mind = createNotesStore(join(appData, 'Midnite Runtime', 'apps', 'mind'), { debounceMs: 0 });
    const [seen] = await mind.list('mind');
    await new Promise((r) => setTimeout(r, 20));
    await capture('two');
    await mind.save({ ...seen!, body: 'one edited' });
    await mind.flush();
    const bodies = (await mind.list('mind')).map((n) => n.body).sort();
    expect(bodies).toEqual(['one edited', 'two']);
  });
});
