import type { ReactNode } from 'react';

export type EyebrowProps = { children: ReactNode; className?: string };

/**
 * The small, spaced label above a heading — a category, not a sentence.
 *
 * Rendered as a `<p>` and not a heading level: it is decoration for the reader
 * and would otherwise put an empty rung in the document outline.
 */
export const Eyebrow = ({ children, className = '' }: EyebrowProps) => (
  <p
    className={`text-xs font-semibold uppercase tracking-[0.18em] text-accent ${className}`}
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
};

/**
 * A heading at a fixed size per level, so two sections written by two people
 * cannot disagree about what a section title looks like.
 *
 * The level is the *document* level and the size follows from it; there is no
 * prop to render an `<h2>` at `<h3>` size. If a section needs a smaller title
 * it wants `level={3}`, which is a statement about the outline too.
 */
export const Heading = ({ children, level = 2, className = '', id }: HeadingProps) => {
  const Tag = (['h1', 'h2', 'h3'] as const)[level - 1] ?? 'h2';
  const size =
    level === 1
      ? 'text-4xl sm:text-6xl font-semibold tracking-tight'
      : level === 2
        ? 'text-2xl sm:text-4xl font-semibold tracking-tight'
        : 'text-lg sm:text-xl font-semibold';

  return (
    <Tag id={id} className={`text-fg ${size} ${className}`}>
      {children}
    </Tag>
  );
};

export type LedeProps = { children: ReactNode; className?: string };

/**
 * The paragraph directly under a `Heading`. Capped at `max-w-prose` because a
 * 1152px-wide line of body copy is unreadable however good the typeface is.
 */
export const Lede = ({ children, className = '' }: LedeProps) => (
  <p className={`max-w-prose text-base leading-relaxed text-fg-muted sm:text-lg ${className}`}>
    {children}
  </p>
);
