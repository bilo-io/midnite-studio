import { Easing, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { AppWindow } from "../../../../shared/AppWindow";
import { RAINBOW, THEME, type Theme, themeRainbowStops } from "../../../../shared/brand";
import { monoFontFamily, uiFontFamily } from "../../../../shared/fonts";
import type { Shot } from "./clips";
import { punchAt, thumpAt } from "./energy";

/**
 * A shot of the product — or, where the product has not been recorded doing
 * this yet, a card that says so without looking like a mistake.
 *
 * The placeholder is the reason this component exists instead of `AppWindow`
 * being used directly. Three of the film's beats describe features no recording
 * on disk covers, and the two ways of handling that are both worse than a
 * designed stand-in: leaving the beat out loses the claim the brief is making,
 * and dropping in a recording of some *other* feature is the cut telling a small
 * lie about what the viewer is looking at.
 *
 * So a pending shot draws the same card at the same size, in the brand ramp,
 * with the feature's name set in it — and nothing that pretends to be a
 * screenshot. It reads as a title card, which is a thing films have. When the
 * recording lands, one line in `clips.ts` changes and this beat becomes a shot
 * with no other edit anywhere.
 */
/** Which edge a card arrives from. */
export type Approach = "left" | "right" | "top" | "bottom";

/**
 * Frames the reveal takes.
 *
 * Seven, which is a quarter of a second and under a seventh of the shortest
 * beat this is used on. The brief's word was "rapidly": a card growing from 70%
 * over half a bar is an entrance, and what is wanted here is the picture being
 * *hit* onto the stage by the bass — so it has to be over before the ear has
 * finished the transient.
 */
const REVEAL = 7;
/** Frames the card keeps shaking for after it lands. */
const SHAKE = 14;

/**
 * A deterministic pseudo-random in `[0, 1)` — the same shader hash the mark's
 * woofer uses, and here for the same reason: a shake has to be a function of
 * the frame or the render stops being reproducible.
 */
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const AppShot: React.FC<{
  shot: Shot;
  width: number;
  height: number;
  theme?: Theme;
  /** Brightness of the bloom behind the card. */
  glow?: number;
  radius?: number;
  /**
   * The composition frame this card is revealed on.
   *
   * Needed because the reveal is driven by the *music* and `energy.ts` is
   * indexed by composition frame, while `useCurrentFrame()` inside a scene is
   * the scene's own clock. Omitted, the card simply appears — which is what a
   * card that is not being revealed on a beat should do.
   */
  startsAt?: number;
  /** Which edge it arrives from. Default `bottom`. */
  from?: Approach;
}> = ({
  shot,
  width,
  height,
  theme = "dark",
  glow = 0.42,
  radius = 18,
  startsAt,
  from = "bottom",
}) => {
  const frame = useCurrentFrame();

  const card =
    shot.clip === null ? (
      <PendingCard
        label={shot.pendingLabel ?? ""}
        width={width}
        height={height}
        theme={theme}
        radius={radius}
      />
    ) : shot.then === undefined ? (
      <AppWindow
        src={staticFile(shot.clip)}
        trimBefore={shot.trimBefore}
        playbackRate={shot.rate}
        crop={shot.crop}
        source={shot.source}
        width={width}
        height={height}
        glow={glow}
        radius={radius}
      />
    ) : (
      /*
        A take that changes speed: two windows over one another in time, the
        second starting on the source frame the first had reached. Only one is
        mounted on any frame, so the join is a change of rate, not a cut.
      */
      <>
        <Sequence durationInFrames={shot.then.at} layout="none">
          <AppWindow
            src={staticFile(shot.clip)}
            trimBefore={shot.trimBefore}
            playbackRate={shot.rate}
            crop={shot.crop}
            source={shot.source}
            width={width}
            height={height}
            glow={glow}
            radius={radius}
          />
        </Sequence>
        <Sequence from={shot.then.at} layout="none">
          <AppWindow
            src={staticFile(shot.clip)}
            trimBefore={Math.round(shot.trimBefore + shot.then.at * shot.rate)}
            playbackRate={shot.then.rate}
            crop={shot.crop}
            source={shot.source}
            width={width}
            height={height}
            glow={glow}
            radius={radius}
          />
        </Sequence>
      </>
    );

  /*
    ── The reveal ─────────────────────────────────────────────────────────────

    70% to 100% over seven frames, eased out hard, with a slide from one edge
    and a shake that lasts a beat longer than the growth does.

    The shake is `punch`, not `thump`: the card is meant to be *struck* onto the
    stage and then hold still, and driving it from the cone's displacement would
    leave it trembling for the whole shot. It decays over `SHAKE` frames on top
    of that, so even a run of hits cannot keep it moving past its first beat.

    All of it is a CSS transform on a wrapper, so the card's own box — which the
    caption above it and the panel beside it are laid out against — never moves.
  */
  const enter = interpolate(frame, [0, REVEAL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const scale = interpolate(enter, [0, 1], [0.7, 1]);

  /* A twentieth of the card, which is a nudge at this size rather than a swipe. */
  const travel = interpolate(enter, [0, 1], [1, 0]) * (from === "top" || from === "bottom" ? height : width) * 0.05;
  const slideX = from === "left" ? -travel : from === "right" ? travel : 0;
  const slideY = from === "top" ? -travel : from === "bottom" ? travel : 0;

  const decay = interpolate(frame, [0, SHAKE], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hit = startsAt === undefined ? 0 : punchAt(startsAt + frame) * decay;
  const shakeX = (hash(frame) * 2 - 1) * hit * 16;
  const shakeY = (hash(frame + 97) * 2 - 1) * hit * 11;
  const shakeRotate = (hash(frame + 211) * 2 - 1) * hit * 0.9;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        transform:
          `translate(${slideX + shakeX}px, ${slideY + shakeY}px) ` +
          `rotate(${shakeRotate}deg) scale(${scale})`,
      }}
    >
      <Halo
        width={width}
        height={height}
        radius={radius}
        frame={frame}
        theme={theme}
        thump={startsAt === undefined ? 0 : thumpAt(startsAt + frame)}
      />
      {card}
    </div>
  );
};

/**
 * The ramp, turning behind the card.
 *
 * A conic sweep of the theme's own ramp at the card's own corner radius, a
 * little larger than it and blurred out past its edge — so what is seen is a
 * coloured halo leaning out from behind the window rather than a ring drawn
 * around it. Conic rather than linear for the reason the mark's aura is: a
 * linear ramp behind a rectangle has a light end and a dark end and reads as a
 * lit object, where a conic one has the whole ramp at every angle and reads as
 * the card emitting.
 *
 * It turns slowly and breathes with the bass, which is the brief's "pulsates and
 * rotates". The breath is on `thump` rather than `punch` because this one is
 * meant to be continuous — the shake is what reacts to the strike.
 *
 * Drawn *under* the card rather than as a `box-shadow`, because a shadow cannot
 * carry a gradient that rotates: CSS gives a shadow one colour.
 */
const Halo: React.FC<{
  width: number;
  height: number;
  radius: number;
  frame: number;
  theme: Theme;
  thump: number;
}> = ({ width, height, radius, frame, theme, thump }) => {
  /** How far the halo stands out past the card, before the blur spreads it. */
  const out = 26 + thump * 16;
  const breath = 0.5 + 0.5 * Math.sin((frame / 83) * Math.PI * 2);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: -out,
        top: -out,
        width: width + out * 2,
        height: height + out * 2,
        borderRadius: radius + out,
        backgroundImage: `conic-gradient(from ${(frame * 0.7) % 360}deg, ${themeRainbowStops(theme)})`,
        filter: `blur(${Math.round(34 + thump * 14)}px)`,
        opacity: (theme === "dark" ? 0.5 : 0.34) * (0.6 + breath * 0.24 + thump * 0.5),
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * The stand-in card.
 *
 * A dark well with the ramp running across the top of it, the feature's name
 * large and centred, and a band of light travelling down the card — the one
 * moving thing in it, because a card that is completely still next to eight that
 * are moving reads as a frozen video, which is the exact failure the whole
 * pending mechanism exists to avoid.
 *
 * The well stays dark even on the light stage. Every real shot in this film is a
 * dark app window, and a placeholder that went white with the background would
 * be the one card on the light stage that did not look like the product.
 */
const PendingCard: React.FC<{
  label: string;
  width: number;
  height: number;
  theme: Theme;
  radius: number;
}> = ({ label, width, height, theme, radius }) => {
  const frame = useCurrentFrame();
  const tokens = THEME[theme];

  /** A 3.5-second sweep, restarting — slow enough to read as light, not as a scan. */
  const sweep = (frame % 105) / 105;

  return (
    <div style={{ position: "relative", width, height }}>
      <div
        style={{
          position: "absolute",
          inset: 40,
          borderRadius: radius,
          opacity: 0.34,
          filter: "blur(70px)",
          backgroundImage: `linear-gradient(110deg, ${RAINBOW[0]}, ${RAINBOW[3]}, ${RAINBOW[5]})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: "#0b0b12",
          border: `1px solid ${theme === "dark" ? tokens.BORDER.base : "#2a2a36"}`,
          boxShadow: "0 34px 90px rgba(0, 0, 0, 0.62)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* The ramp as a rule across the top, the way a window's title bar reads. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundImage: `linear-gradient(90deg, ${RAINBOW.join(", ")})`,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${sweep * 100}%`,
            height: height * 0.42,
            marginTop: height * -0.21,
            opacity: interpolate(sweep, [0, 0.12, 0.88, 1], [0, 0.3, 0.3, 0]),
            filter: "blur(60px)",
            backgroundImage: `linear-gradient(180deg, transparent, ${RAINBOW[3]}, transparent)`,
          }}
        />

        <div style={{ position: "relative", textAlign: "center", padding: 48 }}>
          <div
            style={{
              fontFamily: monoFontFamily,
              fontSize: 22,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#6f6f85",
              marginBottom: 22,
            }}
          >
            Midnite Studio
          </div>
          <div
            style={{
              fontFamily: uiFontFamily,
              fontWeight: 600,
              fontSize: Math.round(height * 0.11),
              lineHeight: 1.1,
              backgroundImage: `linear-gradient(96deg, ${RAINBOW[0]}, ${RAINBOW[3]}, ${RAINBOW[5]})`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              /*
                Room for the glyphs to overhang. A gradient clipped to text is
                painted only inside the element's box, and at this line height
                a descender ("g" in "Agentic") hangs out of the bottom of it and
                is cut off square. The padding widens the painted box; the
                negative margin gives the same space back so nothing moves.
              */
              padding: "0.12em 0.12em 0.28em",
              margin: "-0.12em -0.12em -0.28em",
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  );
};
