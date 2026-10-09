import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { RAINBOW } from "./brand";

/**
 * A band of brand light crossing the frame, torn into smoke.
 *
 * The smoky sibling of `SwooshStreak`. Both draw the same object — a raking
 * band of the ramp, skewed, travelling across the stage — and the difference is
 * entirely in the edge: `SwooshStreak` blurs it, which gives a clean airbrushed
 * highlight, and this one runs it through the same `feTurbulence` →
 * `feDisplacementMap` pair `LiquidWipe` uses, which gives a front that breaks up
 * into tendrils and a body that boils as it goes.
 *
 * That matters because the film's *transitions* are liquid. A stage that
 * changes with a smoke wipe and then punctuates every cut inside the act with a
 * hard-edged lens flare is two different visual languages sharing a reel; the
 * brief's own note was that the smoke should be there "almost every time there
 * is a shimmer".
 *
 * ── The three things that make it read as smoke and not as noise ────────────
 *
 *   1. **the band is soft before it is displaced.** Displacing a hard edge
 *      gives a jagged hard edge. The gradient is what turns the displacement
 *      into moving *opacity*, which is what smoke is.
 *   2. **the field crawls.** `baseFrequency` is nudged by the crossing's own
 *      progress, so successive frames sample different fields rather than one
 *      field sliding past — a static field translated across the screen reads
 *      as a texture printed on a moving object.
 *   3. **the displacement is large next to the band.** At a third of the band's
 *      width the front tears open; at a tenth it only looks slightly out of
 *      focus, which is what `SwooshStreak` already does better and cheaper.
 *
 * ── `id` is required, for the same reason it is on `LiquidWipe` ─────────────
 *
 * `url(#id)` is document-global. Two of these on one stage sharing an id would
 * silently share whichever definition rendered last, and since consecutive
 * streaks differ by seed and direction that failure reads as "the effect is not
 * working" rather than as a collision. Key them off the beat they land on.
 *
 * ── Cost, and why it is affordable here and not in a wipe ───────────────────
 *
 * This is the same per-pixel Perlin evaluation that made three mounted
 * `LiquidWipe`s the most expensive thing in the golive-promo's first render.
 * The difference is the mount: a streak exists only inside its own short
 * `<Sequence>` — a dozen frames, a handful of times an act — where a wipe is
 * mounted for the whole film. Two octaves rather than three, and a filter
 * region only a little wider than the band, keep it to what a cut can pay for.
 */
export const SmokeStreak: React.FC<{
  /** A unique id for this streak's filter. Two on one stage must not share one. */
  id: string;
  /** Frames the streak takes to cross. Default 18. */
  durationInFrames?: number;
  /** -1 sweeps right-to-left. Default 1. */
  direction?: 1 | -1;
  /** Peak opacity. Default 0.5. */
  intensity?: number;
  /** Override the ramp with one flat colour. For a monochrome act. */
  tint?: string;
  /** Varies the noise field. Two consecutive streaks should not share one. */
  seed?: number;
}> = ({ id, durationInFrames = 18, direction = 1, intensity = 0.5, tint, seed = 1 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0, 0.1, 1),
  });

  /*
    Travel is in viewport widths and starts fully off-frame on both sides, so
    the band is never seen entering or leaving — only crossing. Wider than
    `SwooshStreak`'s 140 because the displacement throws the tendrils a long way
    ahead of the band and a narrower travel lets them be seen arriving.
  */
  const x = interpolate(t, [0, 1], [-175, 175]);
  const opacity = interpolate(t, [0, 0.25, 0.75, 1], [0, intensity, intensity, 0]);

  /* The field boils rather than slides — see note 2 above. */
  const freqX = 0.006 + t * 0.004;
  const freqY = 0.013 + t * 0.005;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        pointerEvents: "none",
        transform: direction < 0 ? "scaleX(-1)" : undefined,
      }}
    >
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter
            id={id}
            x="-30%"
            y="-12%"
            width="160%"
            height="124%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${freqX} ${freqY}`}
              numOctaves={2}
              seed={seed}
              result="field"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="field"
              scale={170}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          position: "absolute",
          top: "-14%",
          left: "50%",
          width: "34%",
          height: "128%",
          transform: `translateX(${x}%) skewX(-16deg)`,
          opacity,
          /*
            Blurred *before* the displacement, not after: the filter takes this
            element's rendered output as `SourceGraphic`, so the CSS blur is
            already in the pixels the noise field pushes around. That ordering is
            the whole effect — displacing a soft edge is smoke, blurring a
            displaced hard edge is a smudge.
          */
          filter: `blur(26px) url(#${id})`,
          backgroundImage: tint
            ? `linear-gradient(90deg, transparent, ${tint}, transparent)`
            : `linear-gradient(90deg, transparent, ${RAINBOW[2]}, ${RAINBOW[4]}, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};
