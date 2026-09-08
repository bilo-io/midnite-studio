import type { ComponentType } from 'react';

/**
 * The shape a section stores an icon in.
 *
 * Declared structurally rather than as react-icons' own `IconType` for the
 * same reason the renderer's `IconComponent` is: a section's content table
 * should be able to hold a set glyph or a hand-drawn one without the type
 * naming a package. Every `react-icons/lu` component satisfies it — its props
 * are all optional — so `{ Icon: LuGitBranch }` type-checks with no cast.
 */
export type Glyph = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
