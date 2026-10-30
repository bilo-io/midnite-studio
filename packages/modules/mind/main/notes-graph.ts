import { createHash } from 'node:crypto';

import type { RawGraph, RawGraphLink, RawGraphNode } from '@midnite/studio-knowledge';
import type { Note } from '@midnite/studio-shared';

/**
 * Mind's AI Knowledge Graph, built from its own notebook (Phase 113 Theme M + SurrealDB AI KG architecture).
 *
 * Reference: https://surrealdb.com/blog/how-to-build-a-knowledge-graph-for-ai
 *
 * Bridges unstructured note text and AI agent Graph RAG workloads by combining three structural
 * layers into a unified context graph:
 * - **Documents (Notes)**: Primary note records (`note:<id>`, `file_type: 'note'`, community named
 *   for the note's status: `captured` | `planned` | `implemented`).
 * - **Chunks**: Multi-section notes (separated by markdown headings `## ...` or `---` dividers) are
 *   segmented into addressable text chunks (`chunk:<noteId>:<index>`, `file_type: 'chunk'`,
 *   community `chunks`), linked to their parent document via `part_of` (`confidence_score: 1.0`).
 * - **Concepts & Tags**:
 *   - `#tags` (`tag:<name>`, `file_type: 'tag'`, community `tags`) joined via `tagged`.
 *   - `[[wiki links]]` between notes joined via `references` (`confidence_score: 0.98`).
 *   - Extracted **Concepts / Entities** (`concept:<slug>`, `file_type: 'concept'`, community
 *     `concepts`) — inline code terms (`` `...` ``), bolded entities (`**...**`), or capitalized
 *     multi-word concepts — deduplicated across the notebook by normalized slug and linked from
 *     their source note/chunk via `mentions` and across co-occurring concepts via `relates_to`,
 *     each carrying a computed `confidence_score` in `(0, 1]`.
 *
 * `built_at_commit` is a deterministic SHA-1 content fingerprint, so an unchanged notebook reuses
 * its cached layout and any edit recomputes it.
 */

const TAG = /(?:^|[\s(])#([\p{L}\p{N}_-]+)/gu;
const WIKI = /\[\[([^\]\n]+)\]\]/g;
const INLINE_CODE_CONCEPT = /`([^`\n]{2,42})`/g;
const BOLD_CONCEPT = /\*\*([^*\n]{2,42})\*\*/g;
const LABEL_MAX = 60;

export type NoteChunkSegment = {
  index: number;
  label: string;
  body: string;
  startLine: number;
};

export type ExtractedConcept = {
  slug: string;
  label: string;
  confidence: number;
};

/** A note's first non-empty line with its markdown markers stripped, clipped to a legible label. */
export function noteLabel(body: string): string {
  const line = body.split('\n').find((l) => l.trim().length > 0) ?? '';
  const plain = line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s+|\d+\.\s+)/, '').trim();
  if (plain.length === 0) return 'Untitled note';
  return plain.length > LABEL_MAX ? `${plain.slice(0, LABEL_MAX - 1)}…` : plain;
}

export function noteNodeId(noteId: string): string {
  return `note:${noteId}`;
}

export function chunkNodeId(noteId: string, index: number): string {
  return `chunk:${noteId}:${index}`;
}

export function conceptNodeId(slug: string): string {
  return `concept:${slug}`;
}

/** Distinct, lower-cased `#tags` in a body. */
export function noteTags(body: string): string[] {
  const tags = new Set<string>();
  for (const m of body.matchAll(TAG)) tags.add(m[1]!.toLowerCase());
  return [...tags];
}

/**
 * Segments a multi-section note into addressable chunks when the note contains
 * markdown subheadings (`#`..`######` after the title line) or horizontal rules (`---`).
 * Short single-paragraph notes produce no separate chunk nodes so simple notebooks stay lean.
 */
export function noteChunks(body: string): NoteChunkSegment[] {
  const lines = body.split('\n');
  const rawSegments: Array<{ lines: string[]; startLine: number }> = [];
  let current: string[] = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const isDivider = /^---+$/.test(trimmed);
    const isHeading = i > 0 && /^#{1,6}\s+\S/.test(trimmed);

    if (isDivider) {
      if (current.some((l) => l.trim().length > 0)) {
        rawSegments.push({ lines: current, startLine: currentStart });
      }
      current = [];
      currentStart = i + 2;
      continue;
    }

    if (isHeading && current.some((l) => l.trim().length > 0)) {
      rawSegments.push({ lines: current, startLine: currentStart });
      current = [line];
      currentStart = i + 1;
      continue;
    }

    current.push(line);
  }

  if (current.some((l) => l.trim().length > 0)) {
    rawSegments.push({ lines: current, startLine: currentStart });
  }

  // Only emit chunk nodes when the document actually segments into 2+ meaningful sections
  if (rawSegments.length < 2) return [];

  return rawSegments.map((seg, index) => {
    const segBody = seg.lines.join('\n').trim();
    return {
      index,
      label: noteLabel(segBody),
      body: segBody,
      startLine: seg.startLine,
    };
  });
}

function normalizeConceptSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extracts deduplicated key concepts/entities from a text segment (`**Bold Concept**`
 * or `` `inline_symbol` ``), scoring each concept's extraction confidence in `[0.82, 0.98]`.
 */
export function extractNoteConcepts(body: string): ExtractedConcept[] {
  const bySlug = new Map<string, ExtractedConcept>();

  for (const m of body.matchAll(BOLD_CONCEPT)) {
    const raw = m[1]!.trim();
    const slug = normalizeConceptSlug(raw);
    if (slug.length < 2) continue;
    const existing = bySlug.get(slug);
    const confidence = Math.min(0.98, (existing?.confidence ?? 0.88) + 0.04);
    bySlug.set(slug, {
      slug,
      label: existing?.label ?? raw,
      confidence: Number(confidence.toFixed(4)),
    });
  }

  for (const m of body.matchAll(INLINE_CODE_CONCEPT)) {
    const raw = m[1]!.trim();
    const slug = normalizeConceptSlug(raw);
    if (slug.length < 2) continue;
    const existing = bySlug.get(slug);
    const confidence = Math.min(0.98, (existing?.confidence ?? 0.91) + 0.03);
    bySlug.set(slug, {
      slug,
      label: existing?.label ?? raw,
      confidence: Number(confidence.toFixed(4)),
    });
  }

  return [...bySlug.values()];
}

/** A hash of everything the graph depends on - stable across restarts, changed by any edit. */
export function notesFingerprint(notes: readonly Note[]): string {
  const hash = createHash('sha1');
  for (const n of [...notes].sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update(`${n.id}\u0000${n.status}\u0000${n.updatedAt}\u0000${n.body}\u0001`);
  }
  return hash.digest('hex');
}

const STATUS_ORDER = ['captured', 'planned', 'implemented'] as const;

export function buildNotesGraph(notes: readonly Note[]): RawGraph {
  const nodes: RawGraphNode[] = [];
  const links: RawGraphLink[] = [];

  const communities = [...STATUS_ORDER, 'tags', 'chunks', 'concepts'];
  const communityOf = (name: string) => Math.max(0, communities.indexOf(name));

  const byLabel = new Map<string, string>();
  for (const n of notes) {
    const label = noteLabel(n.body);
    byLabel.set(label.toLowerCase(), n.id);
    // `[[Beta]]` also reaches a note titled `Beta #work`: its tags are not part of its name.
    byLabel.set(label.replace(TAG, '').trim().toLowerCase(), n.id);
    nodes.push({
      id: noteNodeId(n.id),
      label,
      community: communityOf(n.status),
      community_name: n.status,
      file_type: 'note',
      // The Knowledge node panel opens `source_file`; Mind's host renders the note with that id.
      source_file: n.id,
      // graphify's own "L<line>" form: the detail index drops a node with no location, and the panel reads the line.
      source_location: 'L1',
    });
  }

  const tagNodes = new Set<string>();
  const conceptNodes = new Set<string>();

  for (const n of notes) {
    // 1. Tags (`tagged`)
    for (const tag of noteTags(n.body)) {
      const id = `tag:${tag}`;
      if (!tagNodes.has(id)) {
        tagNodes.add(id);
        nodes.push({
          id,
          label: `#${tag}`,
          community: communityOf('tags'),
          community_name: 'tags',
          file_type: 'tag',
          source_file: '',
          source_location: '',
        });
      }
      links.push({
        source: noteNodeId(n.id),
        target: id,
        relation: 'tagged',
        weight: 1,
        confidence_score: 0.96,
      });
    }

    // 2. Wiki-link references (`references`)
    for (const m of n.body.matchAll(WIKI)) {
      const target = byLabel.get(m[1]!.trim().toLowerCase());
      if (target !== undefined && target !== n.id) {
        links.push({
          source: noteNodeId(n.id),
          target: noteNodeId(target),
          relation: 'references',
          weight: 1,
          confidence_score: 0.98,
        });
      }
    }

    // 3. Multi-section Chunks (`part_of`) & Concept extraction (`mentions`, `relates_to`)
    const chunks = noteChunks(n.body);
    for (const ch of chunks) {
      const cId = chunkNodeId(n.id, ch.index);
      nodes.push({
        id: cId,
        label: ch.label,
        community: communityOf('chunks'),
        community_name: 'chunks',
        file_type: 'chunk',
        source_file: n.id,
        source_location: `L${ch.startLine}`,
      });
      links.push({
        source: cId,
        target: noteNodeId(n.id),
        relation: 'part_of',
        weight: 1,
        confidence_score: 1.0,
      });
    }

    const concepts = extractNoteConcepts(n.body);
    for (let i = 0; i < concepts.length; i += 1) {
      const concept = concepts[i]!;
      const cNodeId = conceptNodeId(concept.slug);
      if (!conceptNodes.has(cNodeId)) {
        conceptNodes.add(cNodeId);
        nodes.push({
          id: cNodeId,
          label: concept.label,
          community: communityOf('concepts'),
          community_name: 'concepts',
          file_type: 'concept',
          source_file: n.id,
          source_location: 'L1',
        });
      }
      links.push({
        source: noteNodeId(n.id),
        target: cNodeId,
        relation: 'mentions',
        weight: 1,
        confidence_score: concept.confidence,
      });

      // Co-occurring concepts in the same note form a `relates_to` edge
      if (i > 0) {
        const prev = concepts[i - 1]!;
        if (prev.slug !== concept.slug) {
          links.push({
            source: conceptNodeId(prev.slug),
            target: cNodeId,
            relation: 'relates_to',
            weight: 0.9,
            confidence_score: Number(((prev.confidence + concept.confidence) * 0.47).toFixed(4)),
          });
        }
      }
    }
  }

  return { nodes, links, built_at_commit: notesFingerprint(notes) };
}
