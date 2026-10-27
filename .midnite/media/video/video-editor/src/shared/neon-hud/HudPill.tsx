import { useCurrentFrame } from "remotion";

import { ramp } from "./motion";
import { type Tone, boxGlow } from "./palette";
import { useHudSkin } from "./skin";

/**
 * The small bordered caption under a visual — "NO SOLO REASONING",
 * "RUNNING IN PRODUCTION". The border draws out from the centre first and the
 * text follows, so it reads as a readout switching on rather than a sticker.
 */
export const HudPill: React.FC<{ text: string; at: number; tone?: Tone; size?: number }> = ({
  text,
  at,
  tone = "cyan",
  size = 15,
}) => {
  const frame = useCurrentFrame();
  const skin = useHudSkin();
  const border = ramp(frame, at, 9);
  const ink = ramp(frame, at + 5, 8);
  const color = skin.tones[tone];
  return (
    <div
      style={{
        display: "inline-block",
        padding: `${size * 0.35}px ${size * 1.2}px`,
        border: `2px solid ${color}`,
        borderRadius: 4,
        transform: `scaleX(${border})`,
        opacity: border,
        boxShadow: boxGlow(color, 0.6 * skin.glow),
        fontFamily: skin.monoFont,
        fontSize: size,
        letterSpacing: "0.32em",
        textTransform: "uppercase",
        color,
        backgroundColor: `${skin.panel}99`,
      }}
    >
      <span style={{ opacity: ink }}>{text}</span>
    </div>
  );
};

/** A bare mono caption — the tiny labels inside cards and under nodes. */
export const HudLabel: React.FC<{ text: string; color?: string; size?: number; opacity?: number }> = ({
  text,
  color,
  size = 13,
  opacity = 1,
}) => {
  const skin = useHudSkin();
  return (
    <div
      style={{
        fontFamily: skin.monoFont,
        fontSize: size,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: color ?? skin.label,
        opacity,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};
