import { describe, expect, it } from 'vitest';

import { normalizeCell, normalizeRow } from './normalize';

describe('normalizeCell', () => {
  it('encodes a bigint as a string so it survives JSON.stringify over IPC', () => {
    expect(normalizeCell(9_007_199_254_740_993n)).toBe('9007199254740993');
    expect(() => JSON.stringify({ n: normalizeCell(9_007_199_254_740_993n) })).not.toThrow();
  });

  it('encodes a Date as an ISO string', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    expect(normalizeCell(date)).toBe('2024-01-01T00:00:00.000Z');
  });

  it('encodes a Buffer as base64', () => {
    expect(normalizeCell(Buffer.from('hello'))).toBe('aGVsbG8=');
  });

  it('encodes a Uint8Array as base64, same as a Buffer', () => {
    expect(normalizeCell(new Uint8Array(Buffer.from('hello')))).toBe('aGVsbG8=');
  });

  it('passes through null, numbers, strings and booleans unchanged', () => {
    expect(normalizeCell(null)).toBeNull();
    expect(normalizeCell(undefined)).toBeNull();
    expect(normalizeCell(42)).toBe(42);
    expect(normalizeCell('x')).toBe('x');
    expect(normalizeCell(true)).toBe(true);
  });
});

describe('normalizeRow', () => {
  it('normalises every cell positionally, preserving duplicate-name-safe order', () => {
    const row = [1, 'x', 9_007_199_254_740_993n, null];
    expect(normalizeRow(row)).toEqual([1, 'x', '9007199254740993', null]);
  });
});
