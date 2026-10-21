import { Easing, interpolate, interpolateColors, useCurrentFrame } from "remotion";

import { LIGHT, RAINBOW } from "../../../../shared/brand";
import { BUILD, STAGE } from "./beats";
import { punchAt, thumpAt } from "./energy";
import { themeMixAt } from "./wipes";

/**
 * The build-up's last three and a half seconds, filled: particles and smoke
 * that gather, implode on the mark, and blow apart on the drop.
 *
 * `EDITORIAL_SCRIPT.md` §9.4. The brief's own words: after "Video Editor," move
 * the logo back to centre and make it "even more ecstatic... additional
 * abstract moving particles and smoke effects in the gradient colours around
 * the logo, which implode before exploding just before the bass drops." The
 * window is `BUILD.breath` (1281) to `STAGE.harness` (1383, the drop) plus a
 * short tail while the mark's `across` leg carries it away — 102 frames of a
 * stage that was deliberately bare (§4: "the most common way to waste a drop").
 *
 * ── The contract with the mark ──────────────────────────────────────────────
 *
 * Agent A is landing a new `MARK.breath` station at the *literal* stage centre
 * — (960, 540), not `MARK.open`'s optically-adjusted position — growing the
 * mark to ~230px across exactly this span. This field converges on that same
 * literal point. It does not read the mark's own position (this file must not
 * touch `layout.ts` or `Promo.tsx`), so if the contract ever changes, `CENTER`
 * below is the one number to move.
 *
 * ── Why a bespoke field, not an extra prop on `Particles.tsx` ───────────────
 *
 * `Particles.tsx` is closed-form drift around a fixed per-index anchor spread
 * evenly across the *whole* frame — it has no notion of a shared radius that
 * moves. Retrofitting one is possible but would leave that component servicing
 * two unrelated jobs (an ambient wash behind a title, and a converging burst
 * around one point) behind a pile of props most call sites never touch. That is
 * the same reasoning `Backdrop`'s own doc comment gives for keeping this beat's
 * atmosphere a *second* layer rather than repurposing the corner bloom: two
 * different jobs stay legible as two different pieces of code.
 *
 * ── Determinism ──────────────────────────────────────────────────────────────
 *
 * Every mote's position is `fieldRadius(frame)` — one closed-form envelope,
 * shared by every particle and the smoke — times a per-index shell factor, a
 * per-index rotation, and a per-index wobble, all irrational multiples of the
 * index (the same trick `Particles.tsx` and `Outro.tsx`'s `hash()` use) so nothing
 * ever falls into step and nothing needs a seeded generator threaded through.
 * Scrub backwards in Studio and it runs backwards.
 *
 * ── Colour: light stage until the drop, dark after ──────────────────────────
 *
 * This stretch opens on the light stage (`wipe-empower` landed at bar 11) and
 * only flips dark when `wipe-harness` crosses at the drop. `output/CHANGELOG.md`
 * records this exact bug twice — a colour picked for the dark stage, silently
 * invisible on 99%-lightness paper. Every colour below is read through
 * `themeMixAt(frame, x)` — the wipe's own arithmetic, evaluated at the mote's own
 * position rather than assumed for the whole frame, for the same reason the
 * lockup reads it and not a hand-timed fraction (see `wipes.ts`).
 *
 * ── Cost ─────────────────────────────────────────────────────────────────────
 *
 * The turbulence filter is the single most expensive thing this film can mount
 * (README: "the single biggest render cost"), so `Crescendo` renders nothing
 * outside its own padded window — a frame check, not a `<Sequence>`, so the
 * fade at either edge is an eased opacity rather than a hard cut arriving mid-
 * frame. Inside the window, the smoke's source element is a fixed 560px box:
 * the burst is made to look larger with a CSS `scale()`, which is composited
 * for free, rather than by growing the box the filter actually has to
 * rasterise turbulence over.
 */

/** The literal stage centre — see the contract note above. */
const CENTER = { x: 960, y: 540 } as const;

/** The crescent's own radius at this station (a 230px mark), inside which a
    mote is behind the logo rather than in front of it — see `fieldRadius`. */
const ENTER = 115;

/** §9.4's own frame schedule, in the grid's own terms rather than as frames. */
const DROP_AT = STAGE.harness;
const GATHER0 = BUILD.breath; // 1281 — particles appear, loose and wide
/* Bar 17 — the mark is home by here and the field starts closing on it. Shared
   with `TravellingMark`'s `toBreath` through `beats.ts`, because a field that
   implodes onto the logo cannot be timed independently of the logo. */
const GATHER1 = BUILD.implode; // 1332
const DROP = DROP_AT; // 1383 — the drop: explode
const DISSIPATE_END = DROP + 18; // 1401 — FLY, when `across` lands the mark at `column`

/** Padding so the opacity envelope eases rather than cutting at the mount edge. */
const MOUNT_FROM = GATHER0 - 6;
const MOUNT_TO = DISSIPATE_END + 26;

/** 2π × (1 − 1/φ) — successive indices land as far from every one before them
 * as possible, the same low-discrepancy step `Particles.tsx` uses for its x/y
 * spread, used here for angle instead of position. */
const GOLDEN_ANGLE = 2.399963229728653;

const clampBoth = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * The shared radius envelope, in pixels from `CENTER` — every mote and the
 * smoke both read this, scaled by their own per-index factor.
 *
 * ── They go all the way in, and they accelerate doing it ────────────────────
 *
 * v4 stopped the field at 190px — a ring riding the outside of the mark's glow
 * — because an earlier cut had collapsed it to 46px and vanished behind the
 * logo at the one frame the whole build exists for. The client's fifth round
 * asks for the opposite and is right: "the particles should accelerate towards
 * the centre of the logo, and all make it inside before exploding."
 *
 * Both notes are satisfiable at once, and the thing that reconciles them is
 * that a mote arriving at the centre should not still be a 40px disc. The
 * radius now runs to zero on an ease-*in* — so the field is at its widest and
 * most legible for most of the run and does the last third of the distance in
 * the last few frames, which is what "accelerate" means — and each mote is
 * faded and shrunk over the final stretch of its own approach. What reads is a
 * swarm being drawn in and swallowed, not a swarm sliding behind a disc.
 *
 * `ENTER` is where that swallow starts: the radius the crescent's own ink
 * occupies at this station (230px mark, so 115px), inside which a mote is
 * behind the logo and has nothing to say.
 *
 * Three segments now, where §9.4's table had four: the separate "peak
 * compression" hold is gone, because a field that is still travelling on the
 * frame the drop lands is what "all make it inside before exploding" asks for.
 * Gather stays linear — a drift, at one rate — and the two halves that are
 * single continuous motions each get their own curve, in and then out.
 */
const fieldRadius = (frame: number): number => {
  if (frame <= GATHER1) {
    return interpolate(frame, [GATHER0, GATHER1], [620, 400], clampBoth);
  }
  if (frame <= DROP) {
    /*
      One accelerating fall all the way to the centre, rather than a slide into
      a ring and then a hold. `Easing.in(cubic)` is the acceleration the client
      asked for and it is doing real work here: at the halfway frame the field
      is still at 87% of its radius, so the swarm stays wide and legible through
      the quiet and then collapses over the last handful of frames — the drop
      arrives on the frame the last mote reaches the middle.
    */
    return interpolate(frame, [GATHER1, DROP], [400, 0], {
      ...clampBoth,
      easing: Easing.in(Easing.cubic),
    });
  }
  return interpolate(frame, [DROP, MOUNT_TO], [0, 1050], {
    ...clampBoth,
    easing: Easing.out(Easing.cubic),
  });
};

/**
 * A brightness build through the quiet stretch, independent of the real bass.
 *
 * §9.4 is explicit that the implode/compress span is timed against the
 * track's own near-silence rather than against anything audible — "the quiet
 * is what the brief's 'just before the bass drops' is anchored to." `THUMP`
 * and `PUNCH` are both close to zero across exactly this stretch (measured:
 * under 0.01 from frame ~1338 to 1382), so a field that only rode the real
 * envelope would go dark right when the brief wants it tightening and
 * brightening. This is the one authored curve in the file, for that reason.
 */
const compressionGlow = (frame: number): number =>
  interpolate(frame, [GATHER1, DROP], [0.55, 1.3], clampBoth);

/**
 * The explosion's kick, read off the track's real envelope rather than drawn
 * by hand — `thumpAt`/`punchAt` are near zero through the compression and
 * climb hard from the drop (measured: `thumpAt` 0.98 by frame 1392, `punchAt`
 * saturated at 1 by 1390), so riding them here is what puts the burst's
 * brightest instant a few frames *into* the explosion rather than exactly on
 * it — which is also where the sub-bass actually lands.
 */
const kickAt = (frame: number): number => 1 + punchAt(frame) * 0.55 + thumpAt(frame) * 0.4;

/** Overall field strength — an eased opacity envelope, not a `<Sequence>` edge. */
const fieldOpacity = (frame: number): number =>
  interpolate(
    frame,
    [MOUNT_FROM, GATHER0 + 10, DROP + 3, DISSIPATE_END, MOUNT_TO],
    [0, 1, 1, 0.3, 0],
    clampBoth,
  );

/** How many motes. More than `Particles.tsx`'s "a few" (18) on purpose — that
 * component is ambience behind a title; this is the film's one deliberate
 * burst, the biggest new effect in the cut, and needs to read as a field
 * rather than a scattering. */
const PARTICLE_COUNT = 44;

const ParticleField: React.FC<{ frame: number }> = ({ frame }) => {
  const drop = frame >= DROP;
  const glow = compressionGlow(frame);
  const kick = kickAt(frame);

  return (
    <>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        // Desyncs each mote's convergence by up to ±8 frames so the field
        // implodes as a swarm rather than as one rigid, synchronised ring.
        const delay = ((i * 0.6180339887) % 1) * 16 - 8;
        const radius = fieldRadius(frame + delay);

        // A slow swirl while it moves — a fixed angle would read as spokes.
        const spin = (frame - GATHER0) * (0.0016 + (i % 5) * 0.0005);
        const angle = i * GOLDEN_ANGLE + spin;

        // Spreads motes across a shell around the shared radius rather than a
        // single thin ring, and wobbles each one a little so the shell breathes.
        const shell = 0.55 + ((i * 0.4142135624) % 1) * 0.9;
        const wobble = 1 + (0.05 + (i % 4) * 0.02) * Math.sin(frame / (17 + (i % 7) * 3) + i * 1.3);
        const r = radius * shell * wobble;

        const x = CENTER.x + Math.cos(angle) * r;
        const y = CENTER.y + Math.sin(angle) * r;

        const breath = 0.5 + 0.5 * Math.sin(frame / (65 + i * 6) + i);
        /*
          Swallowed, not hidden. Inside the crescent's own radius a mote is
          behind the logo, so rather than let it slide under the disc it is
          shrunk and faded out over that last stretch of its approach — the
          field is absorbed by the mark instead of disappearing behind it.
          Only on the way in: after the drop the same radii are the burst on its
          way out, and those frames are the loudest thing in the picture.
        */
        const swallow = drop
          ? 1
          : interpolate(r, [0, ENTER], [0, 1], clampBoth);
        const size = (14 + ((i * 13) % 7) * 7) * (0.35 + swallow * 0.65);

        // Read at the mote's own position, not the frame's centre — an object
        // that moves during a wipe is covered at a different time than one
        // that does not (`wipes.ts`'s own note on `themeMixAt`'s `x` argument).
        const mix = themeMixAt(frame, x);
        const k = i % 6;
        const color = interpolateColors(mix, [0, 1], [RAINBOW[k], LIGHT.RAINBOW[k]]);

        /*
          The light stage needs roughly half again as much of everything.

          A blurred disc is a *lightening* operation on near-black paper and a
          *darkening* one on 99%-lightness paper, and the two are not equally
          strong: the dark ramp sits far above `BG.base` in value, while
          `LIGHT.RAINBOW` is only as dark as it had to be to clear 4.5:1 on
          white — a much shorter distance to travel from the page. A still at
          f1378 with one figure for both had the compression reading as four
          faint specks. `mix` is 1 on the light stage and 0 on the dark one, so
          this is the same correction the motes' own colour already makes,
          applied to their weight.
        */
        const onLight = 1 + mix * 0.7;
        const opacity = Math.min(1, 0.62 * onLight * breath * glow * kick * swallow * (drop ? 1 : 0.8));

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              opacity,
              filter: `blur(${size * 0.38}px)`,
              backgroundColor: color,
            }}
          />
        );
      })}
    </>
  );
};

/** This document's own id for the one filter this component defines — `url(#id)`
 * is global, and nothing else in the film uses this string (see `SmokeStreak`'s
 * own note on the same hazard). A single mount at a time needs no seed prop. */
const SMOKE_ID = "crescendo-smoke";

/** Fixed source size for the filter, independent of how large the blob is asked
 * to appear — see the file's cost note. */
const SMOKE_BOX = 560;

const RadialSmoke: React.FC<{ frame: number }> = ({ frame }) => {
  const radius = fieldRadius(frame);
  const scale = radius / 150; // 150 ≈ the mark's resting radius at this station

  const glow = compressionGlow(frame);
  const kick = kickAt(frame);

  const mix = themeMixAt(frame, CENTER.x);
  const inner = interpolateColors(mix, [0, 1], [RAINBOW[2], LIGHT.RAINBOW[2]]);
  const outer = interpolateColors(mix, [0, 1], [RAINBOW[4], LIGHT.RAINBOW[4]]);

  // The field crawls rather than slides — see `SmokeStreak`'s note on why a
  // static field translated across the screen reads as a texture printed on a
  // moving object rather than as smoke that is actually boiling.
  const crawl = Math.max(0, frame - GATHER0);
  const freqX = 0.01 + Math.min(0.01, crawl * 0.00006);
  const freqY = 0.018 + Math.min(0.014, crawl * 0.00009);

  return (
    <>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter
            id={SMOKE_ID}
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${freqX} ${freqY}`}
              numOctaves={2}
              seed={7}
              result="field"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="field"
              scale={70}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        style={{
          position: "absolute",
          left: CENTER.x,
          top: CENTER.y,
          width: SMOKE_BOX,
          height: SMOKE_BOX,
          marginLeft: -SMOKE_BOX / 2,
          marginTop: -SMOKE_BOX / 2,
          /* Lifted on the light stage for the reason the motes are — see there. */
          opacity: Math.min(1, 0.8 * (1 + mix * 0.7) * glow * kick),
          transform: `scale(${scale})`,
          filter: `blur(18px) url(#${SMOKE_ID})`,
          /*
            The stops carry more alpha than they look like they should because
            two things thin them before they reach the frame: an 18px blur and
            a displacement map that tears the disc apart. What is authored here
            is not what is composited.
          */
          backgroundImage:
            `radial-gradient(circle, ${inner}a6 0%, ${outer}70 45%, transparent 72%)`,
        }}
      />
    </>
  );
};

export const Crescendo: React.FC = () => {
  const frame = useCurrentFrame();
  // Costs nothing for the other ~2500 frames of the film — a frame check, not
  // a `<Sequence>`, so the fades at either edge stay an eased opacity instead
  // of a hard cut. See the file's cost note.
  if (frame < MOUNT_FROM || frame > MOUNT_TO) return null;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: fieldOpacity(frame), pointerEvents: "none" }}>
      <RadialSmoke frame={frame} />
      <ParticleField frame={frame} />
    </div>
  );
};
