import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { ramp } from "./motion";
import { useHudSkin } from "./skin";

/**
 * The `say` line: one spoken sentence, captioned under the picture. Lifted out
 * of midnite video 1's `Episode.tsx` (v2), where it first appeared.
 *
 * It arrives a beat after the headline's payoff (beat 3 by default, so the
 * payoff word lands alone), rises a few pixels as it fades up, and leaves just
 * before the slot ends. The halo behind it is the skin's panel colour, so it
 * lifts the line off whatever is behind it on either stage.
 */
export const Say: React.FC<{ text: string; beat: number; beats: number; from?: number }> = ({
  text,
  beat,
  beats,
  from = 3,
}) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const end = beats * beat;
  const t = ramp(frame, from * beat, 0.75 * beat);
  const out = interpolate(frame, [end - 0.6 * beat, end - 0.2 * beat], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 84 }}>
      <div
        style={{
          fontFamily: skin.headFont,
          fontWeight: 500,
          fontSize: 38,
          letterSpacing: "0.01em",
          color: skin.ink,
          opacity: t * out * 0.92,
          transform: `translateY(${(1 - t) * 14}px)`,
          textShadow: `0 0 18px ${skin.panel}e6`,
          maxWidth: 1400,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
