import { interpolate, random, useCurrentFrame } from "remotion";

import { ramp } from "./motion";
import { type Tone, glow } from "./palette";
import { useHudSkin } from "./skin";

/**
 * The two-line kinetic headline — the reference's signature.
 *
 * Every beat carries two or three words split into a *setup* (line A, white)
 * and a *payoff* (line B, in the beat's tone). They do not arrive the same
 * way, and the difference is the whole effect:
 *
 *  - **A resolves in place.** Letters fade up from a slight drop, a frame
 *    apart. It is there to be read, so it does not perform.
 *  - **B flies in.** Each letter starts scattered — offset, rotated, scaled up
 *    and blurred — and snaps into its slot a frame after the one before it,
 *    flaring as it lands and settling to the resting glow. The reference
 *    caught mid-flight reads "AL O N E", "SCO R I N G", "F R O M".
 *
 * `layout="stack"` puts B under A (both centred); `"inline"` puts B to the
 * right of A on one line, which the reference uses when the pair reads as one
 * phrase ("PICKS THE BEST").
 */
export const Headline: React.FC<{
  a: string;
  b?: string;
  tone?: Tone;
  layout?: "stack" | "inline";
  /** Frame line A starts. */
  aAt: number;
  /** Frame line B starts. */
  bAt: number;
  /** Font size of B; A is 82% of it when stacked. */
  size?: number;
  /** Tone for A; white by default. A red A sets up a negation ("NO GEN"). */
  aTone?: Tone;
  seed?: string;
}> = ({ a, b, tone = "cyan", layout = "stack", aAt, bAt, size = 92, aTone, seed = "h" }) => {
  const skin = useHudSkin();
  const aColor = aTone ? skin.tones[aTone] : skin.ink;
  const aSize = layout === "stack" ? size * 0.82 : size;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: layout === "stack" ? "column" : "row",
        alignItems: layout === "stack" ? "center" : "baseline",
        justifyContent: "center",
        gap: layout === "stack" ? size * 0.02 : size * 0.38,
        fontFamily: skin.headFont,
        fontWeight: skin.headWeight,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        lineHeight: 1.05,
      }}
    >
      <ResolveLine text={a} at={aAt} color={aColor} size={aSize} />
      {b ? <FlyLine text={b} at={bAt} color={skin.tones[tone]} size={size} seed={`${seed}-${b}`} /> : null}
    </div>
  );
};

const ResolveLine: React.FC<{ text: string; at: number; color: string; size: number }> = ({
  text,
  at,
  color,
  size,
}) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  return (
    <div style={{ fontSize: size, color, whiteSpace: "pre", textShadow: glow(skin.halo, 0.7 * skin.glow) }}>
      {[...text].map((ch, i) => {
        const t = ramp(frame, at + i * 0.8, 10);
        return (
          <span key={i} style={{ display: "inline-block", opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>
            {ch === " " ? " " : ch}
          </span>
        );
      })}
    </div>
  );
};

const FlyLine: React.FC<{ text: string; at: number; color: string; size: number; seed: string }> = ({
  text,
  at,
  color,
  size,
  seed,
}) => {
  const frame = useCurrentFrame();
  const { glow: strength } = useHudSkin();
  return (
    <div style={{ fontSize: size, color, whiteSpace: "pre" }}>
      {[...text].map((ch, i) => {
        const start = at + i * 1.3;
        const t = ramp(frame, start, 11);
        const r = (k: string) => random(`${seed}-${i}-${k}`) * 2 - 1;
        /* Flare peaks the moment the letter lands, then settles over ~10 frames. */
        const flare = interpolate(frame - start, [0, 9, 20], [0.4, 2.2, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: interpolate(t, [0, 0.35, 1], [0, 0.9, 1]),
              transform: [
                `translate(${(1 - t) * r("x") * size * 0.7}px, ${(1 - t) * r("y") * size * 0.9}px)`,
                `rotate(${(1 - t) * r("r") * 28}deg)`,
                `scale(${1 + (1 - t) * 0.7})`,
              ].join(" "),
              filter: `blur(${(1 - t) * 6}px)`,
              textShadow: glow(color, flare * strength),
            }}
          >
            {ch === " " ? " " : ch}
          </span>
        );
      })}
    </div>
  );
};
