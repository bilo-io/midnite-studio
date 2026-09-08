import { Children, type ReactNode } from 'react';

import { TYPE_IN_HEADING_MS, TYPE_IN_LEDE_MS, TypeIn } from './typewriter';

/**
 * `children` reduced to one string, or `null` if it is not plain text.
 *
 * `typeIn` types characters, not markup, so it only applies where `children`
 * is a string (`<Heading level={2}>Title</Heading>`) or a string mixed with a
 * number (`trusted.tsx`'s `{SITE_AGENTS.length} coding agents…`) — `String`
 * over every child and joined is what `{10} coding agents…` already renders as
 * without this. Anything else (an inline `<code>`, a link) falls back to
 * `null` rather than guessing, and the caller renders `children` unchanged —
 * see `download-page.tsx`'s `<Lede>`, which is exactly this case and does not
 * opt in.
 */
const typeInText = (children: ReactNode): string | null => {
  const parts = Children.toArray(children);
  if (!parts.every((part) => typeof part === 'string' || typeof part === 'number')) return null;
  return parts.map(String).join('');
};

export type EyebrowProps = { children: ReactNode; className?: string };

/**
 * The small, spaced label above a heading — a category, not a sentence.
 *
 * Rendered as a `<p>` and not a heading level: it is decoration for the reader
 * and would otherwise put an empty rung in the document outline.
 */
export const Eyebrow = ({ children, className = '' }: EyebrowProps) => (
  <p
    /*
      `w-fit`, because `background-clip: text` clips the ramp to the glyphs but
      paints it across the *box* — and a full-width `<p>` would show a short
      label only the first inch of the gradient. Shrinking the box to the text
      is what runs the whole spectrum through the label.
    */
    className={`ws-rainbow-text w-fit text-xs font-semibold uppercase tracking-[0.18em] ${className}`}
  >
    {children}
  </p>
);

export type HeadingProps = {
  children: ReactNode;
  /** The document level. `1` is reserved for the hero — one per page. */
  level?: 1 | 2 | 3;
  className?: string;
  id?: string;
  /**
   * Types the heading in once it scrolls into view, instead of rendering it
   * whole on mount. Requires plain-text `children` (see `typeInText`) — a
   * `false` default keeps every existing caller, `download-page.tsx` included,
   * rendering exactly as before.
   */
  typeIn?: boolean;
};

/**
 * A heading at a fixed size per level, so two sections written by two people
 * cannot disagree about what a section title looks like.
 *
 * The level is the *document* level and the size follows from it; there is no
 * prop to render an `<h2>` at `<h3>` size. If a section needs a smaller title
 * it wants `level={3}`, which is a statement about the outline too.
 */
export const Heading = ({ children, level = 2, className = '', id, typeIn = false }: HeadingProps) => {
  const Tag = (['h1', 'h2', 'h3'] as const)[level - 1] ?? 'h2';
  const size =
    level === 1
      ? 'text-4xl sm:text-6xl font-semibold tracking-tight'
      : level === 2
        ? 'text-2xl sm:text-4xl font-semibold tracking-tight'
        : 'text-lg sm:text-xl font-semibold';
  const text = typeIn ? typeInText(children) : null;

  return (
    <Tag id={id} className={`text-fg ${size} ${className}`}>
      {text !== null ? <TypeIn text={text} targetMs={TYPE_IN_HEADING_MS} leadMs={0} /> : children}
    </Tag>
  );
};

export type LedeProps = {
  children: ReactNode;
  className?: string;
  /** Types the paragraph in once it scrolls into view. See `Heading`'s own. */
  typeIn?: boolean;
  /**
   * ms to hold before the first character, once in view. Defaults to
   * `TYPE_IN_HEADING_MS`, the right number whenever this `Lede` sits under a
   * `Heading` typing at its own default rate — the heading is finishing right
   * about when the lede would otherwise start, so the two do not race. Pass
   * `0` for a `Lede` with no heading typing above it.
   */
  typeInLeadMs?: number;
};

/**
 * The paragraph directly under a `Heading`. Capped at `max-w-prose` because a
 * 1152px-wide line of body copy is unreadable however good the typeface is.
 */
export const Lede = ({ children, className = '', typeIn = false, typeInLeadMs }: LedeProps) => {
  const text = typeIn ? typeInText(children) : null;

  return (
    <p className={`max-w-prose text-base leading-relaxed text-fg-muted sm:text-lg ${className}`}>
      {text !== null ? (
        <TypeIn text={text} targetMs={TYPE_IN_LEDE_MS} leadMs={typeInLeadMs} />
      ) : (
        children
      )}
    </p>
  );
};
