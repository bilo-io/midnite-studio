// @vitest-environment node
// vitest, not Playwright: a real `node:http` server, bound to 127.0.0.1 on an ephemeral port through the
// injected listen (never a real LAN interface), spoken to with raw `http.request` so traversal paths reach it
// unnormalised. ffmpeg is a fake port — nothing here spawns a process. Every server is stopped in afterEach.
import type { NetworkInterfaceInfo } from 'node:os';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FfmpegPort, TranscodeProcess } from './ffmpeg';
import type { LibraryLanController } from './lan';
import { createLanStreamServer, parseRange, type LanListen } from './lan-server';
import { createLibraryService, type LibraryService } from './library-service';

const LAN = '192.168.1.20';
const FAKE_INTERFACES = {
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as NetworkInterfaceInfo],
  en0: [{ address: LAN, family: 'IPv4', internal: false } as NetworkInterfaceInfo],
  en9: [{ address: '203.0.113.7', family: 'IPv4', internal: false } as NetworkInterfaceInfo],
};

/** Binds loopback on port 0 whatever address was asked for — the address check already ran. */
const loopbackListen = vi.fn<LanListen>(
  (server: Server) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0 }, () => {
        const info = server.address() as AddressInfo;
        resolve({ address: info.address, port: info.port });
      });
    }),
);

let base: string;
let media: string;
let data: string;
let library: LibraryService;
let lan: LibraryLanController | null;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mlib-lan-')));
  media = join(base, 'Media');
  data = join(base, 'data');
  await mkdir(media, { recursive: true });
  lan = null;
  loopbackListen.mockClear();
});
afterEach(async () => {
  await lan?.dispose();
  await rm(base, { recursive: true, force: true });
});

const put = async (rel: string, bytes: string | Uint8Array = 'x') => {
  const path = join(media, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return path;
};

type FakeProc = TranscodeProcess & { killed: boolean; stream: PassThrough; exit: () => void };

function fakeFfmpeg(banner = '') {
  const procs: FakeProc[] = [];
  const calls: Array<{ path: string; args: string[] }> = [];
  const port: FfmpegPort = {
    probe: vi.fn(async () => banner),
    transcode: (path, args) => {
      calls.push({ path, args });
      const stream = new PassThrough();
      const listeners: Array<() => void> = [];
      const proc: FakeProc = {
        stdout: stream,
        killed: false,
        stream,
        kill: () => {
          proc.killed = true;
          stream.end();
          proc.exit();
        },
        exit: () => listeners.splice(0).forEach((listener) => listener()),
        onExit: (listener) => void listeners.push(listener),
      };
      procs.push(proc);
      stream.write('fmp4-bytes');
      return proc;
    },
  };
  return { port, procs, calls };
}

async function setup(opts: { ffmpeg?: ReturnType<typeof fakeFfmpeg>; transcode?: boolean } = {}) {
  await put('Films/Up (2009)/Up (2009).mp4', '0123456789');
  await put('Films/Old (1999)/Old (1999).mkv', 'matroska');
  await put('Films/Up (2009)/poster.jpg', 'jpeg');
  library = createLibraryService({
    dataDir: data,
    pickDirectory: async () => media,
    homeDir: base,
  });
  await library.addRoot();
  await library.scan();
  const ffmpeg = opts.ffmpeg ?? fakeFfmpeg();
  lan = createLanStreamServer({
    library,
    dataDir: data,
    interfaces: () => FAKE_INTERFACES,
    listen: loopbackListen,
    ffmpeg: ffmpeg.port,
    isExecutable: async (path) => path === '/opt/homebrew/bin/ffmpeg',
    pathEnv: '',
  });
  if (opts.transcode) await lan.setSettings({ transcode: true });
  const started = await lan.start(LAN);
  if (!started.ok) throw new Error('the server did not start');
  const url = new URL(started.value.url!);
  const token = url.searchParams.get('k')!;
  const items = await library.items();
  const byPath = (suffix: string) => items.find((item) => item.path.endsWith(suffix))!;
  return { url, token, port: Number(url.port), items, byPath, ffmpeg };
}

type Reply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

/** A raw request: the path goes out exactly as written. */
function get(
  port: number,
  path: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    keep?: (abort: () => void) => void;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: opts.method ?? 'GET',
        headers: opts.headers,
        agent: false,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
          if (opts.keep) opts.keep(() => req.destroy());
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        res.on('error', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const k = (token: string) => `k=${encodeURIComponent(token)}`;

describe('binding', () => {
  it('refuses 0.0.0.0, loopback, a public address and one no interface holds — before listening', async () => {
    library = createLibraryService({ dataDir: data, pickDirectory: async () => media });
    lan = createLanStreamServer({
      library,
      dataDir: data,
      interfaces: () => FAKE_INTERFACES,
      listen: loopbackListen,
    });
    for (const address of ['0.0.0.0', '127.0.0.1', '203.0.113.7', '192.168.1.99', '::'])
      expect((await lan.start(address)).ok, address).toBe(false);
    expect((await lan.start()).ok).toBe(false);
    expect(loopbackListen).not.toHaveBeenCalled();
    expect((await lan.status()).running).toBe(false);
  });

  it('starts on a picked private address, remembers it, and stops cleanly', async () => {
    const { port, url } = await setup();
    expect(loopbackListen).toHaveBeenCalledWith(expect.anything(), LAN, 47620);
    const status = await lan!.status();
    expect(status).toMatchObject({ running: true, interfaces: [{ name: 'en0', address: LAN }] });
    expect(status.settings).toMatchObject({ address: LAN, wasOn: true });
    expect(url.searchParams.get('k')).toHaveLength(43);
    expect((await lan!.stop()).ok).toBe(true);
    expect((await lan!.status()).settings.wasOn).toBe(false);
    await expect(get(port, '/')).rejects.toThrow();
  });

  it('never starts at launch unless the user left it on and chose start-with-app', async () => {
    await setup();
    await lan!.dispose();
    expect((await lan!.status()).running).toBe(false);
    // Left on (dispose keeps wasOn), but start-with-app is off by default.
    await lan!.startAtLaunch();
    expect((await lan!.status()).running).toBe(false);
    await lan!.setSettings({ startWithApp: true });
    await lan!.startAtLaunch();
    expect((await lan!.status()).running).toBe(true);
    await lan!.stop();
    await lan!.startAtLaunch();
    expect((await lan!.status()).running).toBe(false);
  });
});

describe('the access token', () => {
  it('answers a bare 401 to any path without the right token', async () => {
    const { port, token, byPath } = await setup();
    const id = byPath('.mp4').id;
    for (const path of [
      '/',
      `/media/${id}`,
      '/nope',
      `/media/${id}?k=`,
      `/media/${id}?k=${token}x`,
      '/?k=wrong',
    ]) {
      const reply = await get(port, path);
      expect(reply.status, path).toBe(401);
      expect(reply.body, path).toBe('');
      expect(reply.headers['www-authenticate'], path).toBeUndefined();
      expect(reply.headers['content-type'], path).toBeUndefined();
    }
  });

  it('regenerate invalidates every old link', async () => {
    const { port, token } = await setup();
    expect((await get(port, `/?${k(token)}`)).status).toBe(200);
    await lan!.regenerateToken();
    expect((await get(port, `/?${k(token)}`)).status).toBe(401);
    const fresh = new URL((await lan!.status()).url!).searchParams.get('k')!;
    expect(fresh).not.toBe(token);
    expect((await get(port, `/?${k(fresh)}`)).status).toBe(200);
  });

  it('records who connected', async () => {
    const { port, token } = await setup();
    await get(port, '/?k=wrong');
    expect((await lan!.status()).clients).toEqual([]);
    await get(port, `/?${k(token)}`);
    await get(port, `/?${k(token)}`);
    expect((await lan!.status()).clients).toEqual([
      { address: '127.0.0.1', lastRequestAt: expect.any(Number), requests: 2 },
    ]);
  });
});

describe('pages', () => {
  it('lists the library under a strict CSP, with every link carrying the token', async () => {
    const { port, token, byPath } = await setup();
    const reply = await get(port, `/?${k(token)}`);
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8');
    const csp = String(reply.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toMatch(/https?:/);
    expect(reply.body).not.toMatch(/<script[^>]+src=/);
    expect(reply.body).not.toMatch(/https?:\/\//);
    expect(reply.body).toContain(`/item/${byPath('.mp4').id}?${k(token)}`);
    // An MKV without ffmpeg: listed, marked, not linked.
    expect(reply.body).toContain('Old');
    expect(reply.body).toContain('cannot play');
    expect(reply.body).not.toContain(`/item/${byPath('.mkv').id}`);
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers['referrer-policy']).toBe('no-referrer');
  });

  it('escapes what came from a file', async () => {
    await put('Music/<script>alert(1)</script>/x.mp3');
    const { port, token } = await setup();
    await library.scan();
    const body = (await get(port, `/?${k(token)}`)).body;
    expect(body).not.toContain('<script>alert(1)</script>');
    expect(body).toContain('&lt;script&gt;');
  });

  it('gives an item a player page and a playlist a sequential one', async () => {
    const { port, token, byPath } = await setup();
    const film = byPath('.mp4');
    const page = await get(port, `/item/${film.id}?${k(token)}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain(`<video controls`);
    expect(page.body).toContain(`src="/media/${film.id}?${k(token)}"`);
    expect(page.body).toContain(`poster="/art/${film.id}?${k(token)}"`);

    const created = await library.createPlaylist({
      name: 'Night & day',
      itemIds: [film.id, byPath('.mkv').id],
    });
    if (!created.ok) throw new Error('create');
    const index = await get(port, `/?${k(token)}`);
    expect(index.body).toContain(`/playlist/${created.value.playlist.id}?${k(token)}`);
    expect(index.body).toContain('Night &amp; day');
    const list = await get(port, `/playlist/${created.value.playlist.id}?${k(token)}`);
    expect(list.status).toBe(200);
    expect(list.body).toContain(`data-src="/media/${film.id}?${k(token)}"`);
    expect(list.body).toContain('<script>');
    expect(String(list.headers['content-security-policy'])).toMatch(/script-src 'sha256-/);
  });
});

describe('the path jail', () => {
  it('serves an indexed file with Range, and nothing else', async () => {
    const { port, token, byPath } = await setup();
    const id = byPath('.mp4').id;
    const whole = await get(port, `/media/${id}?${k(token)}`);
    expect(whole).toMatchObject({ status: 200, body: '0123456789' });
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.headers['content-type']).toBe('video/mp4');
    expect(whole.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    const part = await get(port, `/media/${id}?${k(token)}`, { headers: { Range: 'bytes=2-5' } });
    expect(part).toMatchObject({ status: 206, body: '2345' });
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    const tail = await get(port, `/media/${id}?${k(token)}`, { headers: { Range: 'bytes=-3' } });
    expect(tail.body).toBe('789');
    const bad = await get(port, `/media/${id}?${k(token)}`, { headers: { Range: 'bytes=50-' } });
    expect(bad.status).toBe(416);
    const head = await get(port, `/media/${id}?${k(token)}`, { method: 'HEAD' });
    expect(head).toMatchObject({ status: 200, body: '' });
    expect(head.headers['content-length']).toBe('10');
    expect((await get(port, `/art/${id}?${k(token)}`)).body).toBe('jpeg');
  });

  it('refuses traversal, encoded traversal, absolute paths and unindexed files', async () => {
    await writeFile(join(base, 'secret.txt'), 'top secret');
    const { port, token } = await setup();
    await put('Films/notes.txt', 'not media');
    await symlink(join(base, 'secret.txt'), join(media, 'Films', 'link.mp4'));
    await library.scan();
    const t = k(token);
    for (const path of [
      `/../secret.txt?${t}`,
      `/media/../../secret.txt?${t}`,
      `/media/..%2F..%2Fsecret.txt?${t}`,
      `/media/%2e%2e/%2e%2e/secret.txt?${t}`,
      `/media/%2Fetc%2Fpasswd?${t}`,
      `/media//etc/passwd?${t}`,
      `//etc/passwd?${t}`,
      `/media/${join(base, 'secret.txt')}?${t}`,
      `/media/Films/notes.txt?${t}`,
      `/media/${'0'.repeat(20)}?${t}`,
      `/media/${'0'.repeat(20)}/x?${t}`,
      `/files/?${t}`,
      `/Films/?${t}`,
    ]) {
      const reply = await get(port, path);
      expect([400, 404], path).toContain(reply.status);
      expect(reply.body, path).not.toContain('top secret');
      expect(reply.body, path).not.toContain('not media');
    }
    // The symlink out of the root is never indexed, so it has no id to ask for.
    expect((await library.items()).some((item) => item.path.endsWith('link.mp4'))).toBe(false);
  });

  it('serves only what resolveFile answers', async () => {
    const { port, token, byPath } = await setup();
    const id = byPath('.mp4').id;
    const spy = vi.spyOn(library, 'resolveFile').mockResolvedValue(null);
    expect((await get(port, `/media/${id}?${k(token)}`)).status).toBe(404);
    expect(spy).toHaveBeenCalled();
  });

  it('is read-only', async () => {
    const { port, token, byPath } = await setup();
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH'])
      expect(
        (await get(port, `/media/${byPath('.mp4').id}?${k(token)}`, { method })).status,
        method,
      ).toBe(405);
  });
});

describe('transcoding', () => {
  const HEVC = `Input #0, matroska,webm, from 'x.mkv':
  Duration: 00:00:01.01, start: 0.000000, bitrate: 111 kb/s
  Stream #0:0: Video: hevc (Rext), yuv420p, 64x48, 10 fps
  Stream #0:1: Audio: opus, 48000 Hz, mono, fltp`;

  it('is off until the user turns it on, and spawns nothing until then', async () => {
    const ffmpeg = fakeFfmpeg(HEVC);
    const { port, token, byPath } = await setup({ ffmpeg });
    expect((await get(port, `/transcode/${byPath('.mkv').id}?${k(token)}`)).status).toBe(404);
    expect((await get(port, `/item/${byPath('.mkv').id}?${k(token)}`)).body).toContain(
      'cannot play',
    );
    expect(ffmpeg.port.probe).not.toHaveBeenCalled();
    expect(ffmpeg.calls).toEqual([]);
  });

  it('probes once, caches it, and streams fMP4 from the jailed path through an argument array', async () => {
    const ffmpeg = fakeFfmpeg(HEVC);
    const { port, token, byPath } = await setup({ ffmpeg, transcode: true });
    const mkv = byPath('.mkv');
    const page = await get(port, `/item/${mkv.id}?${k(token)}`);
    expect(page.body).toContain(`src="/transcode/${mkv.id}?${k(token)}"`);
    await get(port, `/item/${mkv.id}?${k(token)}`);
    expect(ffmpeg.port.probe).toHaveBeenCalledTimes(1);
    expect(await library.cachedProbe(mkv.id)).toMatchObject({ video: 'hevc' });

    const reply = await get(port, `/transcode/${mkv.id}?${k(token)}`, {
      keep: () => ffmpeg.procs[0]?.kill(),
    });
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toBe('video/mp4');
    expect(reply.body).toContain('fmp4-bytes');
    const [call] = ffmpeg.calls;
    expect(call?.path).toBe('/opt/homebrew/bin/ffmpeg');
    const resolved = await library.resolveFile(mkv.rootId, mkv.path);
    expect(call?.args[call.args.indexOf('-i') + 1]).toBe(resolved);
    expect(Array.isArray(call?.args)).toBe(true);
  });

  it('kills ffmpeg when the client goes away, and bounds concurrency', async () => {
    const ffmpeg = fakeFfmpeg(HEVC);
    const { port, token, byPath } = await setup({ ffmpeg, transcode: true });
    const id = byPath('.mkv').id;
    // Two clients hold streams open…
    const holders = [0, 1].map(
      () =>
        new Promise<() => void>((resolve) => {
          const req = request(
            { host: '127.0.0.1', port, path: `/transcode/${id}?${k(token)}`, agent: false },
            (res) => res.once('data', () => resolve(() => req.destroy())),
          );
          req.on('error', () => undefined);
          req.end();
        }),
    );
    const aborts = await Promise.all(holders);
    expect((await lan!.status()).transcodes).toBe(2);
    // …so a third is told to wait.
    expect((await get(port, `/transcode/${id}?${k(token)}`)).status).toBe(503);
    aborts[0]!();
    await vi.waitFor(() => expect(ffmpeg.procs[0]?.killed).toBe(true));
    await vi.waitFor(async () => expect((await lan!.status()).transcodes).toBe(1));
    // Stopping the server kills the rest.
    await lan!.stop();
    expect(ffmpeg.procs[1]?.killed).toBe(true);
    aborts[1]!();
  });

  it('says whether ffmpeg was found', async () => {
    const { ffmpeg } = await setup();
    expect(ffmpeg).toBeDefined();
    expect((await lan!.status()).ffmpeg).toEqual({
      found: true,
      path: '/opt/homebrew/bin/ffmpeg',
      source: 'homebrew',
    });
    expect((await lan!.setSettings({ ffmpegPath: '/bin/sh' })).ok).toBe(false);
    expect((await lan!.setSettings({ ffmpegPath: '/nowhere/ffmpeg' })).ok).toBe(true);
    expect((await lan!.status()).ffmpeg.found).toBe(false);
  });
});

describe('settings', () => {
  it('refuses a public address and changes of network while running', async () => {
    await setup();
    expect((await lan!.setSettings({ address: '8.8.8.8' })).ok).toBe(false);
    expect((await lan!.setSettings({ address: '10.0.0.9' })).ok).toBe(false);
    expect((await lan!.setSettings({ startWithApp: true })).ok).toBe(true);
  });
});

describe('parseRange', () => {
  it('reads one bytes= range', () => {
    expect(parseRange(undefined, 10)).toBe('whole');
    expect(parseRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=3-100', 10)).toEqual({ start: 3, end: 9 });
    expect(parseRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 });
    expect(parseRange('bytes=0-1,4-5', 10)).toBe('whole');
    expect(parseRange('bytes=9-3', 10)).toBe('unsatisfiable');
    expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 10)).toBe('unsatisfiable');
    expect(parseRange('bytes=-', 10)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable');
  });
});
