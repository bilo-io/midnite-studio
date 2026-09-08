import type { ReactNode } from 'react';

export type GlowVariant = 'accent' | 'soft' | 'lane';

export type GlowCardProps = {
  children: ReactNode;
  /**
   * Which token shadow to wear. `soft` is the default because a page of cards
   * that all glow in the accent colour has no accent left.
   */
  glow?: GlowVariant;
  className?: string;
  /** Adds a hover lift. Off by default — only interactive cards should move. */
  interactive?: boolean;
  /** Drops the built-in padding, for a card whose child is a full-bleed image. */
  bare?: boolean;
};

const GLOWS: Record<GlowVariant, string> = {
  accent: 'shadow-glow',
  soft: 'shadow-glow-soft',
  lane: 'shadow-glow-lane',
};

/**
 * A panel with a token glow instead of a border.
 *
 * The "border" is the shadow's first stop — a `0 0 0 1px` ring — rather than a
 * real `border`, so the hairline and the bloom are one property and cannot
 * disagree about colour. That is also why the variants are token references
 * (`--ws-glow-*`) and not utility compositions: the light theme needs a
 * genuinely different shadow, not the dark one at a lower opacity.
 *
 * `interactive` is opt-in on purpose. A card that lifts under the cursor is
 * promising a click; a card that lifts and does nothing is a bug the visitor
 * has to discover by trying.
 */
export const GlowCard = ({
  children,
  glow = 'soft',
  className = '',
  interactive = false,
  bare = false,
}: GlowCardProps) => (
  <div
    className={[
      'rounded-lg bg-bg-elevated',
      bare ? 'overflow-hidden' : 'p-6',
      GLOWS[glow],
      interactive ? 'transition duration-base hover:-translate-y-0.5 hover:shadow-glow' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {children}
  </div>
);
