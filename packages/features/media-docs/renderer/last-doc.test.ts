import { describe, expect, it } from 'vitest';

import { pickInitialDoc } from './last-doc';

const docs = [
  { project: 'a', path: 'one.md', mtimeMs: 10 },
  { project: 'a', path: 'two.md', mtimeMs: 30 },
  { project: 'b', path: 'three.md', mtimeMs: 20 },
];

describe('pickInitialDoc', () => {
  it('prefers the remembered last-edited doc', () => {
    expect(pickInitialDoc(docs, { project: 'b', path: 'three.md' })).toEqual({ project: 'b', path: 'three.md' });
  });
  it('falls back to the newest mtime when the remembered doc is gone', () => {
    expect(pickInitialDoc(docs, { project: 'a', path: 'deleted.md' })).toEqual({ project: 'a', path: 'two.md' });
    expect(pickInitialDoc(docs, null)).toEqual({ project: 'a', path: 'two.md' });
  });
  it('falls back to the first doc when mtimes are unknown', () => {
    const flat = docs.map((d) => ({ ...d, mtimeMs: 0 }));
    expect(pickInitialDoc(flat, undefined)).toEqual({ project: 'a', path: 'one.md' });
  });
  it('is null with no docs', () => {
    expect(pickInitialDoc([], { project: 'a', path: 'one.md' })).toBeNull();
  });
});
