import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { AppWindow } from "../../shared/AppWindow";
import { Headline } from "../../shared/neon-hud/Headline";
import { HudPill } from "../../shared/neon-hud/HudPill";
import { ramp } from "../../shared/neon-hud/motion";
import { BRAND_DARK } from "../../shared/neon-hud/skin";
import { projectFile } from "../../shared/projectFile";
import { type ClipSpec, PROJECT_ID } from "./content";
import { type Station, headOf, textWidth } from "./Mark";

/**
 * The film's own slot kind: a one-line headline over a recording of the
 * product, framed as a window on the stage (`shared/AppWindow`).
 *
 * The order inside a slot is the HUD scene's, so a clip cuts against the
 * chapter cards and the statement without a change of rhythm:
 *
 *   beat 0     the card rises in and the recording starts
 *   beat 0.5   line A resolves
 *   beat 2     line B flies in, in the slot's tone
 *   beat 2.75  the "App ▸ View" readout switches on in the card's corner
 *   end - 0.4  the slot fades out
 *
 * The headline is inline and smaller than a HUD scene's (80px against 92px,
 * 64px down rather than 150px), so the card can be 1184×740 and still leave
 * the bottom 150px to the spoken line. Several shots in one slot cut on their
 * beats with a short flash, which is how the launcher jumps from app to app.
 */

const asset = projectFile(PROJECT_ID);

/** Every clip is recorded at 1440×900 CSS px, device scale 2 (`capture/`). */
const SOURCE = { width: 2880, height: 1800 } as const;
const HEAD = { top: 64, size: 80 } as const;
export const CARD = { width: 1184, height: 740, top: 186 } as const;

export const ClipScene: React.FC<{ spec: ClipSpec; beat: number; beats: number; seed: string }> = ({
  spec,
  beat,
  beats,
  seed,
}) => {
  const frame = useCurrentFrame();
  const end = beats * beat;
  const d = (spec.delay ?? 0) * beat;
  const fade = interpolate(frame, [0, 5, end - 0.4 * beat, end], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = ramp(frame, d, 0.75 * beat);
  /* A slow push-in over the whole slot, so a still stretch of a recording never reads as a freeze. */
  const push = interpolate(frame, [d, end], [1, 1.035], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const shots = placeShots(spec, beat, Math.round(end - d));

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: HEAD.top }}>
        <Headline
          a={spec.a}
          b={spec.b}
          tone={spec.tone}
          aTone={spec.aTone}
          layout="inline"
          size={HEAD.size}
          aAt={d + 0.5 * beat}
          bAt={d + 2 * beat}
          seed={seed}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: CARD.top }}>
        <div
          style={{
            position: "relative",
            width: CARD.width,
            height: CARD.height,
            opacity: rise,
            transform: `translateY(${(1 - rise) * 48}px) scale(${(0.94 + 0.06 * rise) * push})`,
          }}
        >
          {shots.map((s, i) => (
            <Sequence key={i} from={Math.round(d) + s.start} durationInFrames={s.length} layout="none">
              <ShotView shot={s} index={i} beat={beat} />
            </Sequence>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

type PlacedShot = ClipSpec["shots"][number] & { start: number; length: number };

/** Each shot's frames within the slot: its `beats`, the last one taking the rest. */
const placeShots = (spec: ClipSpec, beat: number, total: number): PlacedShot[] => {
  let start = 0;
  return spec.shots.map((shot, i) => {
    const last = i === spec.shots.length - 1;
    const length = last ? total - start : Math.round((shot.beats ?? 2) * beat);
    const placed = { ...shot, start, length };
    start += length;
    return placed;
  });
};

const ShotView: React.FC<{ shot: PlacedShot; index: number; beat: number }> = ({ shot, index, beat }) => {
  const frame = useCurrentFrame();
  /* A cut inside the slot lands with a short flash; the first shot rises in with the card instead. */
  const flash = index === 0 ? 0 : interpolate(frame, [0, 5], [0.45, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <AppWindow
        src={shot.src ? staticFile(shot.src) : asset(`clips/${shot.file}`)}
        width={CARD.width}
        height={CARD.height}
        trimBefore={Math.round((shot.from ?? 0) * 30)}
        playbackRate={shot.rate ?? 1}
        crop={shot.crop}
        source={shot.source ?? SOURCE}
        glow={0.45}
      />
      {flash > 0 ? <AbsoluteFill style={{ borderRadius: 18, backgroundColor: `rgba(255,255,255,${flash})` }} /> : null}
      {shot.label ? (
        /* Straddling the card's top edge on the right, where it covers neither the app's logo nor its title bar. */
        <div style={{ position: "absolute", right: 28, top: -17 }}>
          <HudPill text={shot.label} at={index === 0 ? 2.75 * beat : 2} size={14} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Where the film's mark stands for a clip slot: left of the inline headline's first character. */
export const clipStation = (at: number, spec: ClipSpec): Station => {
  const weight = BRAND_DARK.headWeight;
  const wa = textWidth(spec.a.toUpperCase(), HEAD.size, weight, 0.02);
  const wb = spec.b ? textWidth(spec.b.toUpperCase(), HEAD.size, weight, 0.02) : 0;
  return headOf(at, wa + (spec.b ? 0.38 * HEAD.size + wb : 0), HEAD.top + (HEAD.size * 1.05) / 2, 84);
};
