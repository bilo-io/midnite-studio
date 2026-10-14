import type { IconType } from 'react-icons';
import {
  PiCodeFill,
  PiGameControllerFill,
  PiGlobeFill,
  PiMonitorPlayFill,
  PiPaletteFill,
  PiRobotFill,
  PiSparkleFill,
  PiSquaresFourFill,
} from 'react-icons/pi';

import type { AppId } from '../common/catalog';

/**
 * Each app's glyph, stamped in white over the app's tinted midnite moon by
 * `scripts/generate-app-logos.cjs` (`moon run launcher:logos`).
 *
 * Phosphor's **Fill** weight, not Lucide: Lucide is outline-only, and a solid
 * glyph holds up at tile size over the moon's black-and-colour halves where a
 * 2 px stroke breaks up. Phosphor has a filled weight for every glyph, so all
 * eight stay in one family.
 */
export const APP_GLYPHS: Record<AppId, IconType> = {
  agents: PiRobotFill,
  coder: PiCodeFill,
  gamer: PiGameControllerFill,
  creator: PiPaletteFill,
  media: PiMonitorPlayFill,
  browser: PiGlobeFill,
  cleaner: PiSparkleFill,
  studio: PiSquaresFourFill,
};
