import { AbsoluteFill, useCurrentFrame } from "remotion";

import { RAINBOW, THEME, type Theme } from "./brand";

/**
 * A few motes of brand-coloured light drifting across the stage.
 *
 * For a section that has no picture in it and must not be a flat panel — the
 * build-up, where the music is doing the work and the screen is a held colour.
 * "A few" is the specification and it is load-bearing: this is the background
 * behind a title, and past a couple of dozen it stops being atmosphere and
 * becomes a screensaver competing with the type.
 *
 * ── Deterministic, without a random number in sight at render time ──────────
 *
 * Every mote's position is a closed-form function of its index and the frame,
 * so there is no state, no effect, no seeded generator to thread through, and
 * scrubbing backwards in Studio runs it backwards. The variety comes from
 * dressing each index with irrational multipliers: the drift periods are
 * incommensurable (√2- and φ-ish ratios), so two motes that start near each
 * other never fall into step, which is the thing that gives a particle field
 * away as a loop.
 *
 * ── Why they are blurred discs and not sprites ──────────────────────────────
 *
 * A crisp dot on a 1920×1080 stage is one pixel of aliasing away from looking
 * like a dead pixel, and a large crisp dot reads as a bullet point. A disc with
 * a radial falloff is a bloom, which is what a mote of light in a video is.
 */
export const Particles: React.FC<{
  /** How many motes. Default 18 — "a few", at 1920×1080. */
  count?: number;
  /** Which stage they sit on; picks the ramp that is legible against it. */
  theme?: Theme;
  /** Overall strength, 0–1. Default 0.5. */
  intensity?: number;
  /** Multiplies every drift speed. Default 1. */
  speed?: number;
}> = ({ count = 18, theme = "dark", intensity = 0.5, speed = 1 }) => {
  const frame = useCurrentFrame();
  const ramp = theme === "dark" ? RAINBOW : THEME.light.RAINBOW;

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        /*
          Index → a spread of starting positions. The golden-ratio conjugate
          (0.6180339887) is the standard low-discrepancy step: successive
          indices land as far as possible from every index before them, so 18
          motes cover the frame evenly without any of them being placed by hand
          and without the clumping a random draw would give at this count.
        */
        const x = ((i * 0.6180339887) % 1) * 112 - 6;
        const y = ((i * 0.4142135624) % 1) * 112 - 6;

        /* Periods in frames, deliberately not multiples of each other. */
        const px = 210 + (i % 5) * 37;
        const py = 170 + (i % 7) * 29;
        const drift = speed * (0.6 + ((i * 7) % 5) / 6);

        const dx = Math.sin((frame / px + i * 0.37) * Math.PI * 2) * 7 * drift;
        const dy = Math.cos((frame / py + i * 0.61) * Math.PI * 2) * 5 * drift;

        /*
          A slow breath on opacity, offset per mote, so the field is never
          uniformly bright — which is what makes 18 static discs read as a
          pattern rather than as air.
        */
        const breath = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((frame / (240 + i * 13) + i) * Math.PI * 2));
        const size = 44 + ((i * 13) % 9) * 22;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x + dx}%`,
              top: `${y + dy}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              opacity: intensity * breath * (theme === "dark" ? 0.5 : 0.28),
              filter: `blur(${size * 0.42}px)`,
              backgroundColor: ramp[i % ramp.length],
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
