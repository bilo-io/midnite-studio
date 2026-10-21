import { AbsoluteFill, OffthreadVideo } from "remotion";

import { BG, BORDER, RAINBOW } from "./brand";

/**
 * A screen recording of the product, framed as a window sitting on the stage.
 *
 * Every midnite video that shows the app shows it this way — a rounded, bordered
 * card lifted off the near-black page by a shadow and a soft brand-coloured
 * bloom — so the chrome lives here rather than being redrawn per project. What
 * stays with the project is *which* frames of *which* clip (`trimBefore`) and
 * how the card moves, because both of those are measured from the footage and
 * from that edit's beat grid.
 *
 * `OffthreadVideo` rather than `<Video>`: these are long, high-bitrate screen
 * recordings, and the offthread variant extracts the exact frame through
 * ffmpeg instead of asking a `<video>` element to seek to it, which is the
 * difference between a deterministic render and a race.
 *
 * Note that `trimBefore` is in *composition* frames (30 here), not the source's
 * own — a screen recording at 57.9fps is still trimmed in 30ths of a second.
 *
 * It composes correctly with `playbackRate`, which an earlier version of this
 * comment denied. Worth writing down, because the two look like they should
 * fight: `trimBefore` is implemented as a wrapping `<Sequence from={-trim}>`,
 * so inside it `useCurrentFrame()` starts at `trim` rather than 0, and
 * `OffthreadVideoForRendering` passes that same `trim` as `startFrom` to
 * `getMediaTime`, which interpolates `[-1, startFrom, startFrom + 1]` onto
 * `[-1, startFrom, startFrom + playbackRate]`. The slide's first frame is
 * therefore exactly `trim / fps` seconds into the clip and each frame after it
 * advances by `playbackRate`. The outer `<Sequence>` a slide sits in does not
 * interfere either: `useMediaStartsAt` reads `cumulatedNegativeFrom`, and a
 * slide's `from` is positive.
 */

/** What a midnite-studio window records at on this machine. */
const SOURCE = { width: 2912, height: 1758 } as const;

/** Source pixels to cut off each edge before the recording is fitted. */
export type Crop = { top?: number; right?: number; bottom?: number; left?: number };

export const AppWindow: React.FC<{
  /** `staticFile("video/app/….mov")`. */
  src: string;
  /** Rendered card size in px. The recording is fitted to cover it. */
  width: number;
  height: number;
  /** Frames to skip at the head of the clip, in composition frames. */
  trimBefore?: number;
  /**
   * How fast the clip runs. 2 is twice as fast, 0.7 is slow motion.
   *
   * Source seconds consumed is `durationInFrames × rate / fps`, and a slide
   * that asks for more than the clip has plays its last frame frozen — which
   * on a screen recording is indistinguishable from the app having hung. Every
   * rate in `Pilot.tsx` is picked against a measured clip length for that
   * reason, not by eye.
   */
  playbackRate?: number;
  /**
   * Source pixels to discard before fitting — for a banner or a toast that
   * belongs to the machine the recording was made on rather than to the
   * product. The card keeps the size it was given either way, so cropping one
   * clip does not resize the window between two slides; what changes is how
   * much of the rest is scaled past the edges.
   */
  crop?: Crop;
  source?: { width: number; height: number };
  radius?: number;
  /** Brightness of the bloom behind the card. 0 turns it off. */
  glow?: number;
  style?: React.CSSProperties;
}> = ({
  src,
  width,
  height,
  trimBefore = 0,
  playbackRate = 1,
  crop,
  source = SOURCE,
  radius = 18,
  glow = 0.5,
  style,
}) => {
  const { top = 0, right = 0, bottom = 0, left = 0 } = crop ?? {};
  const keptWidth = source.width - left - right;
  const keptHeight = source.height - top - bottom;

  /* Cover, not contain: the card's proportions win and the overflow is clipped. */
  const scale = Math.max(width / keptWidth, height / keptHeight);
  /* Place the kept region's centre on the card's centre. */
  const offsetLeft = width / 2 - (left + keptWidth / 2) * scale;
  const offsetTop = height / 2 - (top + keptHeight / 2) * scale;

  return (
    <div style={{ position: "relative", width, height, ...style }}>
      {glow > 0 ? (
        /*
          Sits *behind* the card and slightly inside it, so what escapes is a
          halo rather than an outline. `filter: blur` on a solid rounded rect
          rather than a box-shadow spread: a shadow cannot carry two colours,
          and the point is that the light under a midnite window is midnite's.
        */
        <AbsoluteFill
          style={{
            margin: 40,
            borderRadius: radius,
            opacity: glow,
            filter: "blur(70px)",
            backgroundImage: `linear-gradient(110deg, ${RAINBOW[0]}, ${RAINBOW[3]}, ${RAINBOW[5]})`,
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: BG.sunken,
          border: `1px solid ${BORDER.base}`,
          boxShadow: "0 34px 90px rgba(0, 0, 0, 0.62)",
        }}
      >
        <OffthreadVideo
          src={src}
          trimBefore={trimBefore}
          playbackRate={playbackRate}
          muted
          style={{
            position: "absolute",
            left: offsetLeft,
            top: offsetTop,
            width: source.width * scale,
            height: source.height * scale,
            display: "block",
          }}
        />
      </div>
    </div>
  );
};
