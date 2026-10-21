import { laneColor } from './lane-colors';
import type { PaletteStyle } from './graph-themes';

/**
 * The colours of the inline diff views' divider: the lane colour of the row the
 * panel hangs under, fading into the colour of the row below it. Uses the same
 * palette the graph paints its lanes with, so the rule reads as the lane it
 * belongs to carrying on into the next.
 */
export function dividerColors(
  colorIdx: number,
  belowColorIdx: number | undefined,
  palette: PaletteStyle,
): { from: string; to: string } {
  return {
    from: laneColor(colorIdx, palette),
    to: laneColor(belowColorIdx ?? colorIdx, palette),
  };
}
