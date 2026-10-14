import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { PageWindowRole } from '@midnite/studio-shared';

import type { ConfirmRequest, FrameDialogs, IconButtonProps } from './types';

/**
 * The frame's chrome port — Phase 113 Theme C's seam for chrome that belongs
 * to the frame but is still implemented inside `packages/app`.
 *
 * `IconButton`, `ConfirmDialog`, the dialog host and the page-detach mark are
 * frame chrome by the placement map, but each sits on a tangle of app state
 * (`use-dismiss` counts occluders in `ui-store`; the detach mark reads
 * `detachedPages`; `DialogHost` owns the context menu stack). Moving them for
 * real is later work. Until then a feature reaches them through this port
 * rather than by importing the app — which the layer rules forbid — and the
 * composing app installs its implementations once, at the root:
 *
 *   <FrameChromeProvider chrome={studioChrome}>…</FrameChromeProvider>
 *
 * Each member's props are typed in `types.ts`, and the app's components take
 * their props from there too, so an implementation that stops fitting the port
 * fails `typecheck` in the app. A member leaves this port the day its
 * implementation moves into the frame; the port shrinks to nothing, it never
 * grows into a service locator. Add a member only for chrome a feature
 * actually renders.
 */
export type FrameChrome = {
  IconButton: ComponentType<IconButtonProps>;
  ConfirmDialog: ComponentType<{ request: ConfirmRequest; onCancel: () => void }>;
  /** A hook — call it at the top of a component, like any other. */
  useDialogs: () => FrameDialogs;
  PageDetachMark: ComponentType<{ role: PageWindowRole }>;
};

const FrameChromeContext = createContext<FrameChrome | null>(null);

export function FrameChromeProvider({ chrome, children }: { chrome: FrameChrome; children: ReactNode }) {
  return <FrameChromeContext.Provider value={chrome}>{children}</FrameChromeContext.Provider>;
}

/**
 * The installed chrome. Throws without a provider: rendering a feature outside
 * a composed app is a wiring bug, and a silent fallback (a plain `<button>`
 * standing in for `IconButton`) would ship it.
 */
export function useFrameChrome(): FrameChrome {
  const chrome = useContext(FrameChromeContext);
  if (!chrome) throw new Error('useFrameChrome must be used inside <FrameChromeProvider>');
  return chrome;
}
