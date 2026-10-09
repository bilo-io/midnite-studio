import { interpolate } from "remotion";

/**
 * One stage replacing another, horizontally, with a liquid edge.
 *
 * This is the transition between the acts of a film that changes surface: a
 * panel of the incoming background crossing the frame, its leading edge
 * dissolved into smoke rather than ruled, and a band of brand light riding the
 * front of it. Not a crossfade — a crossfade between two flat backgrounds is
 * indistinguishable from the stage simply changing colour, and the brief's word
 * for this was "as if a slide replaced the background".
 *
 * At `progress: 1` the incoming background covers the frame completely and
 * keeps covering it, so these stack: paint the first stage, then leave one of
 * these mounted per change with its progress saturated, and the film's whole
 * sequence of surfaces is the stack read bottom to top. Leaving them all mounted
 * is free — a landed wipe short-circuits to a flat fill and an unstarted one to
 * nothing at all, for the reason written out beside the check.
 *
 * ── What makes the edge liquid ──────────────────────────────────────────────
 *
 * `feTurbulence` into `feDisplacementMap`, which is the only way to get a
 * genuinely irregular edge that is still a pure function of the frame. The
 * alternatives both fail one half of that: a canvas noise field needs an effect
 * hook and a mutable context, which is the one thing every component here
 * avoids, and a hand-drawn SVG path is deterministic but is the same edge every
 * time and reads as a shape rather than as a fluid.
 *
 * Three things have to be true together or it reads as torn paper instead:
 *
 *   1. **the edge is a gradient, not a line.** The panel fades out over `SMOKE`
 *      pixels before it ends. Displacing a hard edge gives you a jagged hard
 *      edge; displacing a soft one gives you smoke, because the displacement is
 *      then moving *opacity* around rather than a boundary.
 *   2. **the noise crawls.** `baseFrequency` is nudged by `progress`, so
 *      successive frames are different fields rather than one field sliding
 *      past. A static field translated across the screen reads as a texture on
 *      a moving object, which is exactly what this is not.
 *   3. **two octaves of scale.** A single displacement scale gives one size of
 *      wobble. The second, finer, differently-seeded layer is what puts detail
 *      in the tendrils at the front.
 *
 * ── Why everything here is in pixels ────────────────────────────────────────
 *
 * The first version of this was written in percentages and never finished its
 * wipe: `translateX` resolves a percentage against the *element's own* width,
 * the mask's stops resolve against it too, and the frame's width is a third
 * quantity — so the panel arrived with its smoke band still over the last
 * sixth of the screen and the outgoing stage showing through it. A fixed
 * 1920×1080 stage does not need the indirection. `stage` is a prop only so this
 * does not quietly assume 1080p forever.
 *
 * ── Why the filter is declared inline, and `id` is required ─────────────────
 *
 * An SVG filter is addressed by `url(#id)`, which is document-global, so two of
 * these on one stage would silently share whichever definition rendered last —
 * and since the whole point is that consecutive wipes differ, that failure
 * would look like the transition "not working" rather than like an id collision.
 */

/* ── Geometry, shared by the wipe and by anything standing on top of it ────── */

/** The stage a wipe crosses, when nothing says otherwise. */
const STAGE = { width: 1920, height: 1080 } as const;

/**
 * How many pixels the panel spends fading out at its leading edge.
 *
 * Generous — a sixth of the frame. The band has to be wider than the
 * displacement can move it, or the displacement punches holes through to the
 * far side and the incoming stage reads as flickering rather than as smoke.
 */
const smokeFor = (width: number): number => Math.round(width * 0.17); // 326 at 1920

/** Displacement of the coarse layer, in px, and of the fine one. */
const BILLOW = 190;
const WISP = 46;

/**
 * How far the panel is extended *behind* its leading edge, and above and below
 * the frame.
 *
 * `BILLOW` of it is not slack, it is the fix for a real artefact: the
 * displacement map moves pixels by up to `BILLOW` in every direction, so a
 * panel whose opaque region ended exactly at the frame's edge had transparency
 * dragged back inside it — which rendered as pale smears down the right-hand
 * side of the *finished* wipe, on every frame after it landed, for the rest of
 * the act. The landed panel therefore overshoots the frame by `BILLOW` on both
 * sides, where there is nothing for the displacement to drag in from.
 */
const OVER = 240 + BILLOW;

/**
 * How much of the incoming stage has reached a given column of the frame:
 * 0 before the smoke gets there, 1 once the panel is opaque over it.
 *
 * ── What this is for ────────────────────────────────────────────────────────
 *
 * Anything drawn *on top of* a wipe and painted in the theme underneath it has
 * to change colour as the wipe passes beneath it — the golive-promo's lockup is
 * the standing example, and getting it wrong is not subtle: a white crescent on
 * 99%-lightness paper is a blank space where the logo should be.
 *
 * That was first done by hand, one interpolation per crossing, timed by reading
 * the geometry off this file and inverting the easing on paper. It was right
 * twice and wrong twice, and it would have gone wrong again on the next wipe
 * added, because the correct frame depends on the wipe's length, its easing,
 * its direction *and* where the object is standing — four things, none of which
 * lives near the number being written.
 *
 * So it is computed instead. The caller passes the same `progress` it passes
 * the wipe and the x it is drawing at, and gets back the blend. It cannot drift
 * from the picture because it is the picture's own arithmetic.
 *
 * The band is `SMOKE + BILLOW` wide: the panel's own gradient plus the furthest
 * the displacement can throw it. Something at the very front of that is over
 * paint that may or may not be there on a given frame, which is why the blend
 * starts there rather than at the opaque edge.
 */
export const wipeCoverage = (
  progress: number,
  x: number,
  direction: 1 | -1 = 1,
  stage: { width: number; height: number } = STAGE,
): number => {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const smoke = smokeFor(stage.width);
  const width = OVER + stage.width + smoke;
  /* Mirrored for a right-to-left wipe, exactly as the element's `scaleX(-1)` is. */
  const at = direction < 0 ? stage.width - x : x;
  const travel = -width + (width + BILLOW) * progress;
  const opaque = travel + stage.width;
  const band = smoke + BILLOW;
  return Math.max(0, Math.min(1, (opaque + band - at) / band));
};

export const LiquidWipe: React.FC<{
  /** A unique id for this wipe's filter. Two on one stage must not share one. */
  id: string;
  /** 0 = nothing of the incoming stage, 1 = all of it, and it stays covered. */
  progress: number;
  /** The incoming background: any CSS `background` value. */
  background: string;
  /** 1 sweeps left-to-right, -1 right-to-left. Default 1. */
  direction?: 1 | -1;
  /**
   * The light riding the front of the wipe. Default off.
   *
   * A colour here draws a soft vertical band at the leading edge — the stage
   * being *pushed* by something rather than just arriving. Give it one of the
   * ramp's stops; anything else stops reading as midnite's.
   */
  accent?: string;
  /** Varies the noise field. Two consecutive wipes should not share one. */
  seed?: number;
  stage?: { width: number; height: number };
}> = ({ id, progress, background, direction = 1, accent, seed = 1, stage = STAGE }) => {
  const SMOKE = smokeFor(stage.width);
  const width = OVER + stage.width + SMOKE;
  /** Where the mask stops being fully opaque, as a fraction of the panel. */
  const solid = (OVER + stage.width) / width;

  /*
    Travel is in pixels of the stage, from fully off the left to `BILLOW` past
    fully across. Both ends are well outside the frame, so neither the hard
    start nor the soft finish is ever visible — and, at rest, the frame sits in
    the middle of the opaque region rather than on its edge.
  */
  const travel = interpolate(progress, [0, 1], [-width, BILLOW]);

  /*
    The noise field is re-sampled as the wipe proceeds by moving `baseFrequency`
    a hair. The range is tiny — what is wanted is a field that *boils*, and a
    bigger sweep reads as the smoke changing scale. Driven by `progress` rather
    than the raw frame, so a wipe is the same animation whatever length it runs.
  */
  const freqX = 0.0088 + progress * 0.0037;
  const freqY = 0.019 + progress * 0.006;

  /*
    ── The two ends are drawn without the filter, and that is a 3× render ──────

    `feTurbulence` is a per-pixel Perlin evaluation: three octaves over a
    2.1-megapixel stage, twice more through `feDisplacementMap`, per wipe, per
    frame. A film that leaves three of these mounted for its whole length — which
    is the *point* of the stacking contract at the top of this file — pays that
    on every frame of every act, for a picture that stopped changing the moment
    the wipe landed.

    It is not a small tax. The golive-promo's first full render sat at 0.85
    frames/second through a stretch with no video in it at all, which is what
    made this visible: the cost could not have been the footage, because there
    was none.

    Both shortcuts are output-identical rather than approximations, which is why
    they are safe to take:

      progress ≤ 0  the panel's leading edge is `width` px left of the frame and
                    the displacement reaches 190, so nothing it could draw is on
                    screen. Render nothing.
      progress ≥ 1  the opaque region spans −240…2110 against a 0…1920 frame, so
                    every pixel inside the frame is fully-opaque `background` and
                    the displacement — which can move a pixel by at most
                    `BILLOW` — has only more opaque background to pull from.
                    A flat fill is the same image.

    Keep the accent band out of the landed case too: its own opacity is already
    0 at progress 1, so it contributes nothing but a blurred 522px layer.
  */
  if (progress <= 0) return null;
  if (progress >= 1)
    return <div style={{ position: "absolute", inset: 0, background, pointerEvents: "none" }} />;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        /*
          Direction is a mirror of the whole thing rather than a second set of
          offsets. The noise is mirrored with it, which costs nothing (it is
          noise) and buys a right-to-left wipe that is provably the same
          animation as the left-to-right one rather than a second implementation
          of it.
        */
        transform: direction < 0 ? "scaleX(-1)" : undefined,
      }}
    >
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter
            id={id}
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${freqX} ${freqY}`}
              numOctaves={3}
              seed={seed}
              result="billow"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="billow"
              scale={BILLOW}
              xChannelSelector="R"
              yChannelSelector="G"
              result="coarse"
            />
            {/*
              The second pass is a *different* field, not the same one at a
              smaller scale — `seed + 1` — because re-displacing by the same
              noise only deepens the folds it already made instead of adding
              detail between them.
            */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${freqX * 4.3} ${freqY * 3.1}`}
              numOctaves={2}
              seed={seed + 1}
              result="wisp"
            />
            <feDisplacementMap
              in="coarse"
              in2="wisp"
              scale={WISP}
              xChannelSelector="G"
              yChannelSelector="B"
            />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          position: "absolute",
          left: -OVER,
          top: -OVER,
          width,
          height: stage.height + OVER * 2,
          transform: `translateX(${travel}px)`,
          filter: `url(#${id})`,
          willChange: "transform",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background,
            WebkitMaskImage: `linear-gradient(90deg, #000 0%, #000 ${solid * 100}%, transparent 100%)`,
            maskImage: `linear-gradient(90deg, #000 0%, #000 ${solid * 100}%, transparent 100%)`,
          }}
        />
        {accent ? (
          /*
            The light on the front. Sits *inside* the filtered element, so it is
            displaced by the same field as the edge it rides — a straight band
            over a liquid edge reads as two unrelated effects.

            It fades out as the wipe lands rather than parking off-frame: the
            panel's leading edge finishes past the right-hand side, so a band
            left at full strength would sit just outside the frame lighting
            nothing, and any later change to `SMOKE` would drag it back in.
          */
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: SMOKE * 1.6,
              opacity: interpolate(progress, [0, 0.12, 0.86, 1], [0, 0.85, 0.85, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              filter: "blur(34px)",
              backgroundImage: `linear-gradient(90deg, transparent, ${accent})`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
};
