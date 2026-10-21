import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const HELLO_DURATION = 90;

/** The one example composition: a title that springs in and fades out. Copy it to start a video. */
export const Hello: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exit = interpolate(frame, [HELLO_DURATION - 20, HELLO_DURATION], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill className="items-center justify-center bg-neutral-950">
      <h1
        className="text-[140px] font-semibold tracking-tight text-white"
        style={{ opacity: exit, transform: `translateY(${(1 - enter) * 40}px) scale(${0.9 + enter * 0.1})` }}
      >
        Hello, video
      </h1>
    </AbsoluteFill>
  );
};
