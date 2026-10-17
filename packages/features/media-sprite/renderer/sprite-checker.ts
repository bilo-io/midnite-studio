import type { CSSProperties } from 'react';

/**
 * The transparency checker behind sprite frames (Phase 106 Theme G): 8 px squares of `#cfcfcf` and
 * `#ffffff`, fixed in both themes so a frame's own colours read the same in light and dark.
 */
export const SPRITE_CHECKER: CSSProperties = { background: 'repeating-conic-gradient(#cfcfcf 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px' };
