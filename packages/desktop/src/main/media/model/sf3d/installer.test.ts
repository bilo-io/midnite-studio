import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SF3D_LICENCE_SHA256, type Sf3dInstallProgress, type Sf3dManifest } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSf3dInstaller } from './installer';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const FILES: Record<string, Buffer> = {
  'onnx/a.onnx': Buffer.from('a'.repeat(3000)),
  'b.bin': Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251)),
};
const MANIFEST: Sf3dManifest = {
  schemaVersion: 1,
  assets: Object.fromEntries(Object.entries(FILES).map(([p, b]) => [p, { bytes: b.length, sha256: sha(b) }])),
};
const TOTAL = 8000;

type Served = { path: string; range?: string; auth?: string };

/** A tiny Hugging Face: serves FILES and the manifest, honours `Range` unless told not to. */
function fakeHub(opts: { ignoreRange?: boolean; corrupt?: string; manifest?: unknown; onChunk?: (path: string, sent: number) => void } = {}) {
  const requests: Served[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace('https://hub.test/', '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requests.push({ path, ...(headers.Range ? { range: headers.Range } : {}), ...(headers.Authorization ? { auth: headers.Authorization } : {}) });
    if (path === 'assets-manifest.json') return new Response(JSON.stringify(opts.manifest ?? MANIFEST), { status: 200 });
    let body = FILES[path];
    if (!body) return new Response('missing', { status: 404 });
    if (opts.corrupt === path) body = Buffer.from(body.map((x) => x ^ 1));
    let status = 200;
    const m = /^bytes=(\d+)-$/.exec(headers.Range ?? '');
    if (m && !opts.ignoreRange) {
      body = body.subarray(Number(m[1]));
      status = 206;
    }
    const signal = init?.signal;
    let sent = 0;
    const chunks = Array.from({ length: Math.ceil(body.length / 1000) }, (_, i) => body!.subarray(i * 1000, (i + 1) * 1000));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (signal?.aborted) return controller.error(new DOMException('aborted', 'AbortError'));
        const next = chunks.shift();
        if (!next) return controller.close();
        sent += next.length;
        controller.enqueue(new Uint8Array(next));
        opts.onChunk?.(path, sent);
      },
    });
    return new Response(stream, { status });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sf3d-install-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const make = (hub: ReturnType<typeof fakeHub>, extra: { readToken?: () => Promise<string | null> } = {}) =>
  createSf3dInstaller({
    directory: join(dir, 'sf3d'),
    fetch: hub.fetchImpl,
    manifest: MANIFEST,
    url: (p) => `https://hub.test/${p}`,
    throttleMs: 0,
    now: () => new Date('2026-10-04T12:00:00Z'),
    ...extra,
  });

const accept = { licenceSha256: SF3D_LICENCE_SHA256, revenueAcknowledged: true as const };

describe('SF3D installer', () => {
  it('downloads nothing before consent', async () => {
    const hub = fakeHub();
    const installer = make(hub);
    const result = await installer.install(() => undefined);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/Accept the Stability AI Community License/) });
    expect(hub.requests).toEqual([]);
    expect((await installer.status()).state).toBe('not-installed');
  });

  it('rejects consent to a different licence text', async () => {
    const installer = make(fakeHub());
    expect(await installer.consent({ licenceSha256: '0'.repeat(64), revenueAcknowledged: true })).toMatchObject({ ok: false });
    expect((await installer.status()).consent).toBeNull();
  });

  it('installs after consent, verifies every file, and reports installed', async () => {
    const hub = fakeHub();
    const installer = make(hub);
    const consented = await installer.consent(accept);
    expect(consented).toMatchObject({ ok: true, value: { consent: { licenceSha256: SF3D_LICENCE_SHA256, acceptedAt: '2026-10-04T12:00:00.000Z' } } });
    const events: Sf3dInstallProgress[] = [];
    const result = await installer.install((p) => events.push(p));
    expect(result).toMatchObject({ ok: true, value: { state: 'installed', bytesOnDisk: TOTAL, totalBytes: TOTAL } });
    expect(hub.requests.map((r) => r.path)).toEqual(['assets-manifest.json', 'onnx/a.onnx', 'b.bin']);
    expect(events[0]!.phase).toBe('manifest');
    expect(events.at(-1)).toMatchObject({ phase: 'ready', fraction: 1 });
    expect(events.filter((e) => e.phase === 'verify').map((e) => e.file)).toEqual(['onnx/a.onnx', 'b.bin']);
    expect(await readFile(installer.assetPath('b.bin'))).toEqual(FILES['b.bin']);
    // A second install is a no-op past the manifest.
    hub.requests.length = 0;
    expect(await installer.install(() => undefined)).toMatchObject({ ok: true });
    expect(hub.requests.map((r) => r.path)).toEqual(['assets-manifest.json']);
  });

  it('cancels mid-file, keeps the partial, and resumes it with a Range request that still verifies', async () => {
    let installer!: ReturnType<typeof make>;
    const hub = fakeHub({ onChunk: (path, sent) => path === 'b.bin' && sent === 4000 && installer.cancel() });
    installer = make(hub);
    await installer.consent(accept);
    const events: Sf3dInstallProgress[] = [];
    expect(await installer.install((p) => events.push(p))).toEqual({ ok: false, kind: 'error', message: 'cancelled' });
    expect(events.at(-1)!.phase).toBe('cancelled');
    const after = await installer.status();
    expect(after.state).toBe('not-installed');
    expect(after.bytesOnDisk).toBeGreaterThanOrEqual(3000 + 1000);
    expect(after.bytesOnDisk).toBeLessThan(TOTAL);

    const resumeHub = fakeHub();
    const resumed = make(resumeHub);
    expect(await resumed.install(() => undefined)).toMatchObject({ ok: true, value: { state: 'installed' } });
    const b = resumeHub.requests.find((r) => r.path === 'b.bin')!;
    expect(b.range).toMatch(/^bytes=\d+-$/);
    expect(resumeHub.requests.some((r) => r.path === 'onnx/a.onnx')).toBe(false);
    expect(await readFile(resumed.assetPath('b.bin'))).toEqual(FILES['b.bin']);
  });

  it('restarts a file whose server ignores the range', async () => {
    const assets = join(dir, 'sf3d', 'assets');
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, 'b.bin.part'), FILES['b.bin']!.subarray(0, 1234));
    const hub = fakeHub({ ignoreRange: true });
    const installer = make(hub);
    await installer.consent(accept);
    expect(await installer.install(() => undefined)).toMatchObject({ ok: true });
    expect(await readFile(installer.assetPath('b.bin'))).toEqual(FILES['b.bin']);
  });

  it('discards a file that fails its sha256 and reports why', async () => {
    const installer = make(fakeHub({ corrupt: 'b.bin' }));
    await installer.consent(accept);
    const events: Sf3dInstallProgress[] = [];
    const result = await installer.install((p) => events.push(p));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/b\.bin failed its sha256 check/) });
    expect(events.at(-1)!.phase).toBe('failed');
    expect(existsSync(`${installer.assetPath('b.bin')}.part`)).toBe(false);
    expect(existsSync(installer.assetPath('b.bin'))).toBe(false);
    expect((await installer.status()).error).toMatch(/sha256/);
  });

  it('refuses when the upstream manifest disagrees with the pin', async () => {
    const hub = fakeHub({ manifest: { schemaVersion: 1, assets: { ...MANIFEST.assets, 'b.bin': { bytes: 5000, sha256: 'f'.repeat(64) } } } });
    const installer = make(hub);
    await installer.consent(accept);
    expect(await installer.install(() => undefined)).toMatchObject({ ok: false, message: expect.stringMatching(/does not match the pinned/) });
    expect(hub.requests.map((r) => r.path)).toEqual(['assets-manifest.json']);
  });

  it('sends the vault token as a bearer header when one is stored', async () => {
    const hub = fakeHub();
    const installer = make(hub, { readToken: async () => 'hf_secret' });
    await installer.consent(accept);
    await installer.install(() => undefined);
    expect(hub.requests.every((r) => r.auth === 'Bearer hf_secret')).toBe(true);
  });

  it('refuses a second concurrent install, and cancel with nothing running', async () => {
    const installer = make(fakeHub());
    expect(installer.cancel()).toMatchObject({ ok: false });
    await installer.consent(accept);
    const first = installer.install(() => undefined);
    expect(await installer.install(() => undefined)).toMatchObject({ ok: false, message: 'SF3D is already installing.' });
    await first;
  });

  it('uninstalls cleanly: weights, partials and consent all go', async () => {
    const installer = make(fakeHub());
    await installer.consent(accept);
    await installer.install(() => undefined);
    const result = await installer.uninstall();
    expect(result).toMatchObject({ ok: true, value: { state: 'not-installed', consent: null, bytesOnDisk: 0 } });
    expect(existsSync(join(dir, 'sf3d'))).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it('uninstall stops a running install first', async () => {
    let installer!: ReturnType<typeof make>;
    let uninstalling: Promise<unknown> | null = null;
    const hub = fakeHub({ onChunk: (path, sent) => {
      if (path === 'onnx/a.onnx' && sent === 1000 && !uninstalling) uninstalling = installer.uninstall();
    } });
    installer = make(hub);
    await installer.consent(accept);
    const install = installer.install(() => undefined);
    expect(await install).toMatchObject({ ok: false, message: 'cancelled' });
    expect(await uninstalling).toMatchObject({ ok: true, value: { state: 'not-installed' } });
    expect(existsSync(join(dir, 'sf3d'))).toBe(false);
  });
});
