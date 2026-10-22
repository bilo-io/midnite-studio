// @vitest-environment node
// vitest: a pure function over notes - no electron, no browser.
import { describe, expect, it } from 'vitest';

import { projectGraph } from '@midnite/studio-knowledge';
import type { Note } from '@midnite/studio-shared';

import {
  buildNotesGraph,
  extractNoteConcepts,
  noteChunks,
  noteLabel,
  noteTags,
  notesFingerprint,
} from './notes-graph';

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

describe('SurrealDB AI Knowledge Graph ontology (Documents, Chunks, Concepts & Confidence)', () => {
  it('segments multi-section notes into addressable chunk nodes linked via part_of', () => {
    const multiSection = note(
      'doc1',
      '# RAG Architecture\nIntro to graph context.\n\n## Vector Embeddings\nChunks hold **HNSW Vectors** and `cosine_similarity`.\n---\n## Graph Traversal\nEdges carry **Confidence Score** metadata.',
    );
    const chunks = noteChunks(multiSection.body);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.label)).toEqual([
      'RAG Architecture',
      'Vector Embeddings',
      'Graph Traversal',
    ]);

    const graph = buildNotesGraph([multiSection]);
    const chunkNodes = graph.nodes.filter((n) => n.file_type === 'chunk');
    expect(chunkNodes.map((n) => n.id)).toEqual(['chunk:doc1:0', 'chunk:doc1:1', 'chunk:doc1:2']);
    expect(
      graph.links.filter((l) => l.relation === 'part_of').map((l) => `${l.source}->${l.target}`),
    ).toEqual(['chunk:doc1:0->note:doc1', 'chunk:doc1:1->note:doc1', 'chunk:doc1:2->note:doc1']);
  });

  it('extracts deduplicated concept nodes with confidence_score metadata and relates_to links', () => {
    const concepts = extractNoteConcepts(
      'Combine **Graph RAG** with `SurrealQL` and **Graph RAG** again.',
    );
    expect(concepts).toEqual([
      { slug: 'graph-rag', label: 'Graph RAG', confidence: 0.96 },
      { slug: 'surrealql', label: 'SurrealQL', confidence: 0.94 },
    ]);

    const graph = buildNotesGraph([
      note('n1', 'Title\nUse **Graph RAG** with `SurrealQL` for multi-hop context.'),
    ]);
    const lean = projectGraph(graph);
    const mentions = lean.links.filter((l) => l.relation === 'mentions');
    expect(mentions).toHaveLength(2);
    expect(mentions[0]!.confidence).toBeGreaterThan(0.85);
    expect(lean.links.some((l) => l.relation === 'relates_to')).toBe(true);
  });
});
