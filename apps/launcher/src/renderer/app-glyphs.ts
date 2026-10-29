import type { IconType } from 'react-icons';
import { LuCode } from 'react-icons/lu';
import {
  PiBrainFill,
  PiBuildingsFill,
  PiCalculatorFill,
  PiCameraFill,
  PiChartLineUpFill,
  PiFlaskFill,
  PiGameControllerFill,
  PiGlobeFill,
  PiHeartbeatFill,
  PiMonitorPlayFill,
  PiPaletteFill,
  PiPlanetFill,
  PiPulseFill,
  PiRobotFill,
  PiRocketLaunchFill,
  PiShieldCheckFill,
  PiSparkleFill,
  PiSquaresFourFill,
  PiVaultFill,
} from 'react-icons/pi';

import type { ModuleId } from '@midnite/studio-shared/modules';

import type { AppId } from '../common/catalog';

/**
 * Each app's glyph, stamped in white over the app's tinted midnite moon by
 * `scripts/generate-app-logos.cjs` (`moon run launcher:logos`).
 *
 * Phosphor's **Fill** weight, not Lucide: Lucide is outline-only, and a solid
 * glyph holds up at tile size over the moon's black-and-colour halves where a
 * 2 px stroke breaks up.
 */
export const APP_GLYPHS: Record<AppId, IconType> = {
  agents: PiRobotFill,
  gamer: PiGameControllerFill,
  media: PiMonitorPlayFill,
  money: PiChartLineUpFill,
  mind: PiBrainFill,
  browser: PiGlobeFill,
  studio: PiRocketLaunchFill,
  science: PiFlaskFill,
  startup: PiBuildingsFill,
  health: PiHeartbeatFill,
  vanguard: PiShieldCheckFill,
};

/**
 * Each module's glyph, drawn on its chip (Phase 124 Theme F). A host's own module wears its app's
 * glyph; an absorbed app keeps the one it had as an app, so a Coder chip still reads as Coder.
 */
export const MODULE_GLYPHS: Record<ModuleId, IconType> = {
  agents: PiRobotFill,
  // The outline `</>` reads better than Phosphor's filled code-in-a-square.
  coder: LuCode,
  creator: PiPaletteFill,
  media: PiMonitorPlayFill,
  gamer: PiGameControllerFill,
  vanguard: PiShieldCheckFill,
  vault: PiVaultFill,
  cleaner: PiSparkleFill,
  monitor: PiPulseFill,
  mind: PiBrainFill,
  capture: PiCameraFill,
  money: PiChartLineUpFill,
  accountant: PiCalculatorFill,
  science: PiFlaskFill,
  simulator: PiPlanetFill,
  browser: PiGlobeFill,
  studio: PiRocketLaunchFill,
};

/**
 * The launcher's own mark — a grid of apps on the moon, in the brand gradient
 * like Studio (it is the suite's front door, not one app in it). Drawn top-left
 * in the title bar and built into the launcher's `resources/icon.icns`.
 * `LAUNCHER_ACCENT` is only the fallback a single-colour surface would use.
 */
export const LAUNCHER_GLYPH: IconType = PiSquaresFourFill;
export const LAUNCHER_ACCENT = '#a855f7';
