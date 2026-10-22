import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Headline } from "./Headline";
import { HudLabel, HudPill } from "./HudPill";
import { ramp } from "./motion";
import { type Tone, glow } from "./palette";
import { useHudSkin } from "./skin";
import { type Visual, VisualView } from "./Visuals";

/**
 * One beat of the series: a headline over a diagram, `beats` musical beats
 * long (eight by default).
 *
 * The order inside a beat is the reference's, measured frame by frame:
 *
 *   beat 0     fade up from black; the diagram starts building
 *   beat 0.5   line A resolves (white)
 *   beat 2     line B flies in, letter by letter, in the beat's tone
 *   beat 2.25  the diagram dims to ~55% so the payoff word owns the frame
 *   beat 2.75  the HUD pill switches on under the diagram
 *   end - 0.4  the whole beat fades to black, and the next one fades up
 *
 * Every number is in beats, not frames — pass `beat` (frames per beat) from
 * the composition's clock and the scene follows the track.
 */
export type SceneSpec = {
  a: string;
  b?: string;
  tone?: Tone;
  aTone?: Tone;
  layout?: "stack" | "inline";
  visual: Visual;
  pill?: { text: string; tone?: Tone };
  /**
   * Beats the scene waits before it starts building — the whole order above
   * shifts by it. For an opening that gives the frame to something else first.
   */
  delay?: number;
};

export const Scene: React.FC<SceneSpec & { beat: number; beats?: number; seed?: string }> = ({
  a,
  b,
  tone = "cyan",
  aTone,
  layout = "stack",
  visual,
  pill,
  delay = 0,
  beat,
  beats = 8,
  seed = "scene",
}) => {
  const frame = useCurrentFrame();
  const end = beats * beat;
  const fade = interpolate(frame, [0, 5, end - 0.4 * beat, end], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  /* The diagram only dims if there is a payoff word to give the frame to. */
  const d = delay * beat;
  const dim = b ? interpolate(ramp(frame, d + 2.25 * beat, 0.6 * beat), [0, 1], [1, 0.55]) : 1;

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <Headline a={a} b={b} tone={tone} aTone={aTone} layout={layout} aAt={d + 0.5 * beat} bAt={d + 2 * beat} seed={seed} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 260 }}>
        <div style={{ opacity: dim, transform: "scale(1.2)" }}>
          <VisualView visual={visual} at={d} />
        </div>
        {pill ? (
          <div style={{ marginTop: 36 }}>
            <HudPill text={pill.text} tone={pill.tone ?? tone} at={d + 2.75 * beat} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The chapter card — not in the reference's picture (its acts are YouTube
 * chapters only), added because a tutorial needs a visible "you are here".
 * Built from the same parts: a mono `CHAPTER 02` readout, a hairline that
 * draws out from the centre, and the title resolving like a line A.
 */
export const ChapterCard: React.FC<{ index: number; title: string; beat: number; beats?: number }> = ({
  index,
  title,
  beat,
  beats = 8,
}) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const end = beats * beat;
  const fade = interpolate(frame, [0, 5, end - 0.4 * beat, end], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rule = ramp(frame, 0.25 * beat, beat);
  return (
    <AbsoluteFill style={{ opacity: fade, alignItems: "center", justifyContent: "center", gap: 28 }}>
      <div style={{ opacity: ramp(frame, 0, 8) }}>
        <HudLabel text={`chapter ${String(index).padStart(2, "0")}`} size={20} color={skin.tones.cyan} />
      </div>
      <div style={{ width: 760 * rule, height: 2, background: skin.rule, boxShadow: glow(skin.tones.cyan, 0.7 * skin.glow) }} />
      <div
        style={{
          fontFamily: skin.headFont,
          fontWeight: skin.headWeight,
          fontSize: 104,
          color: skin.ink,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          textShadow: glow(skin.halo, 0.8 * skin.glow),
          opacity: ramp(frame, 1.25 * beat, 0.75 * beat),
          transform: `translateY(${(1 - ramp(frame, 1.25 * beat, 0.75 * beat)) * 18}px)`,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};
