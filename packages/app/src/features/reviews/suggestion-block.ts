import type { Code, Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { FileDiff, ForgeReviewThread } from '@midnite/studio-shared';

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

/**
 * The 1-indexed, inclusive line range a suggestion would replace, or `null`
 * when Apply has no honest target (Phase 48 Theme B).
 *
 * `startLine` is schema-present on `ForgeReviewThread` but read by nothing
 * else today — every existing renderer anchors off `line` alone — so this is
 * its first consumer. `LEFT`-side threads return `null` unconditionally: a
 * suggestion proposes replacement text for the PR's own incoming lines, and a
 * deleted/base-side thread anchors to content the current working tree does
 * not carry in the same position.
 */
export function suggestionLineRange(
  thread: ForgeReviewThread,
): { start: number; end: number } | null {
  if (thread.side !== 'RIGHT') return null;
  if (thread.line === null) return null;
  return { start: thread.startLine ?? thread.line, end: thread.line };
}

/** Trailing `\r` stripped defensively — a CRLF checkout should still compare cleanly. */
function splitLines(content: string): string[] {
  return content.split('\n').map((line) => line.replace(/\r$/, ''));
}

/**
 * The right-side text a suggestion's line range assumes, read out of the
 * PR's own diff rather than the local file — this is the "original" a
 * suggestion's replacement is written against.
 *
 * Walks every hunk's lines for the ones actually present on the right side
 * (`add`/`ctx` — a `del` line carries no `newNo`) whose `newNo` falls in
 * `[start, end]`, sorted by line number. A gap — some line in the range the
 * diff simply does not carry — means the range cannot be verified at all,
 * and returns `null` rather than a partial answer; the caller treats that
 * the same as a mismatch (fail closed, per this phase's settled recommendation).
 */
export function expectedRightSideText(file: FileDiff, start: number, end: number): string | null {
  const found = new Map<number, string>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.newNo === null || line.kind === 'del') continue;
      if (line.newNo < start || line.newNo > end) continue;
      found.set(line.newNo, line.text);
    }
  }
  const lines: string[] = [];
  for (let n = start; n <= end; n++) {
    const text = found.get(n);
    if (text === undefined) return null;
    lines.push(text);
  }
  return lines.join('\n');
}

export type SuggestionApplyCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a suggestion is safe to apply right now (Phase 48 Theme C — the
 * phase's real weight). Stricter than, and separate from, `fsWriteFile`'s own
 * `expectedVersion` check: that guard only catches "changed since *this app*
 * last read the file", not "diverged from the commit the PR thread is
 * anchored to". Both checks run independently; either can refuse.
 *
 * Every refusal is explicit and fails closed — a partial/fuzzy match (e.g. a
 * linter reformatted one of several lines) is treated as a full mismatch, not
 * a best-effort apply, matching this phase's settled recommendation.
 */
export function checkSuggestionApplies(input: {
  thread: ForgeReviewThread;
  file: FileDiff;
  /** `null` means the file is untracked or no longer exists locally. */
  localContent: string | null;
}): SuggestionApplyCheck {
  const { thread, file, localContent } = input;

  if (thread.outdated) return { ok: false, reason: 'this thread is no longer part of the diff' };
  if (localContent === null) {
    return { ok: false, reason: 'the file no longer exists locally' };
  }

  const range = suggestionLineRange(thread);
  if (range === null) return { ok: false, reason: 'not applicable to this thread' };

  const expected = expectedRightSideText(file, range.start, range.end);
  const localLines = splitLines(localContent);
  const localSlice =
    range.start >= 1 && range.end <= localLines.length
      ? localLines.slice(range.start - 1, range.end).join('\n')
      : null;

  if (expected === null || localSlice === null || localSlice !== expected) {
    return { ok: false, reason: 'this file has changed since the suggestion was written' };
  }
  return { ok: true };
}

/**
 * The new file content Apply would write: the suggestion's own text spliced
 * over the resolved line range, everything else untouched.
 *
 * Rejoined with whichever line ending `localContent` actually uses — a CRLF
 * checkout stays CRLF. `splitLines` strips `\r` so the splice math is never
 * thrown off by it, but joining the result with a bare `\n` regardless would
 * silently convert every OTHER line in the file too, not just the touched
 * range; that is a bigger, more surprising blast radius than the line-ending
 * fidelity of the suggestion's own new lines, which is the one open question
 * Theme E leaves for a human (a real GitHub payload's line endings, unlike a
 * fixture's, can't be asserted against here).
 */
export function spliceSuggestion(
  localContent: string,
  range: { start: number; end: number },
  suggestion: string,
): string {
  const eol = localContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = splitLines(localContent);
  const before = lines.slice(0, range.start - 1);
  const after = lines.slice(range.end);
  return [...before, ...suggestion.split('\n'), ...after].join(eol);
}
