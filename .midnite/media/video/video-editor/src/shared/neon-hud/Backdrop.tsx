import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";

import { STAGE } from "./palette";

/**
 * The stage: a near-black page, a cool lift that breathes very slowly behind
 * the centre, a heavy vignette, and a few dust motes drifting upward.
 *
 * Mount once at the composition's top level. Scenes fade to black *over* it,
 * so the lift showing through between scenes is what keeps a cut from reading
 * as a dropped frame.
 */
export const Backdrop: React.FC<{ motes?: number }> = ({ motes = 28 }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const breathe = 0.85 + 0.15 * Math.sin((frame / fps) * 0.6);

  return (
    <AbsoluteFill style={{ backgroundColor: STAGE.base }}>
      <AbsoluteFill
        style={{
          opacity: breathe,
          background: `radial-gradient(ellipse 55% 50% at 50% 52%, ${STAGE.lift} 0%, transparent 70%)`,
        }}
      />
      {Array.from({ length: motes }, (_, i) => {
        const x = random(`mote-x-${i}`) * width;
        const speed = 6 + random(`mote-s-${i}`) * 14;
        const y = height - (((random(`mote-y-${i}`) * height + (frame / fps) * speed) % (height + 40)) - 20);
        const size = 1 + random(`mote-r-${i}`) * 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: "#6fd6ff",
              opacity: 0.08 + random(`mote-o-${i}`) * 0.18,
            }}
          />
        );
      })}
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse 80% 75% at 50% 50%, transparent 45%, rgba(0,0,0,0.85) 100%)" }}
      />
    </AbsoluteFill>
  );
};
