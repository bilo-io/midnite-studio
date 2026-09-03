import { useEffect, useState } from 'react';

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
 * `'system'`, resolved against the OS query directly — Phase 46 Theme E.
 *
 * This app's own CSS keys its reduced-motion guards on the literal
 * `'reduced'`/`'full'` strings `data-motion` can carry (see `styles.css`'s
 * single dialect after this phase); a literal `'system'` attribute value
 * matches none of them, regardless of what the OS actually asks for. The
 * shell's own effects resolve `'system'` themselves via per-effect media
 * queries, but this app's guards predate that convention and were built
 * against a resolved value — so `'system'` has to become one before it
 * reaches `applyMotion`, here and in `useMotionPreference` (`app.tsx`) alike.
 */
export function resolveSystemMotion(): 'reduced' | 'full' {
  if (typeof matchMedia !== 'function') return 'full';
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
}

/**
 * The live, resolved motion preference — `'reduced'` or `'full'`, `'system'`
 * already turned into whichever the OS is currently asking for.
 *
 * For components CSS cannot reach: `data-motion` drives every `@media`/
 * attribute guard in `styles.css`, but a canvas `requestAnimationFrame` loop
 * (`NeuroCloudBackground`) makes its own frame-by-frame decision in JS, and
 * nothing about the DOM attribute is visible from there. This is that
 * decision, exposed as a hook rather than re-derived per consumer — the same
 * `resolveSystemMotion` this file's `useAppearanceSync` uses, kept live
 * against OS changes for as long as the stored preference stays `'system'`.
 */
export function useResolvedMotion(): 'reduced' | 'full' {
  const motion = useAppearanceStore((s) => s.motion);
  const [osReduced, setOsReduced] = useState(() => resolveSystemMotion() === 'reduced');

  useEffect(() => {
    if (motion !== 'system' || typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setOsReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [motion]);

  return motion === 'system' ? (osReduced ? 'reduced' : 'full') : motion;
}

/**
 * Push every preference at the DOM.
 *
 * One effect for all seven rather than one per applier: they write to the same
 * `<html>` element, and a single subscription means a hydration or a reset
 * cannot leave half the attributes from the old state and half from the new.
 *
 * This is the sole writer of `data-motion` once a value is settled: an
 * explicit `full`/`reduced` choice is applied verbatim; `'system'` is
 * resolved against the OS query right here, on every re-run (including the
 * one triggered by switching *back* to `'system'` in Settings, which must
 * not wait for the next OS `change` event to reflect the current OS state).
 * `useMotionPreference`'s OS listener in `app.tsx` only ever touches the
 * attribute while the stored preference is `'system'`, so the two writers
 * agree rather than racing — see its own comment for that half.
 */
export function useAppearanceSync(): void {
  const state = useAppearanceStore();

  useEffect(() => {
    applyAccent({ kind: 'solid', swatch: state.accent });
    applyMotion(state.motion === 'system' ? resolveSystemMotion() : state.motion);
    applyDensity(state.density);
    applyUiFont(state.uiFont);
    applyBackground(state.background as never, state.bgIntensity);
    applyEffects(state.effects);
    applyShimmerDirection(state.shimmer);
  }, [state]);
}
