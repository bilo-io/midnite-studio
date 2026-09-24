import type { IncomingMessage, ServerResponse } from 'node:http';

import { WORKFLOW_DELAY_MAX_MS } from '@midnite/studio-shared';

/**
 * The `/demo/*` scripted route group (Phase 97 Theme M) — deterministic,
 * query-driven behaviours a workflow template's `http` node can point at,
 * beside the generic `/:collection[/:id]` CRUD store {@link ../routes.ts}
 * already serves. Split into its own module for the same reason `routes.ts`
 * is split from `server.ts`: a request/response mapping with no socket in the
 * way is testable as a near-pure function.
 *
 * **Every route here is deterministic given its inputs** — no randomness
 * without an explicit `?seed=`, no state that isn't a `?key=`-scoped counter —
 * so a template built against one runs the same way on every replay. The two
 * routes that count (`fail-n`, `verify`) hold that count in module state,
 * cleared by {@link resetScriptedRoutes}, which `store.ts`'s `resetDemoStore`
 * calls so a demo-API stop clears both halves of the server's memory together.
 */

const failCounts = new Map<string, number>();
const verifyCounts = new Map<string, number>();
const flakyCallCounts = new Map<string, number>();

/** Counters reset with the store on stop — called from `store.ts`'s `resetDemoStore`. */
export function resetScriptedRoutes(): void {
  failCounts.clear();
  verifyCounts.clear();
  flakyCallCounts.clear();
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBodyText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** `/demo/echo` reflects whatever it's sent — JSON if it parses, the raw text otherwise. */
async function readEchoBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readBodyText(req);
  if (raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * The cap `/demo/delay` actually applies — pure, exported, and unit-tested
 * directly rather than through a real wait: a workflow's own `WORKFLOW_DELAY_MAX_MS`
 * is a minute, and a test asserting the cap has no business waiting one.
 */
export function capDelayMs(requestedMs: number): number {
  if (!Number.isFinite(requestedMs) || requestedMs < 0) return 0;
  return Math.min(Math.trunc(requestedMs), WORKFLOW_DELAY_MAX_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * mulberry32 — a tiny seedable PRNG. Not cryptographic, not meant to be:
 * `/demo/flaky` only needs "the same seed always produces the same
 * pass/fail sequence," which any decent 32-bit generator gives for free.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: turns an arbitrary `?seed=` string into a 32-bit PRNG seed. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const RISK_BANDS = ['low', 'medium', 'high'] as const;

/** `?risk=` as a 0..1 number, or already one of `low`/`medium`/`high` verbatim. */
function classifyRisk(raw: string | null): (typeof RISK_BANDS)[number] {
  if (raw === null) return 'low';
  const normalized = raw.trim().toLowerCase();
  if ((RISK_BANDS as readonly string[]).includes(normalized)) return normalized as (typeof RISK_BANDS)[number];
  const score = Number.parseFloat(normalized);
  if (!Number.isFinite(score)) return 'low';
  if (score < 1 / 3) return 'low';
  if (score < 2 / 3) return 'medium';
  return 'high';
}

/** Canned, deterministic "findings" for a research lane — no network, no randomness. */
function researchFindings(lane: string): string[] {
  return [`${lane}: finding one`, `${lane}: finding two`, `${lane}: finding three`];
}

/**
 * Handles one `/demo/<route>` request. `segments` is everything AFTER the
 * leading `demo` segment (so `/demo/research/sales` hands over `['research',
 * 'sales']`). Returns `false` for an unrecognised route, which `routes.ts`
 * turns into its own 404 — this module never guesses at a fallback.
 */
export async function handleScriptedDemoRoute(
  req: IncomingMessage,
  res: ServerResponse,
  segments: readonly string[],
  url: URL,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const [route, ...rest] = segments;

  switch (route) {
    case 'echo': {
      const body = method === 'GET' || method === 'HEAD' ? null : await readEchoBody(req);
      const query: Record<string, string> = {};
      for (const [key, value] of url.searchParams) query[key] = value;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }
      send(res, 200, { method, query, headers, body });
      return true;
    }

    case 'delay': {
      const requested = Number.parseInt(url.searchParams.get('ms') ?? '0', 10);
      const delayedMs = capDelayMs(requested);
      await sleep(delayedMs);
      send(res, 200, { requestedMs: Number.isFinite(requested) ? requested : 0, delayedMs });
      return true;
    }

    case 'fail-n': {
      const key = url.searchParams.get('key') ?? 'default';
      const n = Math.max(0, Number.parseInt(url.searchParams.get('n') ?? '0', 10) || 0);
      const attempt = (failCounts.get(key) ?? 0) + 1;
      failCounts.set(key, attempt);
      if (attempt <= n) {
        send(res, 500, { error: `Scripted failure ${attempt} of ${n} for key "${key}".`, attempt, n });
      } else {
        send(res, 200, { ok: true, attempt, n });
      }
      return true;
    }

    case 'flaky': {
      const rate = Math.min(1, Math.max(0, Number.parseFloat(url.searchParams.get('rate') ?? '0.5') || 0));
      const seed = url.searchParams.get('seed') ?? 'demo';
      const callIndex = (flakyCallCounts.get(seed) ?? 0) + 1;
      flakyCallCounts.set(seed, callIndex);
      const roll = mulberry32(hashSeed(seed) + callIndex)();
      const failed = roll < rate;
      send(res, failed ? 500 : 200, { ok: !failed, roll, rate, seed, attempt: callIndex });
      return true;
    }

    case 'classify': {
      const band = classifyRisk(url.searchParams.get('risk'));
      send(res, 200, { risk: band });
      return true;
    }

    case 'research': {
      const lane = rest[0];
      if (lane === undefined || lane === '') {
        send(res, 400, { error: 'Usage: /demo/research/:lane' });
        return true;
      }
      send(res, 200, { lane, findings: researchFindings(lane) });
      return true;
    }

    case 'verify': {
      const key = url.searchParams.get('key') ?? 'default';
      const passAfter = Math.max(1, Number.parseInt(url.searchParams.get('passAfter') ?? '1', 10) || 1);
      const attempt = (verifyCounts.get(key) ?? 0) + 1;
      verifyCounts.set(key, attempt);
      send(res, 200, { pass: attempt >= passAfter, attempt, passAfter });
      return true;
    }

    default:
      return false;
  }
}
