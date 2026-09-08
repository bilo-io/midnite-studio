import type { ReactNode } from 'react';

export type ContainerProps = {
  children: ReactNode;
  /** Appended, so a caller can widen, narrow or re-align without a wrapper. */
  className?: string;
};

/**
 * The horizontal measure, and the only place it is decided.
 *
 * Every section's content sits in one of these, so the site has a single column
 * width and a single gutter — change them here and the whole page moves
 * together. `Section` already wraps its children in one, so a section component
 * needs a `Container` of its own only when it wants a *second* measure inside
 * the first (a narrow prose column next to a full-width figure, say).
 */
export const Container = ({ children, className = '' }: ContainerProps) => (
  <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>
);
