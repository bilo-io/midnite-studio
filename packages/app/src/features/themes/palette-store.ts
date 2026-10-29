import { createPaletteStore } from '@midnite/studio-frame';

import type { StudioPalette } from './theme-types';

// The store itself lives in the frame (Phase 123 Theme L.2); the app only supplies its palette type.
export const usePaletteStore = createPaletteStore<StudioPalette>();
export type { PaletteState } from '@midnite/studio-frame';
