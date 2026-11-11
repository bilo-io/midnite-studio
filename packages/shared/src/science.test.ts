import { describe, expect, it } from 'vitest';

import { migrateScienceNotebook, ScienceNotebookSchema, ScienceRequestSchema, type ScienceNotebook } from './science';

const notebook: ScienceNotebook = {
  version: 1,
  id: 'nb-abcdefghij12',
  title: 'Projectile',
  discipline: 'physics',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cells: [
    { kind: 'markdown', id: 'c-aaaaaaaa', source: '# Hi $x^2$' },
    { kind: 'compute', id: 'c-bbbbbbbb', source: 'a = 3 m/s^2' },
    { kind: 'plot', id: 'c-cccccccc', series: [{ expr: 'sin(x)' }], x: { min: 0, max: 6.28 }, y: 'auto' },
    { kind: 'molecule', id: 'c-dddddddd', name: 'water', format: 'xyz', text: '3\n\nO 0 0 0\nH 0 0 1\nH 0 1 0' },
  ],
};

describe('science schemas', () => {
  it('round-trips a valid notebook', () => {
    expect(ScienceNotebookSchema.parse(JSON.parse(JSON.stringify(notebook)))).toEqual(notebook);
    expect(migrateScienceNotebook(notebook)).toEqual(notebook);
  });

  it('rejects a path-shaped id', () => {
    expect(ScienceNotebookSchema.safeParse({ ...notebook, id: '../x' }).success).toBe(false);
    expect(ScienceRequestSchema.safeParse({ op: 'read', id: '../x' }).success).toBe(false);
  });

  it('rejects a plot whose x range is not increasing', () => {
    const bad = { ...notebook, cells: [{ kind: 'plot', id: 'c-cccccccc', series: [{ expr: 'x' }], x: { min: 1, max: 1 }, y: 'auto' }] };
    expect(ScienceNotebookSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects 501 cells', () => {
    const cells = Array.from({ length: 501 }, () => ({ kind: 'markdown' as const, id: 'c-aaaaaaaa', source: '' }));
    expect(ScienceNotebookSchema.safeParse({ ...notebook, cells }).success).toBe(false);
  });

  it('returns null for an unknown version', () => {
    expect(migrateScienceNotebook({ version: 2 })).toBeNull();
    expect(migrateScienceNotebook('junk')).toBeNull();
  });

  it('accepts every op', () => {
    for (const req of [
      { op: 'list' },
      { op: 'read', id: notebook.id },
      { op: 'create', title: 'T', discipline: 'maths', cells: [] },
      { op: 'write', notebook },
      { op: 'rename', id: notebook.id, title: 'x' },
      { op: 'remove', id: notebook.id },
      { op: 'importStructure' },
    ]) {
      expect(ScienceRequestSchema.safeParse(req).success).toBe(true);
    }
  });
});
