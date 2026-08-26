import type { Element, ElementContent, Properties, Root } from 'hast';
import { describe, expect, it } from 'vitest';

import { rehypeLinkify, SHA_ATTR } from './linkify-rehype';

const text = (value: string): ElementContent => ({ type: 'text', value });

const el = (
  tagName: string,
  children: ElementContent[],
  properties: Properties = {},
): Element => ({ type: 'element', tagName, properties, children });

const root = (...children: ElementContent[]): Root => ({ type: 'root', children });

/** Every element in the tree, depth-first — what the ancestry assertions read. */
function elements(node: Root | Element): Element[] {
  const out: Element[] = [];
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    out.push(child, ...elements(child));
  }
  return out;
}

const run = (tree: Root, options = {}): Root => {
  rehypeLinkify(options)(tree);
  return tree;
};

describe('rehypeLinkify', () => {
  it('turns a reference in ordinary prose into an element', () => {
    const tree = run(root(el('p', [text('see 7c521fe now')])));
    const button = elements(tree).find((e) => e.tagName === 'button');

    expect(button?.properties?.[SHA_ATTR]).toBe('7c521fe');
    // The surrounding text survives, split around the match.
    const p = tree.children[0] as Element;
    expect(p.children.map((c) => (c.type === 'text' ? c.value : '<button>')).join('')).toBe(
      'see <button> now',
    );
  });

  it('leaves the node untouched when nothing matches', () => {
    const original = text('nothing to see here');
    const tree = run(root(el('p', [original])));

    // Identity, not just equality: replacing an unmatched node with a copy on
    // every render would defeat React's reconciliation for the whole message.
    expect((tree.children[0] as Element).children[0]).toBe(original);
  });

  it('does not linkify inside a code element', () => {
    const tree = run(root(el('code', [text('const sha = 7c521fe;')])));
    expect(elements(tree).some((e) => e.tagName === 'button')).toBe(false);
  });

  it('does not linkify inside a fenced block', () => {
    const tree = run(root(el('pre', [el('code', [text('git show 7c521fe')])])));
    expect(elements(tree).some((e) => e.tagName === 'button')).toBe(false);
  });

  it('does not linkify a DESCENDANT of an anchor, not just its direct child', () => {
    // The regression this exists for. `visit` hands a visitor only the immediate
    // parent, so `a > strong > text` — which is exactly what a markdown link
    // with a bold label produces — passed a parent-only opacity test.
    //
    // The consequence was a control nested inside a link: one click fires both,
    // so `[**deadbeef1**](https://evil.example)` in a commit message would
    // select a commit AND open the URL.
    const tree = run(
      root(
        el('a', [el('strong', [text('deadbeef1 and https://evil.example/x')])], {
          href: 'https://outer.example',
        }),
      ),
    );

    const inner = elements(tree).filter((e) => e.tagName === 'a' || e.tagName === 'button');
    expect(inner.map((e) => e.tagName)).toEqual(['a']);
    expect(inner[0]?.properties?.href).toBe('https://outer.example');
  });

  it('opacity does not leak to a sibling subtree', () => {
    const tree = run(root(el('p', [el('code', [text('7c521fe')]), text('and 7c521fe')])));
    const buttons = elements(tree).filter((e) => e.tagName === 'button');

    // Exactly one: the code span's is suppressed, the prose one is not.
    expect(buttons).toHaveLength(1);
  });

  it('linkifies deep inside a non-opaque tree', () => {
    const tree = run(root(el('blockquote', [el('p', [el('em', [text('fixes #42')])])])));
    const link = elements(tree).find((e) => e.tagName === 'a');
    expect(link).toBeUndefined();

    const withForge = run(
      root(el('blockquote', [el('p', [el('em', [text('fixes #42')])])])),
      { issueUrl: (n: number) => `https://forge.example/issues/${n}` },
    );
    expect(elements(withForge).find((e) => e.tagName === 'a')?.properties?.href).toBe(
      'https://forge.example/issues/42',
    );
  });

  it('renders an email through the guarded mailto route', () => {
    const tree = run(root(el('p', [text('by a@b.io')])));
    expect(elements(tree).find((e) => e.tagName === 'a')?.properties?.href).toBe('mailto:a@b.io');
  });

  it('leaves #123 as text when no forge resolves it', () => {
    // Degrade, never invent a link that 404s.
    const tree = run(root(el('p', [text('closes #123')])));
    const p = tree.children[0] as Element;

    expect(elements(p)).toHaveLength(0);
    // Split into text runs, but not one character of it lost.
    expect(p.children.map((c) => (c.type === 'text' ? c.value : '')).join('')).toBe(
      'closes #123',
    );
  });

  it('does not walk into its own output', () => {
    // A rewritten text node is pushed straight into the result rather than
    // re-scanned; re-scanning would match the same sha forever.
    const tree = run(root(el('p', [text('7c521fe')])));
    const button = elements(tree).find((e) => e.tagName === 'button');
    expect(button?.children).toEqual([text('7c521fe')]);
  });
});
