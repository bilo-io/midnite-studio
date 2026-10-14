import type { IconType } from 'react-icons';
import { LuCode } from 'react-icons/lu';
import {
  PiGameControllerFill,
  PiGlobeFill,
  PiMonitorPlayFill,
  PiPaletteFill,
  PiRobotFill,
  PiRocketLaunchFill,
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
 * 2 px stroke breaks up. Coder is the one exception, by choice: Lucide's outline
 * `</>` says "code" more plainly than Phosphor's filled version.
 */
export const APP_GLYPHS: Record<AppId, IconType> = {
  agents: PiRobotFill,
  // The outline `</>` reads better than Phosphor's filled code-in-a-square.
  coder: LuCode,
  gamer: PiGameControllerFill,
  creator: PiPaletteFill,
  media: PiMonitorPlayFill,
  browser: PiGlobeFill,
  cleaner: PiSparkleFill,
  studio: PiRocketLaunchFill,
};

/**
 * The launcher's own mark — a grid of apps, on the moon in Studio's former
 * purple. Drawn top-left in the title bar and built into the launcher's
 * `resources/icon.icns`.
 */
export const LAUNCHER_GLYPH: IconType = PiSquaresFourFill;
export const LAUNCHER_ACCENT = '#a855f7';
