import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { FG, RAINBOW, rainbowText } from "../../../../../shared/brand";
import { uiFontFamily } from "../../../../../shared/fonts";
import { FORGE_KEYS, FORGE_LABEL, ForgeLogo } from "../../../../../shared/ForgeLogo";
import { ShimmerLine } from "../../../../../shared/ShimmerLine";
import { DECAY, OUTRO } from "../beats";
import { punchAt } from "../energy";
import {
  MARK,
  OUTRO_CTA_TOP,
  OUTRO_EYEBROW_TOP,
  OUTRO_FORGE,
  STAGE as BOX,
} from "../layout";

/**
 * Stage 5 — where it runs, what it costs, and when.
 *
 * The act opens in the quietest two bars the track has had since the intro: the
 * drop resolves at bar 31 and the music does not come back until bar 32. So
 * "Connect with" gets that silence to itself and the first forge arrives on the
 * frame the music does, which is the one moment in the film where the picture
 * waits for the track rather than the other way round.
 *
 * From there it is one forge a bar to bar 36 — the loudest onset in the whole
 * piece — where the four collect into a row and the call to action lands under
 * them. The lockup is two bars later on the last boom, and "Coming Soon" a bar
 * after that, on the frame the music goes quiet for good.
 *
 * The lockup itself is not in this file. It is the `MidniteWordmark` that has
 * been on screen since frame 0, flying back to the middle — see
 * `TravellingMark` in `Promo.tsx`. What is here is everything that stands
 * beside it.
 *
 * Nor is "Coming Soon", although it is *defined* here: it is the last thing on
 * screen and has to be drawn above the black the film fades to, so `Promo`
 * mounts it there. See `ComingSoon` at the foot of this file.
 */
export const Outro: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={OUTRO.lockup - OUTRO.connect} name="Connect with">
      <ConnectScene />
    </Sequence>
  </AbsoluteFill>
);

/* ── "Connect with" ───────────────────────────────────────────────────────── */

/** Frames, relative to this scene, that each beat lands on. */
const forgeAt = OUTRO.forges.map((f) => f - OUTRO.connect);
const rowAt = OUTRO.startForFree - OUTRO.connect;

/**
 * The four forges, one at a time, then all of them.
 *
 * The single-forge beats are large — a 190px mark and the name beside it — and
 * the row is small, because those are two different statements. One at a time
 * says *this one*, and it has to be recognisable at a glance in 1.7 seconds. The
 * row says *all of them*, where what matters is the count.
 *
 * The eyebrow is above both and never moves, so the four reveals happen inside a
 * frame that is already established rather than each arriving as its own layout.
 */
const ConnectScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Which single forge is up, and whether the row has taken over. */
  const index = forgeAt.reduce((found, at, i) => (frame >= at ? i : found), -1);
  const rowed = frame >= rowAt;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          top: OUTRO_EYEBROW_TOP,
          opacity: eyebrow,
          transform: `translateY(${interpolate(eyebrow, [0, 1], [14, 0])}px)`,
          /*
            `uiFontFamily`, not `monoFontFamily` — the client's fourth round: "the
            same font as all the titles." `TypedTitle` is what every page title in
            this film is set in, and this line is the same idiom one register
            down — an eyebrow, not a title, four forge reveals and a call to
            action still to come.

            30, not 34: Poppins is wider per character than JetBrains Mono at the
            same nominal size (the same fact `CAPTION`'s own doc comment argues
            the other way, going 44→50 *into* the UI face), so dropping the size
            slightly keeps this line's visual weight where it was rather than
            letting a proportional face at the same px number read larger and
            more title-like.

            500, not `TypedTitle`'s default 600 — one step down, light enough to
            read as secondary beside what follows it.
          */
          fontFamily: uiFontFamily,
          fontSize: 30,
          fontWeight: 500,
          /*
            0.3em tracking was sized for an upper-case monospace readout (the
            same idiom `ComingSoon`'s eyebrow uses at 0.34em, still upper-case).
            Lower-case Poppins at that tracking is not an eyebrow, it is
            illegible — ascenders and descenders read as isolated marks once the
            letters are that far apart. 0.08em is normal small-caps-adjacent
            eyebrow tracking for a proportional face at this size.

            `textTransform: "uppercase"` is dropped rather than set to `"none"`:
            the brief asked for the glyphs themselves to be lower case, not a
            case transform hiding them.
          */
          letterSpacing: "0.08em",
          /*
            `muted`, not `subtle`. This line arrives in the track's quietest two
            bars with nothing else on the stage, and at `subtle` on near-black it
            read as a watermark rather than as the sentence the next four shots
            complete — exactly as true of this typeface as the one it replaces.
          */
          color: FG.muted,
        }}
      >
        connect with
      </div>

      {/*
        One box for both states, so the row lands where the single marks were and
        nothing on the stage shifts on the cut at bar 36.
      */}
      <div
        style={{
          position: "absolute",
          top: OUTRO_FORGE.top,
          height: OUTRO_FORGE.height,
          width: BOX.width,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {rowed ? (
          <ForgeRow startFrame={rowAt} fps={fps} />
        ) : index >= 0 ? (
          <SingleForge key={index} index={index} at={forgeAt[index]} />
        ) : null}
      </div>

      {rowed ? <StartForFree at={rowAt + 10} /> : null}
    </AbsoluteFill>
  );
};

/** Frames a forge keeps shaking for after it lands, and how long its name lights. */
const FORGE_SHAKE = 15;
const NAME_SHINE = 24;

/**
 * A deterministic pseudo-random in `[0, 1)` — the same shader hash the mark's
 * woofer and the cards' reveal use, and here for the same reason: a shake has
 * to be a function of the frame or the render stops being reproducible.
 */
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * One forge, big, hit onto the stage by the bar it lands on.
 *
 * Keyed on its index by the caller so each is a fresh element — the entrance
 * runs from `frame - at` and a reused element would carry the previous forge's
 * progress into the next one's first frame.
 *
 * ── The shake ──────────────────────────────────────────────────────────────
 *
 * Driven by `punch` — the strike rather than the cone's displacement — so the
 * pair is thrown around on the frames a drum actually lands and is still in
 * between, and decayed over `FORGE_SHAKE` frames so even a run of hits cannot
 * keep it moving past its own bar. The mark and the name are shaken *together*,
 * on one wrapper: shaking them separately reads as two objects that happen to
 * be vibrating, where the point is that the row is being struck.
 *
 * ── The name lights in the brand's gradient, not the forge's ───────────────
 *
 * `ShimmerLine` with `band="brand"`, which puts the ramp across the
 * letterforms' stroke rather than a white highlight over them. The mark beside
 * it is a vendor's colour — GitLab's four oranges, Bitbucket's blue — so the
 * type is the only midnite-coloured thing in the frame, and making it *carry*
 * the ramp rather than reflect a white light is what keeps the beat reading as
 * midnite connecting to them rather than as a logo parade.
 */
const SingleForge: React.FC<{ index: number; at: number }> = ({ index, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - at, fps, config: { damping: 200, stiffness: 160 } });
  const forge = FORGE_KEYS[index];

  const decay = interpolate(frame - at, [0, FORGE_SHAKE], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hit = punchAt(OUTRO.connect + frame) * decay;
  const shakeX = (hash(frame) * 2 - 1) * hit * 22;
  const shakeY = (hash(frame + 97) * 2 - 1) * hit * 15;
  const rock = (hash(frame + 211) * 2 - 1) * hit * 1.4;

  /* One crossing, starting once the pair has settled, then parked off the end. */
  const shine = (frame - at - 6) / NAME_SHINE;
  const shimmer = shine < 0 || shine > 1 ? -0.4 : interpolate(shine, [0, 1], [-0.2, 1.2]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 42,
        opacity: enter,
        transform:
          `translate(${shakeX}px, ${shakeY}px) rotate(${rock}deg) ` +
          `scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
      }}
    >
      {/*
        `tone="white"` only changes GitHub, which is flat black by design and
        would otherwise be a hole in the frame here. The other three keep their
        own colour — see `ForgeLogo`, where the fallback is deliberate.
      */}
      <ForgeLogo forge={forge} size={150} tone="white" />
      <ShimmerLine
        shimmer={shimmer}
        band="brand"
        color={FG.base}
        fontSize={92}
        fontWeight={600}
        stroke={2.4}
      >
        {FORGE_LABEL[forge]}
      </ShimmerLine>
    </div>
  );
};

/**
 * All four, small, staggered.
 *
 * Three frames apart on a stiff spring, which lands the last one 21 frames in —
 * well inside the two bars this holds for, per the pilot's rule that a stagger
 * has to finish before the next beat.
 */
const ForgeRow: React.FC<{ startFrame: number; fps: number }> = ({ startFrame, fps }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 84 }}>
      {FORGE_KEYS.map((forge, i) => {
        const enter = spring({
          frame: frame - startFrame - i * 3,
          fps,
          config: { damping: 200, stiffness: 190 },
        });
        return (
          <div
            key={forge}
            style={{
              opacity: enter,
              transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)`,
            }}
          >
            <ForgeLogo
              forge={forge}
              size={104}
              tone="white"
              shimmer={shimmerAt(frame, OUTRO.forgeShimmer[i] - OUTRO.connect)}
            />
          </div>
        );
      })}
    </div>
  );
};

/** Frames a shimmer takes to cross one mark. */
const SHINE = 13;

/**
 * Where the highlight is on a mark whose turn began at `at`, or `undefined`
 * before and after.
 *
 * `undefined` rather than a parked value, so that for all but half a second of
 * the row each mark is drawing no overlay at all — four masked gradients held
 * off-frame for two bars is four masked gradients being rasterised for two bars.
 *
 * Thirteen frames each, starting on the eighths of bar 36 (`OUTRO.forgeShimmer`
 * — the treble between the kicks), which puts the four crossings a fraction
 * under thirteen frames apart. They overlap by nothing and finish inside one
 * bar, so the row is still by the time the boom arrives two bars later. It
 * reads as one light travelling down the row rather than as four marks
 * flashing, which is what the brief's "cascading" asks for.
 */
const shimmerAt = (frame: number, at: number): number | undefined => {
  const t = (frame - at) / SHINE;
  return t < 0 || t > 1 ? undefined : interpolate(t, [0, 1], [-0.15, 1.15]);
};

/** How long a shimmer takes to cross the call to action, and how long until the next. */
const SWEEP = { length: 44, period: 60 } as const;

/**
 * The call to action, in the ramp, with a highlight crossing it.
 *
 * `ShimmerLine` rather than flat rainbow type, for the reason that component
 * carries: the ramp clipped to glyphs on a dark stage reads as grey-purple mush,
 * and what makes it read as brand colour is the ramp *glowing off* solid type
 * rather than being painted into it.
 */
const StartForFree: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const arrive = interpolate(frame - at, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cycles = (frame - at - 22) / SWEEP.period;
  const shimmer =
    cycles < 0
      ? -0.3
      : interpolate(cycles - Math.floor(cycles), [0, SWEEP.length / SWEEP.period], [-0.2, 1.2], {
          extrapolateRight: "clamp",
        });

  return (
    <div
      style={{
        position: "absolute",
        top: OUTRO_CTA_TOP,
        opacity: arrive,
        transform: `translateY(${interpolate(arrive, [0, 1], [18, 0])}px)`,
      }}
    >
      <ShimmerLine shimmer={shimmer} color={FG.base} fontSize={78} fontWeight={600} stroke={2}>
        Start for free
      </ShimmerLine>
    </div>
  );
};

/* ── The close ────────────────────────────────────────────────────────────── */

/**
 * "Coming Soon", under the mark the name has just folded back into.
 *
 * ── It comes and it goes, and the mark outlasts it ──────────────────────────
 *
 * This is the last thing to arrive and the last thing to leave, and it leaves
 * before the file ends — the brief's "it says coming soon briefly and fades
 * away, but just the logo stays". So the final seconds are the crescent alone
 * on black, which is the picture frame 0 is, which is what makes the film loop.
 *
 * Because of that it is mounted by `Promo`, above the black the stage fades to,
 * rather than inside `Outro` underneath it. Everything else in this act is gone
 * by the boom at bar 38.
 *
 * Placed from the lockup's own station rather than from a measured top: `MARK`
 * puts the closing mark's centre where the opening one's is and it is 150px
 * tall, so the line below it starts 52px under its foot. Move the station and
 * this moves with it.
 */
export const ComingSoon: React.FC = () => {
  const frame = useCurrentFrame();

  const arrive = interpolate(frame, [OUTRO.comingSoon, OUTRO.comingSoon + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const leave = interpolate(frame, [DECAY, DECAY + 34], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* A slow pulse on the glow, so the last four seconds are not a freeze frame. */
  const breath = 0.5 + 0.5 * Math.sin(((frame - OUTRO.comingSoon) / 84) * Math.PI * 2);

  const top = BOX.height / 2 + MARK.close.dy + MARK.close.size / 2 + 52;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: arrive * leave,
          transform: `translateY(${interpolate(arrive, [0, 1], [16, 0])}px)`,
        }}
      >
        <span
          style={{
            fontFamily: uiFontFamily,
            fontWeight: 500,
            fontSize: 46,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            ...rainbowText(),
            filter: `drop-shadow(0 0 ${18 + breath * 20}px ${RAINBOW[3]}55)`,
          }}
        >
          Coming Soon
        </span>
      </div>
    </AbsoluteFill>
  );
};
