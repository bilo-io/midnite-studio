import { atomOneDark } from './atom-one-dark';
import { githubDark } from './github-dark';
import { githubLight } from './github-light';
import { jetbrainsDarcula } from './jetbrains-darcula';
import { monokai } from './monokai';
import { vscodeDarkPlus } from './vscode-dark-plus';
import type { StudioPalette } from '../theme-types';

export const BUILTIN_PALETTES: readonly StudioPalette[] = [
  githubDark,
  githubLight,
  jetbrainsDarcula,
  atomOneDark,
  vscodeDarkPlus,
  monokai,
];

/** `github-dark` — chosen so a fresh install renders byte-identical to the
 * app's pre-Phase-64 appearance (Decision 1). See `resolve-palette.ts` for
 * how this id (and `github-light`) auto-track the resolved theme mode. */
export const DEFAULT_PALETTE_ID = 'github-dark';

export {
  atomOneDark,
  githubDark,
  githubLight,
  jetbrainsDarcula,
  monokai,
  vscodeDarkPlus,
};
