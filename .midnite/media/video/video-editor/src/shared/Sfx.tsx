import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { RAINBOW } from "./brand";
import { keystrokeFrames, type TypewriterTiming } from "./Typewriter";

/**
 * The punctuation layer: stock one-shots that land on a beat, the keyboard
 * under a line being typed, and the streak of light that crosses a cut.
 *
 * All of it is positioned by the *moment it lands* rather than by when it
 * starts, because that is the only number the edit actually cares about — a
 * beat for the one-shots, the frame a character appears for the keyboard.
 */

/**
 * The stock one-shots, measured rather than guessed.
 *
 * `peak` is the frame within the file where it is loudest, found with
 * `tools/audio-envelope.mjs`. Every one of these opens with a swell — Dragon's
 * runs 1.7s and the riser's runs seven seconds — so playing one from frame 0 at
 * the moment of a cut fires it a beat, or a bar, or four bars late. Aligning
 * the peak instead is what makes it hit *with* the music.
 */
export const SFX = {
  /** 1.7s swell, big and slow. For a section change. */
  big: { file: "audio/sfx/dragon-studio-futuristic-transition-390304.mp3", peak: 51 },
  /** 1.0s swell, tighter. For a beat inside a section. */
  light: { file: "audio/sfx/trading_nation-deep-strange-whoosh-183845.mp3", peak: 30 },
  /**
   * Seven seconds of rise, then a cliff. `peak` is the last frame before the
   * cliff rather than the loudest frame: the file holds near its maximum from
   * 5.95s and falls off a ledge at 7.05s, so what has to land on the beat is
   * the ledge. Trim the head to fit whatever bars the build-up actually has.
   */
  riser: { file: "audio/sfx/soundreality-riser-wildfire-285209.mp3", peak: 210 },
  /** A short, low impact with a long tail. For the frame a drop lands on. */
  impact: { file: "audio/sfx/primalhousemusic-production-elements-impactor-e-188986.mp3", peak: 7 },
} as const;

export type SfxKind = keyof typeof SFX;

/**
 * A stock one-shot, peaking on `atFrame` of the *parent* timeline.
 *
 * Mount this at the composition's top level, not inside the section it
 * accompanies: the swell has to start well before the cut, and a `<Sequence>`
 * that begins at the cut would clip exactly the part that builds to it.
 *
 * When the peak is closer to the start of the video than the swell is long,
 * the sequence is clamped to frame 0 and the file is trimmed by the remainder,
 * so the sound still peaks on the beat — it simply enters mid-swell. `head`
 * shortens it deliberately for the same reason: a seven-second riser over a
 * five-second build-up should start five seconds out, not seven.
 */
export const SfxSound: React.FC<{
  atFrame: number;
  kind?: SfxKind;
  volume?: number;
  /** Frames of swell to keep before the peak. Defaults to all of it. */
  head?: number;
}> = ({ atFrame, kind = "big", volume = 0.5, head }) => {
  const { file, peak } = SFX[kind];
  const keep = head === undefined ? peak : Math.min(head, peak);
  const from = atFrame - keep;
  const trim = peak - keep + (from < 0 ? -from : 0);
  return (
    <Sequence from={Math.max(0, from)} layout="none">
      <Audio src={staticFile(file)} trimBefore={trim} volume={volume} />
    </Sequence>
  );
};

/**
 * The picture of a swoosh: a soft, skewed band of light that crosses the frame
 * and is gone in under half a second.
 *
 * Mount it *at* the beat — unlike the sound it needs no anticipation, and a
 * streak that starts early reads as a stray highlight rather than as a
 * transition. Its own `<Sequence>` should therefore begin on the beat frame.
 *
 * The band carries a slice of the brand ramp rather than plain white, which is
 * what keeps it reading as midnite's rather than as a generic lens flare —
 * except where the act it is crossing has no colour in it at all. The
 * golive-promo's intro is black type on black, and a violet streak raking
 * across it is the only colour in three seconds of deliberate monochrome, which
 * reads as a leak rather than as a transition. `tint` is for that case and that
 * case only; leave it alone everywhere else.
 */
export const SwooshStreak: React.FC<{
  /** Frames the streak takes to cross. Default 14 (~0.47s). */
  durationInFrames?: number;
  /** -1 sweeps right-to-left. Default 1. */
  direction?: 1 | -1;
  /** Peak opacity. Default 0.5. */
  intensity?: number;
  /** Override the ramp with one flat colour. For a monochrome act. */
  tint?: string;
}> = ({ durationInFrames = 14, direction = 1, intensity = 0.5, tint }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0, 0.1, 1),
  });

  /*
    Travel is in viewport widths and starts fully off-frame on both sides, so
    the band is never seen entering or leaving — only crossing.
  */
  const x = interpolate(t, [0, 1], [-140 * direction, 140 * direction]);
  /* Fades in and back out over the crossing rather than cutting at either end. */
  const opacity = interpolate(t, [0, 0.25, 0.75, 1], [0, intensity, intensity, 0]);

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: "-30%",
          left: "50%",
          width: "38%",
          height: "160%",
          transform: `translateX(${x}%) skewX(-18deg)`,
          opacity,
          filter: "blur(28px)",
          backgroundImage: tint
            ? `linear-gradient(90deg, transparent, ${tint}, transparent)`
            : `linear-gradient(90deg, transparent, ${RAINBOW[2]}, ${RAINBOW[4]}, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ── The keyboard ─────────────────────────────────────────────────────────── */

/**
 * The four synthesised keystrokes, in the order they are dealt.
 *
 * Built by `scripts/make-keyclick.mjs`, which carries the model and the reason
 * there are four of them rather than one. Short enough (0.11s) that a
 * `<Sequence>` four frames long never truncates one.
 */
const KEYCLICKS = [
  "audio/sfx/keyclick-1.wav",
  "audio/sfx/keyclick-2.wav",
  "audio/sfx/keyclick-3.wav",
  "audio/sfx/keyclick-4.wav",
] as const;

/**
 * Frames a single click is given before it is cut off. The longest variant's
 * tail is 0.11s; four frames is 0.133s, so nothing is ever clipped.
 */
const CLICK_FRAMES = 4;

/**
 * The keyboard under a line of type, one strike per character that appears.
 *
 * Takes the same `TypewriterTiming` as the `Typewriter` it accompanies, and
 * schedules from `keystrokeFrames` rather than from its own arithmetic — one
 * object, passed to both, so the sound cannot drift from the glyphs when a
 * speed or a delay changes.
 *
 * ── Why the variants are dealt by a stride and not at random ────────────────
 *
 * Cycling 1,2,3,4,1,2,3,4 is audibly a loop of four: a long line turns into a
 * rhythm the ear locks onto, which is the opposite of what four takes are for.
 * A random pick fixes the loop and introduces a worse problem — the same
 * variant twice in a row, which does not happen on a real keyboard often enough
 * to sound like one, and which is not reproducible between renders anyway.
 *
 * Stepping by a stride coprime to the count (3 and 4) visits all four before
 * repeating any and does it in an order that only recurs every twelve
 * characters, which is longer than most of what is typed here. It is also a
 * pure function of the index, so two renders are identical.
 *
 * `volume` defaults low on purpose. The brief's word for this sound is
 * *subtle*, and subtle at one keystroke is not subtle at two hundred: what has
 * to survive the repeat is the texture, not the level.
 */
export const TypingSound: React.FC<
  TypewriterTiming & {
    /** Characters typed — `text.length`, or the count if the text is built. */
    length: number;
    /** Per-click level. Default 0.16, which is texture under a music bed. */
    volume?: number;
    /**
     * Frame this line's clock starts on, in the *parent* timeline.
     *
     * Mount this beside the section rather than inside it where you can: a
     * `<Sequence>` that starts on the same frame as the first character is fine,
     * but one that starts later would silently swallow the head of the line.
     */
    from?: number;
  }
> = ({ length, volume = 0.16, from = 0, ...timing }) => (
  <>
    {keystrokeFrames(length, timing).map((frame, i) => (
      <Sequence
        key={`${frame}-${i}`}
        from={Math.max(0, from + frame - 1)}
        durationInFrames={CLICK_FRAMES}
        layout="none"
      >
        <Audio src={staticFile(KEYCLICKS[(i * 3) % KEYCLICKS.length])} volume={volume} />
      </Sequence>
    ))}
  </>
);
