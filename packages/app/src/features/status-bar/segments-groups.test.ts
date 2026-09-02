import { describe, expect, it } from 'vitest';

import type { StatusSegment, StatusGroup } from './segments';
import { strandedSeparators, withSeparators, type RenderedKind } from './segments-groups';

const seg = (id: string, group: StatusGroup): StatusSegment => ({
  id,
  zone: 'left',
  group,
  priority: 0,
  label: id,
  El: () => null,
});

describe('withSeparators', () => {
  it('emits nothing for a single group', () => {
    const out = withSeparators([seg('a', 'shortcuts'), seg('b', 'shortcuts')]);
    expect(out.map((i) => i.kind)).toEqual(['segment', 'segment']);
  });

  it('emits one separator per group boundary', () => {
    const out = withSeparators([
      seg('a', 'shortcuts'),
      seg('b', 'shortcuts'),
      seg('c', 'health'),
      seg('d', 'live'),
    ]);
    expect(out.map((i) => i.kind)).toEqual([
      'segment',
      'segment',
      'separator',
      'segment',
      'separator',
      'segment',
    ]);
  });

  it('never leads or trails with a separator', () => {
    const out = withSeparators([seg('a', 'shortcuts'), seg('b', 'live')]);
    expect(out[0]?.kind).toBe('segment');
    expect(out.at(-1)?.kind).toBe('segment');
  });

  it('is empty for no segments', () => {
    expect(withSeparators([])).toEqual([]);
  });
});

describe('strandedSeparators', () => {
  const k = (s: string): RenderedKind[] =>
    [...s].map((c) => (c === '|' ? 'separator' : 'segment'));

  it('keeps a separator with a rendered segment on both sides', () => {
    expect([...strandedSeparators(k('s|s'))]).toEqual([]);
  });

  it('hides a leading separator', () => {
    // Every segment in the first group returned null.
    expect([...strandedSeparators(k('|s'))]).toEqual([0]);
  });

  it('hides a trailing separator', () => {
    expect([...strandedSeparators(k('s|'))]).toEqual([1]);
  });

  /**
   * The case that forced this whole mechanism: `health` has exactly one member
   * and `DiagnosticsSegment` renders nothing for a repository nobody has
   * measured, so a fresh install leaves two separators adjacent. The first
   * survives so the two neighbouring groups still read as separated; the second
   * would be a second rule for one logical break.
   */
  it('collapses a doubled separator left by an entirely absent middle group', () => {
    expect([...strandedSeparators(k('s||s'))]).toEqual([2]);
  });

  it('hides every separator when nothing rendered at all', () => {
    expect([...strandedSeparators(k('||'))]).toEqual([0, 1]);
  });

  it('hides a run of three left by two absent groups', () => {
    expect([...strandedSeparators(k('s|||s'))]).toEqual([2, 3]);
  });

  it('handles an empty zone', () => {
    expect([...strandedSeparators([])]).toEqual([]);
  });
});
