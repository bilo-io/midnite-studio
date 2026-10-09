import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { gameCsp, gameProtocolHandler, GAME_MIME_BY_EXT, importMapHashes } from './game-protocol';

// `net.fetch` of a `file:` URL reads the bytes back; that is all the handler asks of it.
vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(async (url: string) => new Response(await readFile(fileURLToPath(url)))),
  },
}));

const GAME_ID = 'g0123456789ab';
// The index.html every new game is created from.
const TEMPLATE_INDEX = resolve(__dirname, '../../../../../templates/media-game/common/index.html');
const sha = (text: string): string => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
let root: string;
let outside: string;

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'midnite-game-root-')));
  outside = await realpath(await mkdtemp(join(tmpdir(), 'midnite-game-outside-')));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(join(root, 'vendor', 'rapier'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>g</title>');
  await writeFile(join(root, 'src', 'main.js'), 'console.log("hi")');
  await writeFile(join(root, 'vendor', 'rapier', 'rapier.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d]));
  await writeFile(join(root, '.git', 'config'), '[core]');
  await mkdir(join(root, 'templated'), { recursive: true });
  await writeFile(join(root, 'templated', 'index.html'), await readFile(TEMPLATE_INDEX, 'utf8'));
  await writeFile(join(root, '.env'), 'SECRET=1');
  await writeFile(join(outside, 'secret.txt'), 'outside');
  await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'));
  await symlink(outside, join(root, 'linked-dir'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const get = (path: string, network: 'off' | 'on' = 'off', host = GAME_ID): Promise<Response> =>
  gameProtocolHandler(root, GAME_ID, network)(new Request(`mstudio-game://${host}${path}`));

describe('mstudio-game scheme handler', () => {
  it('serves a file from the game repo', async () => {
    const res = await get('/src/main.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log("hi")');
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('serves index.html for a directory and for the root', async () => {
    expect(await (await get('/')).text()).toContain('<title>g</title>');
    expect((await get('/')).status).toBe(200);
  });

  it('serves .wasm with the wasm MIME type', async () => {
    const res = await get('/vendor/rapier/rapier.wasm');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    expect(GAME_MIME_BY_EXT['.glb']).toBe('model/gltf-binary');
  });

  it.each([
    ['a dot-dot traversal', '/../x'],
    ['an encoded dot-dot traversal', '/%2e%2e/x'],
    ['an encoded traversal into a sibling', '/src/%2e%2e/%2e%2e/x'],
    ['a symlinked file', '/link.txt'],
    ['a file inside a symlinked directory', '/linked-dir/secret.txt'],
    ['.git', '/.git/config'],
    ['a dotfile', '/.env'],
    ['a missing file', '/nope.js'],
    ['a NUL byte', '/src/main.js%00.png'],
    ['a backslash path', '/src%5Cmain.js'],
  ])('refuses %s', async (_name, path) => {
    expect((await get(path)).status).toBe(404);
  });

  it('refuses a request for another game id', async () => {
    expect((await get('/index.html', 'off', 'gdeadbeef0000')).status).toBe(404);
  });

  it('puts the CSP and nosniff on 200 and 404 alike', async () => {
    for (const res of [await get('/index.html'), await get('/missing.js')]) {
      expect(res.headers.get('content-security-policy')).toBe(gameCsp('off'));
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('opens https for connect, images and media only when the network is on', () => {
    const off = gameCsp('off');
    const on = gameCsp('on');
    expect(off).not.toContain('https:');
    expect(on).toContain("connect-src 'self' data: blob: https:");
    expect(on).toContain("img-src 'self' data: blob: https:");
    expect(on).toContain("media-src 'self' data: blob: https:");
    // Scripts never come from the network, on or off.
    expect(on).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(off).toContain("frame-src 'none'");
  });

  it("allows the template's inline import map by hash, and nothing else inline", async () => {
    const html = await readFile(TEMPLATE_INDEX, 'utf8');
    const body = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(body).toBeDefined();
    const csp = (await get('/templated/index.html')).headers.get('content-security-policy');
    expect(csp).toContain(`script-src 'self' 'wasm-unsafe-eval' ${sha(body ?? '')};`);
    const scriptSrc = csp?.split('; ').find((directive) => directive.startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
    // A non-HTML response never carries a hash.
    expect((await get('/src/main.js')).headers.get('content-security-policy')).toBe(gameCsp('off'));
  });
});

describe('importMapHashes', () => {
  it('hashes only import maps, deduplicated', () => {
    const html =
      '<script type="importmap">{"imports":{}}</script>' +
      "<SCRIPT TYPE='importmap' data-x>{\"imports\":{}}</SCRIPT>" +
      '<script>alert(1)</script><script type="module">x()</script>' +
      '<script type="importmapx">{}</script>';
    expect(importMapHashes(html)).toEqual([sha('{"imports":{}}')]);
  });

  it('hashes the text the parser sees, with CRLF folded to LF', () => {
    expect(importMapHashes('<script type="importmap">\r\n{}\r\n</script>')).toEqual([sha('\n{}\n')]);
  });

  it('returns nothing for a document without one', () => {
    expect(importMapHashes('<!doctype html><title>g</title>')).toEqual([]);
  });
});
