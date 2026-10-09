import { AbsoluteFill, OffthreadVideo } from "remotion";

/**
 * Passthrough of a project's source video starting at source frame `trimBefore`.
 * `src` is the master, normally the project's own input file
 * (`projectFile("<original>.mp4")`) rather than a shared asset.
 * The parent <TransitionSeries.Sequence> decides how long it plays.
 *
 * `playbackRate` > 1 speeds the segment up: N source frames occupy
 * ceil(N / playbackRate) timeline frames, so the parent sequence's
 * `durationInFrames` must be set accordingly.
 */
export const OriginalSegment: React.FC<{
  src: string;
  trimBefore: number;
  name: string;
  playbackRate?: number;
}> = ({ src, trimBefore, name, playbackRate = 1 }) => {
  return (
    <AbsoluteFill name={name} style={{ backgroundColor: "#000000" }}>
      <OffthreadVideo
        src={src}
        trimBefore={trimBefore}
        playbackRate={playbackRate}
        style={{ width: 1920, height: 1080 }}
      />
    </AbsoluteFill>
  );
};
