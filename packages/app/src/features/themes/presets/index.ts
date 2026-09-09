import { atomOneDark } from './atom-one-dark';
import { atomOneLight } from './atom-one-light';
import { ayuLight } from './ayu-light';
import { catppuccinLatte } from './catppuccin-latte';
import { githubDark } from './github-dark';
import { githubLight } from './github-light';
import { jetbrainsDarcula } from './jetbrains-darcula';
import { monokai } from './monokai';
import { rosePineDawn } from './rose-pine-dawn';
import { solarizedLight } from './solarized-light';
import { tokyoNight } from './tokyo-night';
import { vscodeDarkPlus } from './vscode-dark-plus';
import type { StudioPalette } from '../theme-types';

/** 6 dark + 6 light — see `presets.test.ts` for the balance assertion. */
export const BUILTIN_PALETTES: readonly StudioPalette[] = [
  githubDark,
  githubLight,
  jetbrainsDarcula,
  atomOneDark,
  vscodeDarkPlus,
  monokai,
  tokyoNight,
  catppuccinLatte,
  atomOneLight,
  solarizedLight,
  ayuLight,
  rosePineDawn,
];

/** `github-dark` — chosen so a fresh install renders byte-identical to the
 * app's pre-Phase-64 appearance (Decision 1). See `resolve-palette.ts` for
 * how this id (and `github-light`) auto-track the resolved theme mode. */
export const DEFAULT_PALETTE_ID = 'github-dark';

export {
  atomOneDark,
  atomOneLight,
  ayuLight,
  catppuccinLatte,
  githubDark,
  githubLight,
  jetbrainsDarcula,
  monokai,
  rosePineDawn,
  solarizedLight,
  tokyoNight,
  vscodeDarkPlus,
};
