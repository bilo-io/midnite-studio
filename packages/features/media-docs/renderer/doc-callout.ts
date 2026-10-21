import Blockquote from '@tiptap/extension-blockquote';

/**
 * GitHub-style alerts (`> [!NOTE]`) on top of the plain blockquote: the same
 * node with an optional `callout` attr, so Quote and every callout kind stay
 * one block type and a doc that does not use them is untouched.
 *
 * Markdown form: the first line of the quote is the marker, the rest is the
 * body. Round-trip is exact for the five GitHub kinds.
 */
export const CALLOUT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/i;

type Json = { type?: string; text?: string; content?: Json[]; attrs?: Record<string, unknown> };

export const Callout = Blockquote.extend({
  addAttributes() {
    return {
      callout: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-callout'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.callout ? { 'data-callout': String(attrs.callout) } : {},
      },
    };
  },
  parseMarkdown: (token, helpers) => {
    const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren;
    const children = parseBlockChildren(token.tokens || []) as Json[];
    const first = children[0]?.type === 'paragraph' ? children[0] : undefined;
    const inline = first?.content ?? [];
    const head = inline[0];
    const m = head?.type === 'text' ? MARKER.exec(head.text ?? '') : null;
    if (!m || !first) return helpers.createNode('blockquote', undefined, children);
    const rest = (head!.text ?? '').slice(m[0].length);
    const content = [...(rest ? [{ ...head, text: rest }] : []), ...inline.slice(1)];
    // marked keeps the newline after the marker as a hard break when the text node ends there
    if (content[0]?.type === 'hardBreak') content.shift();
    const body = content.length > 0 ? [{ ...first, content }, ...children.slice(1)] : children.slice(1);
    return helpers.createNode(
      'blockquote',
      { callout: m[1]!.toLowerCase() },
      (body.length > 0 ? body : [{ type: 'paragraph' }]) as never,
    );
  },
  renderMarkdown: (node, h) => {
    const kind = node.attrs?.callout as string | null | undefined;
    if (!node.content) return '';
    const parts = node.content.map((child, i) =>
      (h.renderChild?.(child, i) ?? h.renderChildren([child]))
        .split('\n')
        .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
        .join('\n'),
    );
    const body = parts.join('\n>\n');
    return kind ? `> [!${kind.toUpperCase()}]\n${body}` : body;
  },
});
