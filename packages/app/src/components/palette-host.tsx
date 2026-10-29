import type { ReactNode } from 'react';

import { PaletteHost as FramePaletteHost } from '@midnite/studio-frame';

import { Palette } from './palette';

// Moved to the frame (Phase 123 Theme D) — `packages/frame/src/commands/palette/palette-host.tsx`.
// Studio mounts the frame's host with its own `Palette`, which builds Studio's runtime and its
// repo-bound sources inside itself; `app.tsx` and `detached-root.tsx` keep this import.
export { usePalette, type PaletteApi } from '@midnite/studio-frame';

export function PaletteHost({ children }: { children: ReactNode }) {
  return <FramePaletteHost palette={Palette}>{children}</FramePaletteHost>;
}
