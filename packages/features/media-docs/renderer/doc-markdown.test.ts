import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { selectionMarkdown } from './doc-editor';
import { CODE_LANGUAGES, docExtensions } from './doc-extensions';
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
  deepHeadings: '#### Four\n\n##### Five\n\n###### Six',
  image: '![A cat](https://example.com/cat.png)',
  imageTitled: '![A cat](https://example.com/cat.png "Tabby")',
  codeNoLang: '```\nplain\n```',
  codeAlias: '```rs\nfn main() {}\n```',
  codeLong: '```typescript\nconst a: number = 1;\n```',
  calloutNote: '> [!NOTE]\n> Useful information.',
  calloutWarning: '> [!WARNING]\n> First line.\n>\n> Second paragraph.',
  calloutBlocks: '> [!TIP]\n> - one\n> - two',
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

  it('parses a GitHub alert into a blockquote with a callout kind and no marker text', () => {
    const editor = load('> [!WARNING]\n> Careful here.');
    const quote = editor.state.doc.child(0);
    expect(quote.type.name).toBe('blockquote');
    expect(quote.attrs.callout).toBe('warning');
    expect(quote.textContent).toBe('Careful here.');
    editor.destroy();
  });

  it('keeps a plain quote plain, and a quote that merely starts with brackets', () => {
    expect(roundTrip('> [!NOPE]\n> text')).toBe('> \\[!NOPE\\]\n> text');
    const editor = load('> just a quote');
    expect(editor.state.doc.child(0).attrs.callout).toBeNull();
    editor.destroy();
  });

  it('turns a fence info string into the code block language, and a changed language back into the fence', () => {
    const editor = load('```ts\nconst a = 1;\n```');
    expect(editor.state.doc.child(0).attrs.language).toBe('ts');
    editor.commands.updateAttributes('codeBlock', { language: 'python' });
    expect(normalizeMarkdown(editor.getMarkdown()).trim()).toBe('```python\nconst a = 1;\n```');
    editor.commands.updateAttributes('codeBlock', { language: null });
    expect(normalizeMarkdown(editor.getMarkdown()).trim()).toBe('```\nconst a = 1;\n```');
    editor.destroy();
  });

  it('registers every lowlight language for the dropdown', () => {
    expect(CODE_LANGUAGES.length).toBeGreaterThan(150);
    expect(CODE_LANGUAGES).toContain('typescript');
    expect(CODE_LANGUAGES).toContain('plaintext');
  });

  it('keeps an image that sits between paragraphs', () => {
    const doc = 'before\n\n![shot](https://example.com/a.png)\n\nafter';
    expect(roundTrip(doc)).toBe(doc);
  });
});
