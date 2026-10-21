import { createHash } from 'node:crypto';

import type { Note } from '@midnite/studio-shared';

/**
 * Turning a note's own text into flashcards (Phase 113 Theme M, Review).
 *
 * Pure: no disk, no clock. The note is never modified — cards are derived on
 * every read, and a card's identity is `<noteId>#<hash of its front>`, so
 * editing a card's front starts it over while editing its back keeps its
 * schedule. Three formats, tried in this order, first match wins per note:
 *
 * 1. `Q:` / `A:` lines. `Q: front` then `A: back`; either may continue over
 *    following lines until the next `Q:`, `A:` or a blank line after the answer.
 * 2. A `---` split. A line holding only `---` divides the note into chunks;
 *    chunks pair up (1st front, 2nd back, 3rd front, 4th back…); a trailing
 *    unpaired chunk is ignored.
 * 3. Heading → body. Each markdown heading with non-empty text beneath it
 *    (up to the next heading) is a card: the heading is the front.
 */
export type DraftCard = { id: string; noteId: string; front: string; back: string };

const Q = /^\s*Q\s*:\s*(.*)$/i;
const A = /^\s*A\s*:\s*(.*)$/i;
const RULE = /^\s*---\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;

export function cardId(noteId: string, front: string): string {
  return `${noteId}#${createHash('sha1').update(front).digest('hex').slice(0, 10)}`;
}

function make(noteId: string, front: string, back: string): DraftCard | null {
  const f = front.trim();
  const b = back.trim();
  if (f === '' || b === '') return null;
  return { id: cardId(noteId, f), noteId, front: f, back: b };
}

function fromQuestionLines(noteId: string, lines: string[]): DraftCard[] {
  const out: DraftCard[] = [];
  let front: string[] | null = null;
  let back: string[] | null = null;
  const flush = (): void => {
    if (front && back) {
      const card = make(noteId, front.join('\n'), back.join('\n'));
      if (card) out.push(card);
    }
    front = null;
    back = null;
  };
  for (const line of lines) {
    const q = Q.exec(line);
    const a = A.exec(line);
    if (q) {
      flush();
      front = [q[1] ?? ''];
    } else if (a && front && !back) {
      back = [a[1] ?? ''];
    } else if (back) {
      if (line.trim() === '') flush();
      else back.push(line);
    } else if (front) {
      front.push(line);
    }
  }
  flush();
  return out;
}

function fromRules(noteId: string, lines: string[]): DraftCard[] {
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (RULE.test(line)) {
      chunks.push(current.join('\n'));
      current = [];
    } else current.push(line);
  }
  chunks.push(current.join('\n'));
  const out: DraftCard[] = [];
  for (let i = 0; i + 1 < chunks.length; i += 2) {
    const card = make(noteId, chunks[i] ?? '', chunks[i + 1] ?? '');
    if (card) out.push(card);
  }
  return out;
}

function fromHeadings(noteId: string, lines: string[]): DraftCard[] {
  const out: DraftCard[] = [];
  let front: string | null = null;
  let body: string[] = [];
  const flush = (): void => {
    if (front !== null) {
      const card = make(noteId, front, body.join('\n'));
      if (card) out.push(card);
    }
  };
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h) {
      flush();
      front = h[1] ?? '';
      body = [];
    } else body.push(line);
  }
  flush();
  return out;
}

/** The cards one note yields. Duplicate fronts within a note collapse to the first. */
export function cardsFromNote(note: Pick<Note, 'id' | 'body'>): DraftCard[] {
  const lines = note.body.replace(/\r\n?/g, '\n').split('\n');
  const strategies = [fromQuestionLines, fromRules, fromHeadings];
  for (const strategy of strategies) {
    const cards = strategy(note.id, lines);
    if (cards.length > 0) {
      const seen = new Set<string>();
      return cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    }
  }
  return [];
}
