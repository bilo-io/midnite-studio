import { describe, expect, it } from 'vitest';

import type { WorkflowNode } from '@midnite/studio-shared';

import type { ExecutorContext } from '../executor-registry';
import { coalesceExecutor, jsonExtractExecutor, setFieldsExecutor } from './data';

function context(upstream: Record<string, unknown> = {}): ExecutorContext {
  return {
    upstream,
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w',
    runId: 'r',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
  };
}

describe('the set-fields executor', () => {
  it('interpolates each value and best-effort parses it as JSON', async () => {
    const node: WorkflowNode = {
      id: 's',
      label: 'Set',
      x: 0,
      y: 0,
      kind: 'set-fields',
      config: { fields: { count: '42', flag: 'true', greeting: 'Hi {{a.name}}', obj: '{"k":1}', copy: '{{a.list}}' } },
    };
    expect(await setFieldsExecutor(node, context({ a: { name: 'Ada', list: [1, 2] } }))).toEqual({
      ok: true,
      output: { count: 42, flag: true, greeting: 'Hi Ada', obj: { k: 1 }, copy: [1, 2] },
    });
  });

  it('fails on the first unresolved reference', async () => {
    const node: WorkflowNode = { id: 's', label: 'Set', x: 0, y: 0, kind: 'set-fields', config: { fields: { a: '{{nope.x}}' } } };
    expect((await setFieldsExecutor(node, context())).ok).toBe(false);
  });
});

describe('the json-extract executor', () => {
  function extract(config: Partial<Extract<WorkflowNode, { kind: 'json-extract' }>['config']>): WorkflowNode {
    return { id: 'j', label: 'Extract', x: 0, y: 0, kind: 'json-extract', config: { source: '', path: '', required: true, ...config } };
  }

  it('parses text and walks a dotted path with array indices', async () => {
    const upstream = { cmd: { stdout: '{"items":[{"id":"a1"},{"id":"b2"}]}' } };
    expect(await jsonExtractExecutor(extract({ source: '{{cmd.stdout}}', path: 'items.1.id' }), context(upstream))).toEqual({
      ok: true,
      output: { value: 'b2', found: true },
    });
  });

  it('returns the whole document for an empty path', async () => {
    const outcome = await jsonExtractExecutor(extract({ source: '[1,2]' }), context());
    expect(outcome).toEqual({ ok: true, output: { value: [1, 2], found: true } });
  });

  it('fails a missing required path, and yields null for an optional one', async () => {
    expect(await jsonExtractExecutor(extract({ source: '{"a":1}', path: 'b' }), context())).toEqual({
      ok: false,
      error: 'The JSON has no "b".',
    });
    expect(await jsonExtractExecutor(extract({ source: '{"a":1}', path: 'b', required: false }), context())).toEqual({
      ok: true,
      output: { value: null, found: false },
    });
  });

  it('never walks the prototype chain', async () => {
    const outcome = await jsonExtractExecutor(extract({ source: '{"a":{}}', path: 'a.constructor' }), context());
    expect(outcome.ok).toBe(false);
  });

  it('fails on text that is not JSON', async () => {
    expect(await jsonExtractExecutor(extract({ source: 'not json' }), context())).toEqual({
      ok: false,
      error: 'The source is not valid JSON.',
    });
  });
});

describe('the coalesce executor', () => {
  function coalesce(candidates: string[], fallback?: string): WorkflowNode {
    return {
      id: 'c',
      label: 'First',
      x: 0,
      y: 0,
      kind: 'coalesce',
      config: { candidates, ...(fallback === undefined ? {} : { fallback }) },
    };
  }

  it('skips a branch that never ran and an empty value, taking the first real one', async () => {
    // `quick` is absent from upstream — its branch was not taken.
    const upstream = { empty: { v: '' }, full: { v: 'audit done' } };
    expect(await coalesceExecutor(coalesce(['{{quick.v}}', '{{empty.v}}', '{{full.v}}']), context(upstream))).toEqual({
      ok: true,
      output: { value: 'audit done', index: 2 },
    });
  });

  it('uses the fallback when nothing resolves', async () => {
    expect(await coalesceExecutor(coalesce(['{{a.b}}'], 'none'), context())).toEqual({
      ok: true,
      output: { value: 'none', index: -1 },
    });
  });

  it('fails, listing why each candidate missed, when there is no fallback', async () => {
    const outcome = await coalesceExecutor(coalesce(['{{a.b}}', '']), context());
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatch(/^No candidate had a value \(#1: .*; #2 was empty\)\.$/);
  });
});
