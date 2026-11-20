// Window width classes (Phase 146 L6): compact < 600dp, medium 600 to 899, expanded >= 900.
import { useWindowDimensions } from 'react-native';

export type LayoutClass = 'compact' | 'medium' | 'expanded';

export const MEDIUM_MIN = 600;
export const EXPANDED_MIN = 900;
/** Sheets are capped at this width and centred once the window is wider than compact. */
export const SHEET_MAX_WIDTH = 560;

export function layoutClassFor(width: number): LayoutClass {
  if (width >= EXPANDED_MIN) return 'expanded';
  if (width >= MEDIUM_MIN) return 'medium';
  return 'compact';
}

export function useLayoutClass(): LayoutClass {
  return layoutClassFor(useWindowDimensions().width);
}
