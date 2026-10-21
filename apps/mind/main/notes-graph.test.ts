// @vitest-environment node
// vitest: a pure function over notes - no electron, no browser.
import { describe, expect, it } from 'vitest';

import { projectGraph } from '@midnite/studio-knowledge';
import type { Note } from '@midnite/studio-shared';

import { buildNotesGraph, noteLabel, noteTags, notesFingerprint } from './notes-graph';

function note(id: string, body: string, over: Partial<Note> = {}): Note {
  return { id, repoId: 'mind', body, status: 'captured', done: false, createdAt: 1, updatedAt: 1, order: 0, ...over };
}

describe('noteLabel', () => {
  it('takes the first non-empty line without its markdown marker', () => {
    expect(noteLabel('\n\n## Plan the week\nmore')).toBe('Plan the week');
    expect(noteLabel('- a bullet')).toBe('a bullet');
  });

  it('clips a long line and names an empty note', () => {
    expect(noteLabel('x'.repeat(200))).toHaveLength(60);
    expect(noteLabel('   \n ')).toBe('Untitled note');
  });
});

describe('noteTags', () => {
  it('finds distinct lower-cased #tags and ignores a # inside a word', () => {
    expect(noteTags('Ship #Mind and #mind again, issue#12, (#ideas)')).toEqual(['mind', 'ideas']);
  });
});

describe('buildNotesGraph', () => {
  const notes = [
    note('a', 'Alpha #work\nsee [[Beta]]'),
    note('b', 'Beta #work #home', { status: 'planned' }),
    note('c', 'Gamma [[Nobody]] [[Gamma]]'),
  ];
  const graph = buildNotesGraph(notes);

  it('makes a node per note and per distinct tag, in a community named for the status or "tags"', () => {
    expect(graph.nodes.map((n) => [n.id, n.community_name])).toEqual([
      ['note:a', 'captured'],
      ['note:b', 'planned'],
      ['note:c', 'captured'],
      ['tag:work', 'tags'],
      ['tag:home', 'tags'],
    ]);
  });

  it('joins a note to its tags and to the notes it links; a dangling or self link is dropped', () => {
    expect(graph.links.map((l) => `${l.source}>${l.target}:${l.relation}`)).toEqual([
      'note:a>tag:work:tagged',
      'note:a>note:b:references',
      'note:b>tag:work:tagged',
      'note:b>tag:home:tagged',
    ]);
  });

  it('points each note node at its own id so the detail panel can open it', () => {
    expect(graph.nodes[0]).toMatchObject({ source_file: 'a', file_type: 'note' });
  });

  it('is accepted by the knowledge projection as a graph', () => {
    const lean = projectGraph(graph);
    expect(lean.nodes).toHaveLength(5);
    expect(lean.builtAtCommit).toBe(graph.built_at_commit);
  });
});

describe('notesFingerprint', () => {
  it('is stable across order and changes with any edit', () => {
    const a = note('a', 'one');
    const b = note('b', 'two');
    expect(notesFingerprint([a, b])).toBe(notesFingerprint([b, a]));
    expect(notesFingerprint([a, b])).not.toBe(notesFingerprint([a, { ...b, body: 'two!' }]));
    expect(notesFingerprint([a, b])).not.toBe(notesFingerprint([a, { ...b, updatedAt: 2 }]));
  });
});
