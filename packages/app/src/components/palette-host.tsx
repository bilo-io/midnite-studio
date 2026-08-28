import { useMemo, type ReactNode } from 'react';

import { Palette } from './palette';
import { usePaletteStore, type PaletteMode } from '../store/palette-store';

/**
 * Shaped after `dialog-host.tsx`: one place mounted once in `app.tsx` that
 * owns the surface and hands callers an imperative `open`/`close`, rather than
 * every command handler and title-bar button reaching into store internals
 * directly.
 *
 * Unlike `DialogHost`, the open/closed bit itself lives in `palette-store.ts`
 * (zustand), not local `useState` behind a Context — `use-keybindings.ts`
 * needs to read it from outside React entirely. `usePalette()` is a thin
 * wrapper for API parity with `useDialogs()`, not a second source of truth.
 */
export type PaletteApi = {
  open: (mode?: PaletteMode) => void;
  close: () => void;
};

export function usePalette(): PaletteApi {
  const open = usePaletteStore((s) => s.open);
  const close = usePaletteStore((s) => s.close);
  return useMemo(() => ({ open, close }), [open, close]);
}

export function PaletteHost({ children }: { children: ReactNode }) {
  const isOpen = usePaletteStore((s) => s.isOpen);
  return (
    <>
      {children}
      {isOpen ? <Palette /> : null}
    </>
  );
}
