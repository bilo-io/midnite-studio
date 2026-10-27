import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EGRESS_ENTRIES, EGRESS_HOSTS, EgressHostSchema, findEgressEntry, privacySwitchOn, rendererConnectOrigins } from '@midnite/studio-shared';

import { EgressBlockedError, EgressUnregisteredError, createGuardedFetch } from './guarded-fetch';

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
  'apps/creator/main/index.ts': 'net.fetch of a file:// URL for the file protocol',
  'apps/gamer/main/index.ts': 'file:// protocol handler, and the app composer injecting `net.fetch` (follow-up: bind to guardedFetch)',
  'apps/gamer/main/game-electron.ts': 'net.fetch of a file:// URL for the game protocol',
  'apps/capture/main/index.ts': 'net.fetch of a file:// URL for the capture protocol',
  'apps/media/main/index.ts': 'file:// protocol handler, and the app composer injecting `net.fetch` (follow-up: bind to guardedFetch)',
  'apps/creator/main/context.ts': 'app composer default (follow-up: bind to guardedFetch)',
  'packages/features/monitor/main/system-health.ts': 'GET to the user’s own local Ollama /api/version',
  'packages/features/models/main/client.ts': 'the user’s own local Ollama server (loopback)',
  'packages/features/forge/main/http.ts': 'forge providers on user-chosen hosts (github, gitlab, self-hosted); follow-up: register per provider',
  'packages/features/browser/main/browser-site-safety.ts': 'feed fetch injected into feed-service; follow-up: bind to guardedFetch',
  'packages/features/media-map/main': 'tile sources and Overpass share one injected fetch; follow-up: register every tile host, then bind',
  'packages/desktop/src/main/ipc/media-image-handlers.ts': 'provider fetch injected into media-images; follow-up: bind to guardedFetch (local Ollama is loopback)',
  'packages/desktop/src/main/ipc/media-map-handlers.ts': 'tile and geocode fetch injected into media-map; follow-up: register tile hosts, then bind',
  'packages/desktop/src/main/ipc/release-notes-handlers.ts': 'GitHub release notes for the update dialog; follow-up: register and gate',
  'packages/runtime/src/vault/breach/hibp-check.ts': 'user-triggered Pwned Passwords check, api.pwnedpasswords.com is registered; follow-up: bind',
  'packages/desktop/src/main/companion/stt/openai-whisper.ts': 'user-triggered transcription to api.openai.com with the user’s key; follow-up: register and bind',
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
    const guarded = createGuardedFetch({ transport: (u) => (calls.push(u), ok()) });
    await guarded('guard', 'https://api.osv.dev/v1/querybatch');
    expect(calls).toEqual(['https://api.osv.dev/v1/querybatch']);
  });

  it('refuses a host whose switch is off, and every automatic host under the master switch', async () => {
    const calls: string[] = [];
    const transport = (u: string) => (calls.push(u), ok());
    const off = createGuardedFetch({ transport, getSettings: () => ({ switches: { 'guard-feeds': false } }) });
    await expect(off('guard', 'https://api.osv.dev/v1/querybatch')).rejects.toBeInstanceOf(EgressBlockedError);
    const master = createGuardedFetch({ transport, getSettings: () => ({ allAutomaticOff: true }) });
    for (const entry of EGRESS_ENTRIES.filter((e) => e.trigger === 'automatic' && e.host !== '*')) {
      await expect(master(entry.owner, `https://${entry.host}/`), entry.host).rejects.toBeInstanceOf(EgressBlockedError);
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
});
