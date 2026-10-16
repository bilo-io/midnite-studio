import { createHash } from 'node:crypto';

import type { RawGraph, RawGraphLink, RawGraphNode } from '@midnite/studio-knowledge';
import type { Note } from '@midnite/studio-shared';

/**
 * Mind's graph, built from its own notebook (Phase 113 Theme M).
 *
 * A repository's graph comes from graphify, a separate tool the user runs. A notebook has no such
 * step and no tool to be missing: the graph is a pure function of the notes, rebuilt whenever they
 * change, in the same `graph.json` shape `@midnite/studio-knowledge` already projects and lays out.
 *
 * - a **note** is a node, labelled with its first line, in a community named for its status;
 * - a **#tag** in a note body is a node in the `tags` community, joined to each note that uses it
 *   (`tagged`), so notes sharing a tag sit near each other;
 * - a **[[wiki link]]** to another note's first line joins the two notes (`references`).
 *
 * `built_at_commit` is a content hash, not a commit: it is what the layout cache keys on, so an
 * unchanged notebook reuses its layout and any edit recomputes it.
 */

const TAG = /(?:^|[\s(])#([\p{L}\p{N}_-]+)/gu;
const WIKI = /\[\[([^\]\n]+)\]\]/g;
const LABEL_MAX = 60;

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

/** Distinct, lower-cased `#tags` in a body. */
export function noteTags(body: string): string[] {
  const tags = new Set<string>();
  for (const m of body.matchAll(TAG)) tags.add(m[1]!.toLowerCase());
  return [...tags];
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

  const communities = [...STATUS_ORDER, 'tags'];
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
  for (const n of notes) {
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
      links.push({ source: noteNodeId(n.id), target: id, relation: 'tagged', weight: 1 });
    }
    for (const m of n.body.matchAll(WIKI)) {
      const target = byLabel.get(m[1]!.trim().toLowerCase());
      if (target !== undefined && target !== n.id) {
        links.push({ source: noteNodeId(n.id), target: noteNodeId(target), relation: 'references', weight: 1 });
      }
    }
  }

  return { nodes, links, built_at_commit: notesFingerprint(notes) };
}
