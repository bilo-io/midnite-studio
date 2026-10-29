import { useMemo, type ComponentType, type ReactNode } from 'react';

import { CommandPalette, type CommandPaletteProps } from './palette';
import { usePaletteStore, type PaletteMode } from './palette-store';

/**
 * One place, mounted once per window, that owns the palette surface and hands callers an
 * imperative `open`/`close` (moved to the frame in Phase 123 Theme D).
 *
 * The open/closed bit lives in `palette-store.ts` (zustand), not local state behind a Context —
 * the keybinding dispatcher needs to read it from outside React entirely. `usePalette()` is a thin
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

/**
 * Either the app's `runtime` (and any further `CommandPalette` props) — a suite app's palette, its
 * commands and nothing else — or a whole `palette` component of the app's own, which Studio passes
 * because its palette builds its runtime and its repo-bound sources inside itself.
 */
export type PaletteHostProps = { children: ReactNode } & (CommandPaletteProps | { palette: ComponentType });

export function PaletteHost(props: PaletteHostProps) {
  const isOpen = usePaletteStore((s) => s.isOpen);
  const { children, ...rest } = props;
  let surface: ReactNode = null;
  if (isOpen) {
    if ('palette' in rest) {
      const Palette = rest.palette;
      surface = <Palette />;
    } else {
      surface = <CommandPalette {...rest} />;
    }
  }
  return (
    <>
      {children}
      {surface}
    </>
  );
}
