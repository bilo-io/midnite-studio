import type { IconType } from 'react-icons';
import { LuBot, LuCode, LuGamepad2, LuGlobe, LuLayoutGrid, LuPalette, LuSparkles } from 'react-icons/lu';

import type { AppId } from '../common/catalog';

/**
 * Each app's glyph. One map for both places it is drawn: the UI's `AppIcon`,
 * and `scripts/generate-app-logos.cjs`, which stamps it in white over the
 * app's tinted midnite moon (`assets/app-logos/`).
 */
export const APP_GLYPHS: Record<AppId, IconType> = {
  agents: LuBot,
  coder: LuCode,
  gamer: LuGamepad2,
  creator: LuPalette,
  browser: LuGlobe,
  cleaner: LuSparkles,
  studio: LuLayoutGrid,
};
