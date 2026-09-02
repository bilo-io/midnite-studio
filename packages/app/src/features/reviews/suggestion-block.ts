import type { Code, Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * Finds GitHub's ` ```suggestion ` fence in a review comment body (Phase 48
 * Theme A) — the first step of "apply straight to the working tree" that
 * every later theme in this phase builds on.
 *
 * Walks the same mdast tree `deck-parser.ts` does (`remark-parse` +
 * `remark-gfm`, the identical GFM flavour `MarkdownPreview`/`react-markdown`
 * already render review comments with) rather than a second, string-based
 * scan — a hand-rolled ` ```suggestion ` regex would have to reinvent fence
 * nesting, escaping and indentation rules the parser already gets right.
 *
 * Deliberately loose about what counts: any code fence whose language is
 * exactly `suggestion` is treated as a real one, including inside a
 * blockquote or a list — GitHub itself makes the same simplification (it
 * does not distinguish "an actual suggestion" from "a fence that merely
 * says `suggestion`"), and this phase does not try to be stricter than the
 * platform whose syntax it is reading.
 */

const parser = unified().use(remarkParse).use(remarkGfm);

function isSuggestionFence(node: RootContent): node is Code {
  return node.type === 'code' && node.lang === 'suggestion';
}

/** Depth-first, in document order — a blockquote's or list item's own fence counts too. */
function findSuggestion(nodes: readonly RootContent[]): Code | null {
  for (const node of nodes) {
    if (isSuggestionFence(node)) return node;
    if ('children' in node && Array.isArray(node.children)) {
      const found = findSuggestion(node.children as RootContent[]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The replacement text a ` ```suggestion ` block proposes, or `null` if the
 * body has none.
 *
 * A body with prose before and/or after the fence ("please fix the typo:"
 * followed by the block) parses correctly — only the fenced block's own
 * `value` (already de-fenced by the parser, language tag stripped) comes
 * back; the prose is never touched. Two separate suggestion fences in one
 * body is rare but valid GitHub markdown; the FIRST one found (document
 * order) is used, and this is that documented choice — not an oversight.
 */
export function extractSuggestion(body: string): string | null {
  const tree = parser.parse(body) as Root;
  const match = findSuggestion(tree.children);
  return match ? match.value : null;
}
