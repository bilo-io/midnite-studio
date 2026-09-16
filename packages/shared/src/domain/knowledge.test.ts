// Layer: vitest — pure zod schema + helper round-trips, no browser capability needed.
import { describe, expect, it } from 'vitest';

import {
  KnowledgeGraphExistsSchema,
  KnowledgeGraphPayloadSchema,
  KnowledgeNodeDetailFailureSchema,
  KnowledgeResultOf,
  KnowledgeResultSchema,
  knowledgeAbsent,
  knowledgeError,
  knowledgeMalformed,
  knowledgeNotFound,
  knowledgeOk,
  knowledgeUnreadable,
} from './knowledge';

describe('KnowledgeResult helpers', () => {
  it('knowledgeOk with no value produces the bare-void success shape', () => {
    expect(knowledgeOk()).toEqual({ ok: true });
    expect(KnowledgeResultSchema.parse(knowledgeOk())).toEqual({ ok: true });
  });

  it('knowledgeOk with a value carries it under `value`', () => {
    const result = knowledgeOk({ foo: 1 });
    expect(result).toEqual({ ok: true, value: { foo: 1 } });
  });

  it('knowledgeAbsent carries no message — the common, un-graphified-repo case', () => {
    expect(knowledgeAbsent()).toEqual({ ok: false, kind: 'absent' });
  });

  it('knowledgeUnreadable and knowledgeMalformed both carry a message', () => {
    expect(knowledgeUnreadable('EACCES')).toEqual({
      ok: false,
      kind: 'unreadable',
      message: 'EACCES',
    });
    expect(knowledgeMalformed('not shaped like a graph')).toEqual({
      ok: false,
      kind: 'malformed',
      message: 'not shaped like a graph',
    });
  });

  it('knowledgeError is the catch-all failure arm', () => {
    expect(knowledgeError('boom')).toEqual({ ok: false, kind: 'error', message: 'boom' });
  });

  it('each failure kind round-trips through the discriminated union', () => {
    for (const failure of [
      knowledgeAbsent(),
      knowledgeUnreadable('x'),
      knowledgeMalformed('x'),
      knowledgeError('x'),
    ]) {
      expect(KnowledgeResultSchema.parse(failure)).toEqual(failure);
    }
  });
});

describe('KnowledgeResultOf', () => {
  it('validates a success value against the given schema', () => {
    const schema = KnowledgeResultOf(KnowledgeGraphPayloadSchema);
    const payload = {
      nodes: [{ id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' }],
      links: [{ source: 'a', target: 'a', relation: 'self', weight: 1 }],
      positions: { a: { x: 0, y: 0 } },
      builtAtCommit: 'deadbeef',
      cached: false,
      commitsBehind: 0,
    };
    expect(schema.parse({ ok: true, value: payload })).toEqual({ ok: true, value: payload });
  });

  it('still accepts every failure arm', () => {
    const schema = KnowledgeResultOf(KnowledgeGraphPayloadSchema);
    expect(schema.parse(knowledgeAbsent())).toEqual({ ok: false, kind: 'absent' });
  });
});

describe('KnowledgeGraphPayloadSchema.commitsBehind', () => {
  const base = {
    nodes: [],
    links: [],
    positions: {},
    builtAtCommit: 'deadbeef',
    cached: false,
  };

  it('accepts null — "could not be determined", never guessed as 0', () => {
    expect(KnowledgeGraphPayloadSchema.parse({ ...base, commitsBehind: null }).commitsBehind).toBe(
      null,
    );
  });

  it('accepts a nonnegative count', () => {
    expect(KnowledgeGraphPayloadSchema.parse({ ...base, commitsBehind: 3 }).commitsBehind).toBe(3);
  });

  it('rejects a negative count', () => {
    expect(() => KnowledgeGraphPayloadSchema.parse({ ...base, commitsBehind: -1 })).toThrow();
  });
});

describe('KnowledgeGraphExistsSchema', () => {
  it('is the whole answer knowledgeCheckGraph gives — a boolean, no envelope', () => {
    expect(KnowledgeGraphExistsSchema.parse({ exists: true })).toEqual({ exists: true });
    expect(KnowledgeGraphExistsSchema.parse({ exists: false })).toEqual({ exists: false });
  });
});

describe('KnowledgeNodeDetailFailureSchema', () => {
  it('adds a not-found arm the plain KnowledgeFailure has no use for', () => {
    expect(KnowledgeNodeDetailFailureSchema.parse(knowledgeNotFound())).toEqual({
      ok: false,
      kind: 'not-found',
    });
  });
});
