import { useEffect } from 'react';

import {
  applyAccent,
  applyBackground,
  applyDensity,
  applyEffects,
  applyMotion,
  applyShimmerDirection,
  applyUiFont,
  BACKGROUND_PATTERN_DEFAULT,
  BG_INTENSITY_DEFAULT,
  DEFAULT_EFFECTS,
} from '@bilo-io/shell';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Appearance preferences, mirroring `@bilo-io/shell`'s appearance runtime.
 *
 * The shell has always shipped seven appliers and a 500-line stylesheet keyed on
 * the attributes they set; until now the app called exactly one of them
 * (`applyMotion`, from the OS media query). This store is the missing half —
 * the values, persisted, and one effect that pushes them at the DOM.
 *
 * The types are re-declared rather than imported: the shell exports them from
 * its `contracts` module but its `exports` map exposes only `.` and
 * `./appearance.css`, so there is no legal deep import. The appliers themselves
 * come from the package entry and will reject a drifted value at the type level.
 */
export type AccentId =
  | 'default'
  | 'blue'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange';
export type Motion = 'system' | 'reduced' | 'full';
export type Density = 'comfortable' | 'compact';
export type UiFont = 'system' | 'grotesk' | 'humanist' | 'serif' | 'mono';
export type BgIntensity = 'subtle' | 'balanced' | 'bold';
export type ShimmerDirection = 'ltr' | 'rtl';
export type VisualEffects = { pageReveal: boolean; typewriter: boolean; glass: boolean };

export type AppearanceState = {
  accent: AccentId;
  motion: Motion;
  density: Density;
  uiFont: UiFont;
  background: string;
  bgIntensity: BgIntensity;
  effects: VisualEffects;
  shimmer: ShimmerDirection;

  setAccent: (accent: AccentId) => void;
  setMotion: (motion: Motion) => void;
  setDensity: (density: Density) => void;
  setUiFont: (font: UiFont) => void;
  setBackground: (pattern: string) => void;
  setBgIntensity: (intensity: BgIntensity) => void;
  setEffect: (key: keyof VisualEffects, on: boolean) => void;
  setShimmer: (dir: ShimmerDirection) => void;
};

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      accent: 'default',
      motion: 'system',
      density: 'comfortable',
      uiFont: 'system',
      background: BACKGROUND_PATTERN_DEFAULT,
      bgIntensity: BG_INTENSITY_DEFAULT,
      effects: DEFAULT_EFFECTS,
      shimmer: 'ltr',

      setAccent: (accent) => set({ accent }),
      setMotion: (motion) => set({ motion }),
      setDensity: (density) => set({ density }),
      setUiFont: (uiFont) => set({ uiFont }),
      setBackground: (background) => set({ background }),
      setBgIntensity: (bgIntensity) => set({ bgIntensity }),
      setEffect: (key, on) => set((s) => ({ effects: { ...s.effects, [key]: on } })),
      setShimmer: (shimmer) => set({ shimmer }),
    }),
    {
      // The shell's own key, and its pre-paint init script reads this shape —
      // sharing it means a future no-flash script needs no translation layer.
      name: 'midnite.settings',
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppearanceState>;
        // Field-wise, so a payload predating a new effect gains it from the
        // defaults rather than leaving it undefined — which `applyEffects`
        // would read as "disabled".
        return { ...current, ...saved, effects: { ...current.effects, ...saved.effects } };
      },
    },
  ),
);

/**
 * Push every preference at the DOM.
 *
 * One effect for all seven rather than one per applier: they write to the same
 * `<html>` element, and a single subscription means a hydration or a reset
 * cannot leave half the attributes from the old state and half from the new.
 *
 * `motion: 'system'` is resolved by the shell itself via its per-effect media
 * queries, so it is passed through rather than pre-resolved here — unlike the
 * boot-time call in `app.tsx`, which had no user preference to defer to.
 */
export function useAppearanceSync(): void {
  const state = useAppearanceStore();

  useEffect(() => {
    applyAccent({ kind: 'solid', swatch: state.accent });
    applyMotion(state.motion);
    applyDensity(state.density);
    applyUiFont(state.uiFont);
    applyBackground(state.background as never, state.bgIntensity);
    applyEffects(state.effects);
    applyShimmerDirection(state.shimmer);
  }, [state]);
}
