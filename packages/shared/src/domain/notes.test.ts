import { describe, expect, it } from 'vitest';

import { NoteSchema, NoteStatusSchema } from './notes';

describe('Note domain schema', () => {
  it('parses a valid note', () => {
    const valid = {
      id: 'note-1',
      repoId: 'repo-abc',
      body: 'Hello world',
      status: 'captured',
      done: false,
      createdAt: 1000,
      updatedAt: 1000,
      order: 0,
    };
    const parsed = NoteSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it('allows negative order (for prepending notes)', () => {
    const note = {
      id: 'note-1',
      repoId: 'repo-abc',
      body: 'Prepended note',
      status: 'planned',
      done: true,
      createdAt: 1000,
      updatedAt: 2000,
      order: -1,
    };
    expect(NoteSchema.parse(note).order).toBe(-1);
  });

  it('rejects invalid status', () => {
    expect(() => NoteStatusSchema.parse('invalid-status')).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() =>
      NoteSchema.parse({
        id: 'note-1',
        // missing repoId
        body: 'Missing repo',
        status: 'captured',
        done: false,
        createdAt: 1000,
        updatedAt: 1000,
        order: 0,
      }),
    ).toThrow();
  });
});
