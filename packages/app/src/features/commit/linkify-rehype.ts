import type { Element, Root, RootContent, Text } from 'hast';

import { segment, type Segment } from './linkify';

/**
 * Elements whose text is not prose and must never be linkified.
 *
 * `code` and `pre` are the phase doc's named false-positive case: a bare 7-hex
 * word inside a fence is a code sample, and rewriting it would both mislead and
 * corrupt the sample. `a` is here because remark-gfm's autolink extension has
 * already turned bare URLs into anchors by the time this runs — walking into one
 * would nest an `<a>` inside an `<a>`, which React renders and browsers repair
 * by silently splitting the element.
 */
const OPAQUE = new Set(['code', 'pre', 'a', 'kbd', 'samp']);

/** Where a `#123` points, or null when this repo has no forge remote. */
export type IssueResolver = (issue: number) => string | null;

export type LinkifyOptions = {
  /**
   * Resolved by the caller, because the answer depends on the repo's remotes and
   * this plugin is pure. Absent or returning null means `#123` stays plain text
   * — the phase doc's requirement that a repo with no remote degrade rather than
   * invent a link that 404s.
   */
  issueUrl?: IssueResolver | undefined;
};

/**
 * Data attribute carrying a matched sha to the React component layer.
 *
 * A sha is not a URL — activating one selects a commit inside the app — so it
 * cannot be an `<a href>`. It is emitted as a `<button>`, which is the element
 * that means "does something here", and is focusable and Enter/Space-activated
 * without any work. `commit-message.tsx` maps `button` to the control that reads
 * this attribute.
 */
export const SHA_ATTR = 'data-mstudio-sha';

/**
 * A rehype plugin turning references in text into elements.
 *
 * Runs on hast rather than mdast on purpose. At the hast stage remark-gfm's
 * autolinking has already happened and code spans are real `code` elements, so
 * "don't linkify inside code" is an ancestor test rather than a lookaround in a
 * regex — which is the difference between a rule that is obviously right and one
 * that is a maintenance liability.
 *
 * The walk is written out rather than delegated to `unist-util-visit` because
 * the rule is about ANCESTRY, not parentage. `visit` hands the visitor only the
 * immediate parent, so `a > strong > text` — which is what a markdown link with
 * a bold label produces — passes an `OPAQUE.has(parent.tagName)` test and gets
 * linkified inside the anchor. The result is a control nested in a link: one
 * click fires both, so `[**deadbeef1**](https://evil.example)` in a commit
 * message would select a commit AND open the URL. Recursing with a flag is
 * simpler than reaching for `visit-parents` and rebuilding the index.
 */
export function rehypeLinkify(options: LinkifyOptions = {}) {
  return (tree: Root): void => {
    walk(tree, false, options);
  };
}

/**
 * Rewrite the text children of one node.
 *
 * `opaque` is inherited: once inside a `code`, `pre` or `a`, every descendant is
 * off limits regardless of what sits between.
 */
function walk(node: Root | Element, opaque: boolean, options: LinkifyOptions): void {
  const children: RootContent[] = [];
  let changed = false;

  for (const child of node.children) {
    if (child.type === 'element') {
      walk(child, opaque || OPAQUE.has(child.tagName), options);
      children.push(child);
      continue;
    }

    if (child.type !== 'text' || opaque) {
      children.push(child);
      continue;
    }

    const segments = segment(child.value);
    // One text segment means nothing matched. Reusing the existing node matters
    // for more than speed: replacing it with an identical copy on every render
    // would defeat React's reconciliation for the whole message.
    if (segments.length === 1 && segments[0]?.kind === 'text') {
      children.push(child);
      continue;
    }

    changed = true;
    for (const seg of segments) children.push(toNode(seg, options));
  }

  if (changed) node.children = children as typeof node.children;
}

/** One segment as a hast node. An unresolvable reference stays a text node. */
function toNode(seg: Segment, options: LinkifyOptions): RootContent {
  switch (seg.kind) {
    case 'text':
      return text(seg.value);

    case 'url':
      return anchor(seg.href, seg.value);

    case 'email':
      // Through the same guarded channel as an http link — `mailto:` is on
      // main's allow-list precisely so trailer emails need no second route.
      return anchor(`mailto:${seg.address}`, seg.value);

    case 'sha':
      return {
        type: 'element',
        tagName: 'button',
        properties: { type: 'button', [SHA_ATTR]: seg.value },
        children: [text(seg.value)],
      } satisfies Element;

    case 'issue': {
      const href = options.issueUrl?.(seg.number) ?? null;
      // No forge, no link. The text is preserved exactly as written rather than
      // dropped, which is the whole point of degrading here.
      return href === null ? text(seg.value) : anchor(href, seg.value);
    }
  }
}

const text = (value: string): Text => ({ type: 'text', value });

const anchor = (href: string, label: string): Element => ({
  type: 'element',
  tagName: 'a',
  properties: { href },
  children: [text(label)],
});
