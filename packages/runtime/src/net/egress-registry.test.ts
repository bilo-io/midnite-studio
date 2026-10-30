import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EGRESS_ENTRIES, EGRESS_HOSTS, EgressHostSchema, findEgressEntry, privacySwitchOn, rendererConnectOrigins } from '@midnite/studio-shared';

import { EgressBlockedError, EgressRedirectError, EgressUnregisteredError, createGuardedFetch } from './guarded-fetch';

/**
 * Phase 115 Theme A — a main-side request to an unregistered host fails CI.
 *
 * Vitest, not a browser test: it is a source scan plus the seam's own behaviour (decision rule in
 * `docs/TESTING.md`). Same shape as `agent-config-no-write.test.ts` and `persisted-secrets.test.ts`.
 *
 * The scan fails on any `fetch(`, `net.fetch(`, `net.request(`, `http(s).get(` or `http(s).request(` in
 * main-side code that is not `guardedFetch`. `UNMIGRATED` is the ratchet: callers that still own a raw
 * client, each with the reason and the follow-up. Entries only ever leave the list.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const SKIP = new Set(['node_modules', 'dist', 'out', 'release', '.vite', 'e2e', 'website', 'renderer', 'scripts']);

/** Main-side code: feature mains, the runtime, the desktop's main/broker, and each app's main. */
const MAIN_SIDE = /(^|\/)(main|runtime\/src|desktop\/src|apps\/[^/]+\/src\/main)\//;

const REQUEST_CALL = /(?<![.\w])(?:globalThis\.)?fetch\s*\(|\bnet\.(?:fetch|request)\s*\(|\bhttps?\.(?:get|request)\s*\(/;
/** A raw `fetch` handed on as a value: `fetchImpl: fetch`, `?? fetch)`, `= fetch;`. */
const REQUEST_VALUE = /(?:\?\?|=|:)\s*(?:globalThis\.)?fetch\s*[,)};]/;

/** Files that may use a raw client, and why. Path → reason. */
const UNMIGRATED: Record<string, string> = {
  'packages/runtime/src/net/guarded-fetch.ts': 'the seam itself',
  'packages/desktop/src/main/ipc/status-handlers.ts': 'git fetch, not an HTTP client',
  'packages/desktop/src/main/fs-protocol.ts': 'net.fetch of a file:// URL for the mstudio-file protocol',
  'packages/desktop/src/main/games/game-electron.ts': 'net.fetch of a file:// URL for the game protocol',
  'apps/gamer/main/index.ts': 'file:// protocol handler, and the app composer injecting `net.fetch` (follow-up: bind to guardedFetch)',
  'apps/gamer/main/game-electron.ts': 'net.fetch of a file:// URL for the game protocol',
  'apps/mind/main/index.ts': 'net.fetch of a file:// URL for the capture protocol',
  'apps/media/main/index.ts': 'file:// protocol handler, and the app composer injecting `net.fetch` (follow-up: bind to guardedFetch)',
  'packages/modules/creator/main/context.ts': 'app composer default (follow-up: bind to guardedFetch)',
  'packages/features/monitor/main/system-health.ts': 'GET to the user’s own local Ollama /api/version',
  'packages/features/models/main/client.ts': 'the user’s own local Ollama server (loopback)',
  'packages/features/forge/main/http.ts': 'forge providers on user-chosen hosts (github, gitlab, self-hosted); follow-up: register per provider',
  'packages/features/browser/main/browser-site-safety.ts': 'feed fetch injected into feed-service; follow-up: bind to guardedFetch',
  'packages/features/media-map/main': 'tile sources and Overpass share one injected fetch; follow-up: register every tile host, then bind',
  'packages/desktop/src/main/ipc/media-image-handlers.ts': 'provider fetch injected into media-images; follow-up: bind to guardedFetch (local Ollama is loopback)',
  'packages/desktop/src/main/ipc/media-map-handlers.ts': 'tile and geocode fetch injected into media-map; follow-up: register tile hosts, then bind',
  'packages/desktop/src/main/ipc/release-notes-handlers.ts': 'GitHub release notes for the update dialog; follow-up: register and gate',
  'packages/runtime/src/vault/breach/hibp-check.ts': 'user-triggered Pwned Passwords check, api.pwnedpasswords.com is registered; follow-up: bind',
  'packages/features/companion/main/stt/openai-whisper.ts': 'user-triggered transcription to api.openai.com with the user’s key; follow-up: register and bind',
  'packages/features/media-audio/main/music/gm-sample-cache.ts': 'one-time General MIDI sample download the user starts; follow-up: register the host and bind',
  'packages/features/media-model/main/model/sf3d/installer.ts': 'model download the user starts; follow-up: register the host and bind',
  'apps/launcher/src/main': 'the launcher is off the graph and cannot import the runtime; follow-up: launcher switches (Theme A, second slice)',
};

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|spec)\./.test(name) && !name.endsWith('.d.ts')) yield p;
  }
}

/** Line numbers holding a raw request call or hand-off. Comments are skipped. */
function findRawRequests(source: string): number[] {
  const hits: number[] = [];
  source.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\bfunction\s+fetch\b/.test(line)) return;
    if (REQUEST_CALL.test(line) || REQUEST_VALUE.test(line)) hits.push(i + 1);
  });
  return hits;
}

const allowed = (rel: string): boolean => Object.keys(UNMIGRATED).some((a) => rel === a || rel.startsWith(`${a}/`));

describe('the egress scan', () => {
  it('flags a raw request in main-side code', () => {
    expect(findRawRequests("const r = await fetch('https://example.com');")).toEqual([1]);
    expect(findRawRequests('const r = await net.fetch(url);')).toEqual([1]);
    expect(findRawRequests("https.get('https://example.com', cb);")).toEqual([1]);
    expect(findRawRequests('const impl = opts.fetchImpl ?? fetch);')).toEqual([1]);
    expect(findRawRequests("await guardedFetch('app', url);")).toEqual([]);
    expect(findRawRequests('await deps.fetch(url);')).toEqual([]);
    expect(findRawRequests('// fetch(url) is not allowed')).toEqual([]);
  });

  it('finds no main-side request outside guardedFetch except the documented ones', () => {
    const offenders: string[] = [];
    for (const top of ['packages', 'apps']) {
      for (const file of walk(join(ROOT, top))) {
        const rel = relative(ROOT, file);
        if (!MAIN_SIDE.test(rel) || allowed(rel)) continue;
        for (const line of findRawRequests(readFileSync(file, 'utf8'))) offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps no stale allowlist entry', () => {
    const stale: string[] = [];
    for (const rel of Object.keys(UNMIGRATED)) {
      if (rel.endsWith('guarded-fetch.ts')) continue;
      let used = false;
      try {
        const st = statSync(join(ROOT, rel));
        const paths = st.isDirectory() ? [...walk(join(ROOT, rel))] : [join(ROOT, rel)];
        used = paths.some((p) => findRawRequests(readFileSync(p, 'utf8')).length > 0);
      } catch {
        used = false;
      }
      if (!used) stale.push(rel);
    }
    expect(stale).toEqual([]);
  });
});

describe('the registry', () => {
  it('validates every entry, and an automatic one names its switch', () => {
    for (const entry of EGRESS_ENTRIES) expect(EgressHostSchema.safeParse(entry).success, entry.host).toBe(true);
    expect(EgressHostSchema.safeParse({ host: 'x.test', owner: 'a', sends: 's', trigger: 'automatic' }).success).toBe(false);
  });

  it('keeps hosts unique per owner and lists every concrete host in EGRESS_HOSTS', () => {
    const keys = EGRESS_ENTRIES.map((e) => `${e.owner}/${e.host}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of EGRESS_ENTRIES.filter((x) => x.host !== '*')) expect(EGRESS_HOSTS[e.host]).toBe(e);
  });

  it('derives the renderer connect-src from the registry', () => {
    const origins = rendererConnectOrigins();
    expect(origins).toEqual(expect.arrayContaining(['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com', 'https://ipwho.is']));
    expect(origins.sort()).toEqual(EGRESS_ENTRIES.filter((e) => e.renderer).map((e) => `https://${e.host}`).sort());
  });

  it('matches wildcard suffixes and never lets `*` match another owner', () => {
    expect(findEgressEntry('https://api.osv.dev/v1/query')?.owner).toBe('guard');
    expect(findEgressEntry('https://example.com')).toBeUndefined();
  });
});

describe('guardedFetch', () => {
  const ok = () => Promise.resolve(new Response('ok'));

  it('refuses an unregistered host with a typed error', async () => {
    const guarded = createGuardedFetch({ transport: ok });
    await expect(guarded('guard', 'https://example.com/x')).rejects.toBeInstanceOf(EgressUnregisteredError);
  });

  it('passes a registered host and calls the transport', async () => {
    const calls: string[] = [];
    const guarded = createGuardedFetch({ transport: (u) => (calls.push(String(u)), ok()) });
    await guarded('guard', 'https://api.osv.dev/v1/querybatch');
    expect(calls).toEqual(['https://api.osv.dev/v1/querybatch']);
  });

  it('refuses a host whose switch is off, and every automatic host under the master switch', async () => {
    const calls: string[] = [];
    const transport = (u: string | Request) => (calls.push(String(u)), ok());
    const off = createGuardedFetch({ transport, getSettings: () => ({ switches: { 'guard-feeds': false } }) });
    await expect(off('guard', 'https://api.osv.dev/v1/querybatch')).rejects.toBeInstanceOf(EgressBlockedError);
    const master = createGuardedFetch({ transport, getSettings: () => ({ allAutomaticOff: true }) });
    for (const entry of EGRESS_ENTRIES.filter((e) => e.trigger === 'automatic')) {
      const url = entry.host === '*' ? 'https://feeds.example.org/rss' : `https://${entry.host}/`;
      await expect(master(entry.owner, url), `${entry.owner}/${entry.host}`).rejects.toBeInstanceOf(EgressBlockedError);
    }
    expect(calls).toEqual([]);
  });

  it('lets a user-initiated entry through under the master switch', async () => {
    const guarded = createGuardedFetch({ transport: ok, getSettings: () => ({ allAutomaticOff: true }) });
    await expect(guarded('models', 'https://ollama.com/search?q=x')).resolves.toBeInstanceOf(Response);
  });

  it('lets an owner with a `*` entry reach any URL, and no one else', async () => {
    const guarded = createGuardedFetch({ transport: ok });
    await expect(guarded('api-client', 'http://192.168.1.5:8080/x')).resolves.toBeInstanceOf(Response);
    await expect(guarded('guard', 'http://192.168.1.5:8080/x')).rejects.toBeInstanceOf(EgressUnregisteredError);
  });

  it('defaults: on, except the switches that always shipped off', () => {
    expect(privacySwitchOn(undefined, 'markets')).toBe(true);
    expect(privacySwitchOn(undefined, 'locate-by-ip')).toBe(false);
    expect(privacySwitchOn({ allAutomaticOff: true, switches: { markets: true } }, 'markets')).toBe(false);
  });

  it('fails closed on a switchable host until settings have been pushed', async () => {
    let ready = false;
    const guarded = createGuardedFetch({ transport: ok, ready: () => ready });
    await expect(guarded('guard', 'https://api.osv.dev/v1/querybatch')).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(guarded('models', 'https://ollama.com/search')).resolves.toBeInstanceOf(Response);
    ready = true;
    await expect(guarded('guard', 'https://api.osv.dev/v1/querybatch')).resolves.toBeInstanceOf(Response);
  });

  it('judges a user-composed request to a switched host by the owner’s `*` entry, not that host’s switch', async () => {
    const guarded = createGuardedFetch({ transport: ok, getSettings: () => ({ allAutomaticOff: true }) });
    await expect(guarded('api-client', 'https://api.coingecko.com/api/v3/ping')).resolves.toBeInstanceOf(Response);
  });

  it('passes a Request through with its method, headers and body', async () => {
    const seen: unknown[] = [];
    const guarded = createGuardedFetch({ transport: (input) => (seen.push(input), ok()) });
    const request = new Request('https://example.com/x', { method: 'POST', body: 'b' });
    await guarded('api-client', request);
    expect(seen[0]).toBe(request);
  });
});

describe('guardedFetch redirects', () => {
  type Call = { url: string; init: RequestInit | undefined };
  const redirect = (status: number, location: string) => new Response(null, { status, headers: { location } });
  /** A transport that plays a script of responses and records what it was called with. */
  const scripted = (responses: Response[]) => {
    const calls: Call[] = [];
    const transport = (input: string | Request, init?: RequestInit) => {
      calls.push({ url: typeof input === 'string' ? input : input.url, init });
      return Promise.resolve(responses.shift() ?? new Response('end'));
    };
    return { calls, transport };
  };

  it('follows an allowed hop, resolving a relative Location, and returns the final response', async () => {
    const { calls, transport } = scripted([redirect(302, '/v2/other'), new Response('done')]);
    const res = await createGuardedFetch({ transport })('guard', 'https://api.osv.dev/v1/x');
    expect(await res.text()).toBe('done');
    expect(calls.map((c) => c.url)).toEqual(['https://api.osv.dev/v1/x', 'https://api.osv.dev/v2/other']);
    expect(calls.every((c) => c.init?.redirect === 'manual')).toBe(true);
  });

  it('refuses a hop to an unregistered host', async () => {
    const { calls, transport } = scripted([redirect(302, 'https://evil.example.com/x')]);
    await expect(createGuardedFetch({ transport })('guard', 'https://api.osv.dev/v1/x')).rejects.toBeInstanceOf(EgressUnregisteredError);
    expect(calls).toHaveLength(1);
  });

  it('refuses a hop onto a host whose switch is off', async () => {
    const { calls, transport } = scripted([redirect(302, 'https://data-api.binance.vision/x')]);
    // The first check sees the switch on; by the hop the user has turned it off.
    let reads = 0;
    const guarded = createGuardedFetch({ transport, getSettings: () => ({ switches: { markets: reads++ === 0 } }) });
    await expect(guarded('finance', 'https://api.coingecko.com/x')).rejects.toBeInstanceOf(EgressBlockedError);
    expect(calls).toHaveLength(1);
  });

  it('stops after five redirects with a clear error', async () => {
    const { calls, transport } = scripted(Array.from({ length: 10 }, () => redirect(302, '/loop')));
    await expect(createGuardedFetch({ transport })('guard', 'https://api.osv.dev/start')).rejects.toBeInstanceOf(EgressRedirectError);
    expect(calls).toHaveLength(6);
  });

  it('turns a 303 into a body-less GET', async () => {
    const { calls, transport } = scripted([redirect(303, '/done'), new Response('ok')]);
    await createGuardedFetch({ transport })('guard', 'https://api.osv.dev/v1/x', {
      method: 'POST',
      body: 'payload',
      headers: { 'content-type': 'text/plain' },
    });
    expect(calls[0]!.init).toMatchObject({ method: 'POST', body: 'payload' });
    expect(calls[1]!.init?.method).toBe('GET');
    expect(calls[1]!.init?.body).toBeUndefined();
    expect(new Headers(calls[1]!.init?.headers).has('content-type')).toBe(false);
  });

  it('keeps method and body across a 307', async () => {
    const { calls, transport } = scripted([redirect(307, '/again'), new Response('ok')]);
    await createGuardedFetch({ transport })('guard', 'https://api.osv.dev/v1/x', { method: 'POST', body: 'payload' });
    expect(calls[1]!.init).toMatchObject({ method: 'POST', body: 'payload' });
  });

  it('refuses to resend a streamed body on a 307', async () => {
    const { transport } = scripted([redirect(307, '/again')]);
    const body = new ReadableStream({ start: (c) => c.close() });
    await expect(
      createGuardedFetch({ transport })('guard', 'https://api.osv.dev/v1/x', { method: 'POST', body, duplex: 'half' } as RequestInit),
    ).rejects.toBeInstanceOf(EgressRedirectError);
  });

  it('drops credentials on a cross-origin hop and keeps them on a same-origin one', async () => {
    // Both hosts belong to the `finance` owner.
    const creds = { authorization: 'Bearer t', cookie: 'a=b', 'proxy-authorization': 'x', 'x-keep': '1' };
    const cross = scripted([redirect(302, 'https://data-api.binance.vision/x'), new Response('ok')]);
    await createGuardedFetch({ transport: cross.transport })('finance', 'https://api.coingecko.com/x', { headers: creds });
    expect([...new Headers(cross.calls[1]!.init?.headers).keys()]).toEqual([]);

    const same = scripted([redirect(302, '/y'), new Response('ok')]);
    await createGuardedFetch({ transport: same.transport })('finance', 'https://api.coingecko.com/x', { headers: creds });
    expect(new Headers(same.calls[1]!.init?.headers).get('authorization')).toBe('Bearer t');
  });

  it('drops a custom secret header cross-origin, keeps it same-origin, keeps safelisted ones', async () => {
    const headers = { 'x-api-key': 'k', accept: 'application/json', 'user-agent': 'ua', 'accept-language': 'en' };
    const cross = scripted([redirect(302, 'https://other.example.org/x'), new Response('ok')]);
    await createGuardedFetch({ transport: cross.transport })('api-client', 'https://a.example.com/x', { headers });
    expect([...new Headers(cross.calls[1]!.init?.headers).keys()].sort()).toEqual(['accept', 'accept-language', 'user-agent']);

    const same = scripted([redirect(302, '/y'), new Response('ok')]);
    await createGuardedFetch({ transport: same.transport })('api-client', 'https://a.example.com/x', { headers });
    expect(new Headers(same.calls[1]!.init?.headers).get('x-api-key')).toBe('k');
  });

  it('keeps content-type cross-origin on a 307 but drops it on a 303', async () => {
    const init = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-api-key': 'k' } };
    const keep = scripted([redirect(307, 'https://other.example.org/x'), new Response('ok')]);
    await createGuardedFetch({ transport: keep.transport })('api-client', 'https://a.example.com/x', init);
    expect([...new Headers(keep.calls[1]!.init?.headers).keys()]).toEqual(['content-type']);

    const drop = scripted([redirect(303, 'https://other.example.org/x'), new Response('ok')]);
    await createGuardedFetch({ transport: drop.transport })('api-client', 'https://a.example.com/x', init);
    expect([...new Headers(drop.calls[1]!.init?.headers).keys()]).toEqual([]);
  });

  it('refuses an https to http downgrade and allows an http to https upgrade', async () => {
    const down = scripted([redirect(302, 'http://a.example.com/x')]);
    await expect(createGuardedFetch({ transport: down.transport })('api-client', 'https://a.example.com/x')).rejects.toBeInstanceOf(EgressRedirectError);
    expect(down.calls).toHaveLength(1);

    const up = scripted([redirect(302, 'https://a.example.com/x'), new Response('ok')]);
    const res = await createGuardedFetch({ transport: up.transport })('api-client', 'http://a.example.com/x');
    expect(await res.text()).toBe('ok');
  });

  it('passes a caller-set manual or error redirect through untouched', async () => {
    for (const mode of ['manual', 'error'] as const) {
      const { calls, transport } = scripted([redirect(302, 'https://evil.example.com/x')]);
      const res = await createGuardedFetch({ transport })('guard', 'https://api.osv.dev/v1/x', { redirect: mode });
      expect(res.status).toBe(302);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.init).toEqual({ redirect: mode });
    }
  });

  it('takes method and headers from a Request input, and refuses to resend its body on a 307', async () => {
    const get = scripted([redirect(307, '/again'), new Response('ok')]);
    await createGuardedFetch({ transport: get.transport })('guard', new Request('https://api.osv.dev/v1/x', { headers: { 'x-a': '1' } }));
    expect(get.calls[0]!.url).toBe('https://api.osv.dev/v1/x');
    expect(get.calls[1]!.url).toBe('https://api.osv.dev/again');
    expect(get.calls[1]!.init?.method).toBe('GET');
    expect(new Headers(get.calls[1]!.init?.headers).get('x-a')).toBe('1');

    const post = scripted([redirect(307, '/again')]);
    const req = new Request('https://api.osv.dev/v1/x', { method: 'POST', body: 'hi' });
    await expect(createGuardedFetch({ transport: post.transport })('guard', req)).rejects.toBeInstanceOf(EgressRedirectError);
  });
});
