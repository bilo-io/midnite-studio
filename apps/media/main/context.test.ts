// @vitest-environment node
// vitest, not Playwright: handler registration and the file handler are logic over injected electron pieces.
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { libraryFileResolver, mediaLibraryManifest } from '@midnite/studio-feature-media-library/main';
import { CHANNELS, EVENT_CHANNELS, libraryFileUrl, type LibraryItem } from '@midnite/studio-shared';

import { mediaLibraryDataDir, registerMediaHandlers, type MediaElectron } from './context';
import { installMediaFileProtocol, resolveMediaFileUrl } from './file-protocol';

/** Temp-dir fixtures only: every library folder here is one this suite made under the OS temp dir. */
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup(extra: Partial<MediaElectron> = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'media-app-')));
  dirs.push(base);
  const folder = join(base, 'Films');
  await mkdir(join(folder, 'Up (2009)'), { recursive: true });
  await writeFile(join(folder, 'Up (2009)', 'Up (2009).mkv'), 'video');
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const sent: string[] = [];
  const fetchFn = vi.fn(async () => {
    throw new Error('Media made a network call with online metadata off');
  }) as unknown as typeof fetch;
  const readKey = vi.fn(async () => 'a-key');
  const library = registerMediaHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: () => undefined },
    trashItem: async () => undefined,
    send: (channel) => void sent.push(channel),
    dataDir: mediaLibraryDataDir(join(base, 'userData')),
    pickDirectory: async () => folder,
    readKey,
    fetch: fetchFn,
    homeDir: base,
    ...extra,
  });
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload);
  return { base, folder, handlers, invoke, library, sent, fetchFn, readKey };
}

describe('registerMediaHandlers', () => {
  it('registers exactly the Library channels', async () => {
    const { handlers } = await setup();
    expect([...handlers.keys()].sort()).toEqual([...mediaLibraryManifest.ipc].sort());
  });

  it('adds a picked folder, scans it, and keeps the index under its own data dir', async () => {
    const { invoke, sent, base } = await setup();
    const added = (await invoke(CHANNELS.mediaLibraryAddRoot)) as { ok: boolean };
    expect(added.ok).toBe(true);
    const scanned = (await invoke(CHANNELS.mediaLibraryScan, {})) as { ok: boolean };
    expect(scanned.ok).toBe(true);
    const { items } = (await invoke(CHANNELS.mediaLibraryItems, {})) as { items: LibraryItem[] };
    expect(items.map((i) => [i.kind, i.title])).toEqual([['film', 'Up']]);
    expect(sent).toContain(EVENT_CHANNELS.mediaLibraryChanged);
    expect(mediaLibraryDataDir(join(base, 'userData'))).toBe(join(base, 'userData', 'media-library'));
  });

  it('makes no network call and reads no key while online metadata is off (the default)', async () => {
    const { invoke, fetchFn, readKey } = await setup();
    await invoke(CHANNELS.mediaLibraryAddRoot);
    await invoke(CHANNELS.mediaLibraryScan, {});
    const settings = (await invoke(CHANNELS.mediaLibrarySettingsGet)) as {
      settings: { onlineMetadata: boolean };
    };
    expect(settings.settings.onlineMetadata).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(readKey).not.toHaveBeenCalled();
  });

  it('leaves the provider unwired when no fetch is given, whatever the switch says', async () => {
    const { invoke } = await setup({ fetch: undefined });
    await invoke(CHANNELS.mediaLibrarySettingsSet, { onlineMetadata: true });
    await invoke(CHANNELS.mediaLibraryAddRoot);
    expect(((await invoke(CHANNELS.mediaLibraryScan, {})) as { ok: boolean }).ok).toBe(true);
  });
});

describe('the mstudio-file handler', () => {
  it('serves an indexed item through the library and 404s every other host', async () => {
    const { invoke, library, folder } = await setup();
    await invoke(CHANNELS.mediaLibraryAddRoot);
    await invoke(CHANNELS.mediaLibraryScan, {});
    const [item] = await library.items();
    const resolve = libraryFileResolver(library);
    const url = libraryFileUrl({ rootId: item!.rootId, path: item!.path });
    expect(await resolveMediaFileUrl(url, resolve)).toBe(join(folder, 'Up (2009)', 'Up (2009).mkv'));
    expect(await resolveMediaFileUrl('mstudio-file://repo/x/a.png', resolve)).toBeNull();
    expect(await resolveMediaFileUrl('mstudio-file://video/-/a.mp4', resolve)).toBeNull();
    expect(await resolveMediaFileUrl('file:///etc/hosts', resolve)).toBeNull();
    expect(await resolveMediaFileUrl('not a url', resolve)).toBeNull();
  });

  it('refuses a file the index does not hold, and a symlink out of the folder', async () => {
    const { invoke, library, folder, base } = await setup();
    await writeFile(join(base, 'secret.mkv'), 'nope');
    await symlink(join(base, 'secret.mkv'), join(folder, 'Escape.mkv'));
    await invoke(CHANNELS.mediaLibraryAddRoot);
    await invoke(CHANNELS.mediaLibraryScan, {});
    const [root] = await library.roots();
    const resolve = libraryFileResolver(library);
    expect(await resolveMediaFileUrl(libraryFileUrl({ rootId: root!.id, path: 'Escape.mkv' }), resolve)).toBeNull();
    expect(
      await resolveMediaFileUrl(libraryFileUrl({ rootId: root!.id, path: 'Up (2009)/nothing.mkv' }), resolve),
    ).toBeNull();
  });

  it('answers a refused URL with a 404 and forwards a served one with the request headers', async () => {
    let handler: ((request: { url: string; headers: Headers }) => Promise<Response>) | null = null;
    const fetchFile = vi.fn(async () => new Response('bytes', { status: 206 }));
    installMediaFileProtocol(
      { handle: (_scheme, h) => void (handler = h), fetchFile },
      async (raw) => (raw.endsWith('/ok.mkv') ? '/media/ok.mkv' : null),
    );
    const headers = new Headers({ range: 'bytes=0-' });
    const refused = await handler!({ url: 'mstudio-file://library/r0123456789ab/no.mkv', headers });
    expect(refused.status).toBe(404);
    const served = await handler!({ url: 'mstudio-file://library/r0123456789ab/ok.mkv', headers });
    expect(served.status).toBe(206);
    expect(fetchFile).toHaveBeenCalledWith('file:///media/ok.mkv', headers);
  });
});
