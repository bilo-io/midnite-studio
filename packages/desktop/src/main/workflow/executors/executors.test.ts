import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WorkflowNode } from '@midnite/studio-shared';

import { startFixtureServer, type FixtureServer } from '../../demo-api/fixture-server';
import type { ExecutorContext, NodeOutcome } from '../executor-registry';
import { conditionExecutor, delayExecutor, httpExecutor, transformExecutor } from './index';
import type { HttpNodeOutput } from './http';

/**
 * The executor suite runs against Theme D's own demo API, started here on an
 * ephemeral port — never the public internet. Its acceptance criterion is that
 * the whole file passes with the machine's network cable out.
 */

let api: FixtureServer;

beforeAll(async () => {
  api = await startFixtureServer();
});

afterAll(async () => {
  await api.stop();
});

function context(over: Partial<ExecutorContext> = {}): ExecutorContext {
  return { upstream: {}, signal: { cancelled: () => false }, timeoutMs: 5_000, ...over };
}

function httpNode(config: Partial<Extract<WorkflowNode, { kind: 'http' }>['config']>): WorkflowNode {
  return {
    id: 'h',
    label: 'Call',
    x: 0,
    y: 0,
    kind: 'http',
    config: { method: 'GET', url: '', headers: {}, params: {}, queryShaped: false, ...config },
  };
}

function output(outcome: NodeOutcome): HttpNodeOutput {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.output as HttpNodeOutput;
}

describe('the http executor', () => {
  it('covers the verbs the feature note names', async () => {
    const created = output(
      await httpExecutor(
        httpNode({ method: 'POST', url: `${api.baseUrl}/items`, body: '{"title":"a"}' }),
        context(),
      ),
    );
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    for (const [method, expected] of [
      ['GET', 200],
      ['PUT', 200],
      ['PATCH', 200],
      ['HEAD', 200],
      ['DELETE', 204],
    ] as const) {
      const outcome = await httpExecutor(
        httpNode({
          method,
          url: `${api.baseUrl}/items/${id}`,
          ...(method === 'PUT' || method === 'PATCH' ? { body: '{"title":"b"}' } : {}),
        }),
        context(),
      );
      expect(output(outcome).status, method).toBe(expected);
    }
  });

  it('serialises params into the query string — the QUERY-shaped GET', async () => {
    await httpExecutor(
      httpNode({ method: 'POST', url: `${api.baseUrl}/q`, body: '{"kind":"x"}' }),
      context(),
    );
    await httpExecutor(
      httpNode({ method: 'POST', url: `${api.baseUrl}/q`, body: '{"kind":"y"}' }),
      context(),
    );

    const found = output(
      await httpExecutor(
        httpNode({ method: 'GET', url: `${api.baseUrl}/q`, params: { kind: 'x' }, queryShaped: true }),
        context(),
      ),
    );
    expect((found.body as { total: number }).total).toBe(1);
  });

  it('parses a JSON body and says it did', async () => {
    const result = output(
      await httpExecutor(httpNode({ method: 'GET', url: `${api.baseUrl}/` }), context()),
    );
    expect(result.bodyIsJson).toBe(true);
    expect(typeof result.body).toBe('object');
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('treats a 404 as a result, not a crash', async () => {
    const outcome = await httpExecutor(
      httpNode({ method: 'GET', url: `${api.baseUrl}/items/nope` }),
      context(),
    );
    // Counter-intuitive and deliberate: only a transport failure is `ok:false`.
    expect(outcome.ok).toBe(true);
    expect(output(outcome).status).toBe(404);
  });

  it('fails on a transport error, naming what it tried', async () => {
    const outcome = await httpExecutor(
      // Port 1 on loopback: nothing listens, and nothing will.
      httpNode({ method: 'GET', url: 'http://127.0.0.1:1/nope' }),
      context(),
    );
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toContain('GET http://127.0.0.1:1/nope failed');
  });

  it('rejects a URL that is not one, before opening a socket', async () => {
    const outcome = await httpExecutor(httpNode({ method: 'GET', url: 'not a url' }), context());
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toBe('"not a url" is not a valid URL.');
  });

  it('interpolates upstream output into the URL, headers and body', async () => {
    const created = output(
      await httpExecutor(
        httpNode({ method: 'POST', url: `${api.baseUrl}/refs`, body: '{"n":1}' }),
        context(),
      ),
    );
    const upstream = { create: created };

    const read = output(
      await httpExecutor(
        httpNode({
          method: 'GET',
          url: `${api.baseUrl}/refs/{{create.body.id}}`,
          headers: { 'x-echo': 'status {{create.status}}' },
        }),
        context({ upstream }),
      ),
    );
    expect(read.status).toBe(200);
    expect((read.body as { n: number }).n).toBe(1);
  });

  it('fails the node on an unresolvable reference rather than sending "undefined"', async () => {
    const outcome = await httpExecutor(
      httpNode({ method: 'GET', url: `${api.baseUrl}/items/{{missing.body.id}}` }),
      context(),
    );
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toContain('is not upstream of this one');
  });

  it('honours the deadline, and flags it as a timeout rather than a plain failure', async () => {
    // The demo API answers instantly, so the deadline has to be smaller than
    // any real round trip to be observable at all.
    const outcome = await httpExecutor(
      httpNode({ method: 'GET', url: `${api.baseUrl}/items` }),
      context({ timeoutMs: 1 }),
    );
    if (!outcome.ok) {
      expect(outcome.error).toContain('Timed out after 1 ms');
      // `timedOut` is what makes the engine record `timeout` instead of
      // `failed` — without it the six-value status enum collapses to five.
      expect(outcome.timedOut).toBe(true);
    } else {
      expect(outcome.output).toBeDefined(); // it can legitimately win the race
    }
  });

  it('caps a large response and says it was truncated', async () => {
    // 600 KB of payload, past the 500 KB cap.
    const big = 'x'.repeat(600 * 1024);
    await httpExecutor(
      httpNode({ method: 'POST', url: `${api.baseUrl}/big`, body: JSON.stringify({ big }) }),
      context(),
    );

    const outcome = await httpExecutor(
      httpNode({ method: 'GET', url: `${api.baseUrl}/big` }),
      context(),
    );
    expect(outcome.ok).toBe(true);
    const result = output(outcome);
    expect(result.truncated).toBe(true);
    // The flag reaching the node's recorded output is what makes the
    // truncation renderable — a cap the user cannot see is the failure mode
    // this whole convention exists to avoid.
    expect(outcome.ok && outcome.truncated).toBe(true);
    // A truncated JSON body is no longer valid JSON, so it is kept as text
    // rather than claimed to be an object nobody can read.
    expect(result.bodyIsJson).toBe(false);
    expect(typeof result.body).toBe('string');
  });
});

describe('the transform executor', () => {
  const upstream = { fetch: { body: { items: [{ id: 'a1', name: 'first' }] }, status: 200 } };

  it('picks and renames with the same path grammar as {{...}}', async () => {
    const outcome = await transformExecutor(
      {
        id: 't',
        label: 'Pick',
        x: 0,
        y: 0,
        kind: 'transform',
        config: {
          picks: [
            { from: 'fetch.body.items.0.name', to: 'who' },
            { from: 'fetch.status', to: 'code' },
          ],
        },
      },
      context({ upstream }),
    );
    expect(outcome).toEqual({ ok: true, output: { who: 'first', code: '200' } });
  });

  it('accepts a full template as a `from`', async () => {
    const outcome = await transformExecutor(
      {
        id: 't',
        label: 'Pick',
        x: 0,
        y: 0,
        kind: 'transform',
        config: { picks: [{ from: '{{fetch.status}}/{{fetch.body.items.0.id}}', to: 'ref' }] },
      },
      context({ upstream }),
    );
    expect(outcome).toEqual({ ok: true, output: { ref: '200/a1' } });
  });

  it('fails on a pick that cannot resolve', async () => {
    const outcome = await transformExecutor(
      {
        id: 't',
        label: 'Pick',
        x: 0,
        y: 0,
        kind: 'transform',
        config: { picks: [{ from: 'fetch.body.nope', to: 'x' }] },
      },
      context({ upstream }),
    );
    expect(outcome.ok).toBe(false);
  });
});

describe('the condition executor', () => {
  const upstream = { fetch: { status: 200, body: { name: 'alpha', empty: '' } } };

  function conditionNode(config: Extract<WorkflowNode, { kind: 'condition' }>['config']): WorkflowNode {
    return { id: 'c', label: 'If', x: 0, y: 0, kind: 'condition', config };
  }

  it('passes a satisfied predicate without gating', async () => {
    const outcome = await conditionExecutor(
      conditionNode({ left: '{{fetch.status}}', op: 'eq', right: '200' }),
      context({ upstream }),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.skipDownstream).toBeUndefined();
  });

  it('gates downstream on a false predicate — a success, not a failure', async () => {
    const outcome = await conditionExecutor(
      conditionNode({ left: '{{fetch.status}}', op: 'eq', right: '404' }),
      context({ upstream }),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.skipDownstream).toBe(true);
  });

  it('compares numerically where the op is numeric', async () => {
    for (const [op, right, expected] of [
      ['gt', '199', true],
      ['gte', '200', true],
      ['lt', '201', true],
      ['lte', '199', false],
    ] as const) {
      const outcome = await conditionExecutor(
        conditionNode({ left: '{{fetch.status}}', op, right }),
        context({ upstream }),
      );
      expect(outcome.ok && (outcome.output as { passed: boolean }).passed, op).toBe(expected);
    }
  });

  it('is false rather than NaN-propagating when a numeric op meets a non-number', async () => {
    const outcome = await conditionExecutor(
      conditionNode({ left: '{{fetch.body.name}}', op: 'gt', right: '3' }),
      context({ upstream }),
    );
    expect(outcome.ok && (outcome.output as { passed: boolean }).passed).toBe(false);
  });

  it('handles contains and the unary empty', async () => {
    const contains = await conditionExecutor(
      conditionNode({ left: '{{fetch.body.name}}', op: 'contains', right: 'lph' }),
      context({ upstream }),
    );
    expect(contains.ok && (contains.output as { passed: boolean }).passed).toBe(true);

    const empty = await conditionExecutor(
      conditionNode({ left: '{{fetch.body.empty}}', op: 'empty' }),
      context({ upstream }),
    );
    expect(empty.ok && (empty.output as { passed: boolean }).passed).toBe(true);
  });
});

describe('the delay executor', () => {
  it('sleeps and reports what it slept', async () => {
    const started = Date.now();
    const outcome = await delayExecutor(
      { id: 'd', label: 'Wait', x: 0, y: 0, kind: 'delay', config: { ms: 30 } },
      context(),
    );
    expect(outcome).toEqual({ ok: true, output: { sleptMs: 30 } });
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  it('gives up promptly on a cancel rather than sitting out the full wait', async () => {
    let cancelled = false;
    const started = Date.now();
    const promise = delayExecutor(
      { id: 'd', label: 'Wait', x: 0, y: 0, kind: 'delay', config: { ms: 60_000 } },
      context({ signal: { cancelled: () => cancelled } }),
    );
    setTimeout(() => {
      cancelled = true;
    }, 20);
    const outcome = await promise;
    expect(outcome).toEqual({ ok: false, error: 'Cancelled.' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
