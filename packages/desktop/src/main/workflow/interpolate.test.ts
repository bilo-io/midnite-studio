import { describe, expect, it } from 'vitest';

import { interpolate, interpolateRecord } from './interpolate';

const upstream = {
  fetch: {
    status: 200,
    body: { items: [{ id: 'a1', name: 'first' }, { id: 'a2' }], count: 2, note: null },
  },
  empty: {},
};

function value(template: string): string {
  const result = interpolate(template, upstream);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function error(template: string): string {
  const result = interpolate(template, upstream);
  if (result.ok) throw new Error(`expected a failure, got "${result.value}"`);
  return result.error;
}

describe('interpolate', () => {
  it('walks a dotted path', () => {
    expect(value('{{fetch.body.items.0.name}}')).toBe('first');
  });

  it('indexes an array with a numeric segment', () => {
    expect(value('id={{fetch.body.items.1.id}}')).toBe('id=a2');
  });

  it('substitutes a string as itself, so a quoted reference in a JSON body stays valid', () => {
    expect(value('{"name":"{{fetch.body.items.0.name}}"}')).toBe('{"name":"first"}');
  });

  it('JSON-stringifies anything that is not a string', () => {
    expect(value('{{fetch.status}}')).toBe('200');
    expect(value('{{fetch.body.items.1}}')).toBe('{"id":"a2"}');
    expect(value('{{fetch.body.note}}')).toBe('null');
  });

  it('resolves the whole node output with a bare node id', () => {
    expect(value('{{empty}}')).toBe('{}');
  });

  it('substitutes several references in one template', () => {
    expect(value('{{fetch.status}}/{{fetch.body.count}}')).toBe('200/2');
  });

  it('leaves text with no references untouched', () => {
    expect(value('http://127.0.0.1/items')).toBe('http://127.0.0.1/items');
  });

  it('treats {{{{ as a literal {{', () => {
    expect(value('{{{{fetch.status}}')).toBe('{{fetch.status}}');
    expect(value('{{{{}}')).toBe('{{}}');
  });

  it('fails on an unknown node rather than substituting nothing', () => {
    expect(error('{{nope.a}}')).toBe(
      'Cannot resolve {{nope.a}} — node "nope" is not upstream of this one.',
    );
  });

  it('fails on a missing field, naming the field', () => {
    expect(error('{{fetch.body.missing}}')).toBe(
      'Cannot resolve {{fetch.body.missing}} — node "fetch" has no field "body.missing".',
    );
  });

  it('fails on an out-of-range array index', () => {
    expect(error('{{fetch.body.items.9.id}}')).toContain('has no field "body.items.9.id"');
  });

  it('fails on an empty reference', () => {
    expect(error('{{}}')).toBe('Cannot resolve {{}} — a reference needs a node id.');
  });

  it('reports the first failure and does not half-substitute', () => {
    const result = interpolate('{{fetch.status}} {{nope.a}} {{fetch.body.count}}', upstream);
    expect(result.ok).toBe(false);
  });
});

describe('interpolateRecord', () => {
  it('interpolates every value', () => {
    const result = interpolateRecord({ 'x-status': '{{fetch.status}}', plain: 'v' }, upstream);
    expect(result).toEqual({ ok: true, value: { 'x-status': '200', plain: 'v' } });
  });

  it('fails on the first value that cannot resolve', () => {
    const result = interpolateRecord({ a: '{{fetch.status}}', b: '{{nope}}' }, upstream);
    expect(result.ok).toBe(false);
  });
});

describe('prototype keys', () => {
  // `in` walks the prototype chain, so `'constructor' in {}` is true for any
  // plain object literal — and `render`ing the `Object` function gave `''`,
  // the silent empty substitution this module exists to prevent, arriving
  // through the one door nobody thinks to check.
  it.each(['{{constructor}}', '{{toString}}', '{{fetch.constructor}}', '{{fetch.body.toString}}'])(
    'refuses to resolve %s',
    (template) => {
      const result = interpolate(template, upstream);
      expect(result.ok).toBe(false);
    },
  );

  it('still resolves an own property that shadows a prototype name', () => {
    const result = interpolate('{{a.constructor}}', { a: { constructor: 'mine' } });
    expect(result).toEqual({ ok: true, value: 'mine' });
  });

  it('fails rather than substituting empty for a value it cannot write', () => {
    const result = interpolate('{{a.fn}}', { a: { fn: () => 1 } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('cannot be written into a request');
  });
});
