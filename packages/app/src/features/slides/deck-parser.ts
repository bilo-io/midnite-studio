import type { Heading, List, Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { toString as mdastToString } from 'mdast-util-to-string';

/**
 * Headings-only slide deck, ported from midnite's `markdownToDeck`
 * (`~/Dev/midnite/packages/web/lib/slides/markdown.ts`) — an h1 becomes a
 * cover slide, every heading after it starts a new slide, and the content
 * under a heading becomes an ordered array of reveal steps.
 *
 * Unlike the crib, this walks a real mdast tree (`remark-parse` + `remark-gfm`
 * — the same GFM flavour `MarkdownPreview` already renders with) instead of a
 * hand-rolled line tokenizer, and keeps each step as a **raw markdown
 * fragment** — a substring of the source, sliced by the node's own position —
 * rather than pre-rendered HTML. The presenter (Theme B) renders each step
 * through the app's existing `react-markdown` pipeline, so inline formatting,
 * links and code fences all come from the one renderer already used
 * everywhere else markdown appears in the app.
 */

export type DeckStep = {
  /** Raw markdown source for this step — re-rendered through react-markdown, never pre-rendered HTML. */
  markdown: string;
};

export type DeckSlide = {
  title: string;
  steps: DeckStep[];
  cover?: boolean;
};

export type Deck = {
  title: string;
  slides: DeckSlide[];
};

const parser = unified().use(remarkParse).use(remarkGfm);

/** Drop leading section numbering like "1. ", "3.1 ", "2) " from a heading. */
function cleanHeading(text: string): string {
  return text.replace(/^\d+(\.\d+)*[.)]?\s+/, '').trim();
}

/** The exact source text a node spans — its `position` is always present; remark-parse only omits it when `position: false` is set, which this parser never does. */
function sourceOf(source: string, node: RootContent): string {
  const { start, end } = node.position!;
  return source.slice(start.offset, end.offset).trim();
}

function isHeading(node: RootContent): node is Heading {
  return node.type === 'heading';
}

function isList(node: RootContent): node is List {
  return node.type === 'list';
}

/**
 * Steps for one non-heading block. A list contributes one step **per item**
 * (matching the crib's own per-item stepping — `markdownToDeck`'s `list` case
 * calls `addStep` once per `b.items` entry, not once for the whole list) —
 * everything else is one whole-block step, nested sub-lists included.
 */
function stepsFor(source: string, node: RootContent): DeckStep[] {
  if (isList(node)) {
    return node.children.map((item) => ({ markdown: sourceOf(source, item) }));
  }
  return [{ markdown: sourceOf(source, node) }];
}

export function parseDeck(markdown: string): Deck {
  const tree = parser.parse(markdown) as Root;

  const slides: DeckSlide[] = [];
  let deckTitle: string | null = null;
  let current: DeckSlide | null = null;

  for (const node of tree.children) {
    if (isHeading(node)) {
      const text = mdastToString(node).trim();
      if (node.depth === 1 && deckTitle === null) {
        deckTitle = text;
        current = { title: text, steps: [], cover: true };
      } else {
        current = { title: cleanHeading(text), steps: [] };
      }
      slides.push(current);
      continue;
    }
    // Content before the first heading has nowhere to land — matching the
    // crib, which drops it too (`addStep` is a no-op while `cur` is null).
    // The no-headings-at-all fallback below is the one case that keeps it.
    if (current) current.steps.push(...stepsFor(markdown, node));
  }

  if (slides.length === 0) {
    const steps = tree.children.flatMap((node) => stepsFor(markdown, node));
    const title = 'Untitled';
    return { title, slides: [{ title, steps }] };
  }

  return { title: deckTitle ?? slides[0]!.title, slides };
}
