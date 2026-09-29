import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { selectionMarkdown } from './doc-editor';
import { docExtensions } from './doc-extensions';
import { normalizeMarkdown } from './doc-thread';

/**
 * Markdown round-trip fixtures for the Docs editor (Phase 99 Theme B): load a
 * `.md` into the editor's schema and serialize it back, as open → save does.
 *
 * Known lossy constructs — not asserted, documented here so a change to them
 * is a decision rather than a surprise:
 * - **HTML blocks** (`<div>…</div>`) are not in the schema; their text
 *   survives, the tags do not.
 * - **Footnotes** (`[^1]`) are not GFM-in-Tiptap; the reference and the
 *   definition come back as plain text/paragraphs.
 * - Table cells are **re-padded** to aligned columns (content preserved).
 * - `*`/`+` bullets normalise to `-`; `__bold__` to `**bold**`.
 */
function load(markdown: string): Editor {
  return new Editor({ extensions: docExtensions(), content: markdown, contentType: 'markdown' });
}

function roundTrip(markdown: string): string {
  const editor = load(markdown);
  // What the editor's onChange hands the autosave.
  const out = normalizeMarkdown(editor.getMarkdown());
  editor.destroy();
  return out.trim();
}

const FIXTURES: Record<string, string> = {
  headings: '# One\n\n## Two\n\n### Three',
  bullets: '- a\n- b\n  - nested',
  ordered: '1. first\n2. second',
  tasks: '- [ ] todo\n- [x] done',
  table: '| a   | b   |\n| --- | --- |\n| 1   | 2   |',
  code: '```ts\nconst a = 1;\n```',
  link: 'See [the docs](https://example.com) now.',
  marks: 'Some **bold**, *italic*, ~~struck~~ and `code`.',
  quote: '> quoted',
  rule: 'above\n\n---\n\nbelow',
};

describe('Docs markdown round-trip', () => {
  for (const [name, md] of Object.entries(FIXTURES)) {
    it(`keeps ${name}`, () => {
      expect(roundTrip(md)).toBe(md);
    });
  }

  it('keeps a whole doc mixing every construct, and is stable on a second pass', () => {
    const doc = Object.values(FIXTURES).join('\n\n');
    const once = roundTrip(doc);
    expect(once).toBe(doc);
    expect(roundTrip(once)).toBe(once);
  });

  it('pads a compact table once, then leaves it alone', () => {
    const once = roundTrip('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(once).toBe(FIXTURES.table);
    expect(roundTrip(once)).toBe(once);
  });

  it('serializes a selection as markdown that is found verbatim in the doc', () => {
    const md = '# Title\n\nFirst paragraph with **bold**.\n\nSecond paragraph.';
    const editor = load(md);
    let from = -1;
    let to = -1;
    editor.state.doc.descendants((node, pos) => {
      if (from < 0 && node.type.name === 'paragraph') {
        from = pos + 1;
        to = pos + node.nodeSize - 1;
      }
    });
    editor.commands.setTextSelection({ from, to });
    const selected = selectionMarkdown(editor);
    expect(selected).toBe('First paragraph with **bold**.');
    expect(editor.getMarkdown()).toContain(selected);
    editor.destroy();
  });
});
