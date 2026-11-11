import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";

import { monoFontFamily, uiFontFamily } from "../../shared/fonts";
import { projectFile } from "../../shared/projectFile";

/**
 * A beat-locked game showreel: one music bed, a title slam, shots cut on the
 * beat grid, an end card. Every length is in **beats** of the bed, so a cut
 * always lands on a kick and the whole edit moves with the track.
 *
 * On every cut: a short white flash and a zoom punch (1.08 → 1 over 8 frames).
 * Inside a shot, an optional pulse bumps the scale on each beat, the same
 * kick the music is playing. A shot may carry a lower-third tag.
 */

export const FPS = 30;

export type Shot = {
  /** File under the project's input/, e.g. "clips/gtact-heli.mp4". */
  clip: string;
  /** Seconds into the clip where the shot starts. */
  at: number;
  /** Length in beats. */
  beats: number;
  /** Playback rate (1 = real time). */
  rate?: number;
  /** Lower-third tag, e.g. "SEA POINT · HELI". */
  tag?: string;
  /** Scale drift over the shot, [from, to]. Default a slow 1 → 1.04 push. */
  drift?: [number, number];
  /** Bump the scale on every beat inside the shot. */
  pulse?: boolean;
  /** Crop a region (CSS object-position), e.g. "50% 30%". */
  focus?: string;
  /** Anchor for the drift/punch scale (CSS transform-origin), e.g. "50% 0%" to crop the bottom away. */
  origin?: string;
};

export type Reel = {
  projectId: string;
  /** The bed, under input/. */
  music: string;
  bpm: number;
  /** Seconds into the bed where the film's beat 0 sits (a downbeat). */
  musicFrom: number;
  /** Title over the opening beats. */
  intro: { beats: number; title: string; kicker: string; bg?: Shot };
  shots: Shot[];
  outro: { beats: number; title: string; lines: string[]; bg?: Shot };
  /** Two accent colours for type and flashes. */
  accent: [string, string];
  /** Beats of music that run on after the end card starts fading (tail). */
  tail?: number;
};

export const framesPerBeat = (r: Reel) => (60 / r.bpm) * FPS;
export const reelBeats = (r: Reel) => r.intro.beats + r.shots.reduce((s, x) => s + x.beats, 0) + r.outro.beats;
export const reelFrames = (r: Reel) => Math.round(reelBeats(r) * framesPerBeat(r));

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

const ShotView: React.FC<{ reel: Reel; shot: Shot; frames: number; dim?: number }> = ({ reel, shot, frames, dim = 0 }) => {
  const f = useCurrentFrame();
  const asset = projectFile(reel.projectId);
  const fpb = framesPerBeat(reel);
  const [d0, d1] = shot.drift ?? [1, 1.04];
  const drift = interpolate(f, [0, frames], [d0, d1], clamp);
  const punch = 1 + 0.08 * (1 - easeOut(f / 8));
  const beatPhase = (f % fpb) / fpb;
  const pulse = shot.pulse ? 1 + 0.018 * Math.pow(1 - beatPhase, 4) : 1;
  const flash = interpolate(f, [0, 4], [0.55, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${drift * punch * pulse})`, transformOrigin: shot.origin ?? "50% 50%" }}>
        <OffthreadVideo
          src={asset(shot.clip)}
          trimBefore={Math.round(shot.at * FPS)}
          playbackRate={shot.rate ?? 1}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: shot.focus ?? "50% 50%" }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)" }} />
      {dim > 0 && <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${dim})` }} />}
      {shot.tag && <Tag reel={reel} text={shot.tag} frames={frames} />}
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

const Tag: React.FC<{ reel: Reel; text: string; frames: number }> = ({ reel, text, frames }) => {
  const f = useCurrentFrame();
  const fpb = framesPerBeat(reel);
  const inT = easeOut((f - fpb * 0.5) / 8);
  const out = interpolate(f, [frames - 8, frames - 2], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 0 72px 84px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: inT * out, transform: `translateX(${(1 - inT) * -40}px)` }}>
        <div style={{ width: 8, height: 46, background: `linear-gradient(${reel.accent[0]}, ${reel.accent[1]})` }} />
        <div style={{ fontFamily: monoFontFamily, fontSize: 30, letterSpacing: 6, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.8)", fontWeight: 700 }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Big type that slams in on the downbeat with an RGB split that settles. */
const Slam: React.FC<{ reel: Reel; title: string; kicker?: string; lines?: string[]; at?: number; size?: number }> = ({ reel, title, kicker, lines, at = 0, size = 150 }) => {
  const f = useCurrentFrame() - at;
  const fpb = framesPerBeat(reel);
  const k = easeOut(f / 7);
  const split = 14 * (1 - easeOut(f / 12));
  const shake = f >= 0 && f < 10 ? Math.sin(f * 2.7) * (10 - f) * 0.8 : 0;
  const t = (dx: number, c: string): React.CSSProperties => ({
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    color: c, mixBlendMode: "screen", transform: `translateX(${dx}px)`,
  });
  const kickIn = easeOut((f - fpb) / 8);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: f < 0 ? 0 : 1 }}>
      <div style={{ position: "relative", width: "100%", height: size * 1.3, transform: `translate(${shake}px, ${shake * 0.4}px) scale(${1.35 - 0.35 * k})`, opacity: k, fontFamily: uiFontFamily, fontWeight: 900, fontSize: size, letterSpacing: -2, textTransform: "uppercase", fontStyle: "italic" }}>
        <div style={t(-split, reel.accent[0])}>{title}</div>
        <div style={t(split, reel.accent[1])}>{title}</div>
        <div style={{ ...t(0, "#fff"), mixBlendMode: "normal", textShadow: "0 6px 40px rgba(0,0,0,0.6)" }}>{title}</div>
      </div>
      {kicker && (
        <div style={{ marginTop: 18, opacity: kickIn, transform: `translateY(${(1 - kickIn) * 20}px)`, fontFamily: monoFontFamily, fontSize: 30, letterSpacing: 10, color: "#fff", textTransform: "uppercase" }}>
          {kicker}
        </div>
      )}
      {lines?.map((l, i) => {
        const a = easeOut((f - fpb * (1 + i * 0.5)) / 8);
        return (
          <div key={l} style={{ marginTop: i === 0 ? 26 : 8, opacity: a, transform: `translateY(${(1 - a) * 16}px)`, fontFamily: monoFontFamily, fontSize: i === 0 ? 30 : 22, letterSpacing: i === 0 ? 6 : 2, color: i === 0 ? "#fff" : "rgba(255,255,255,0.75)" }}>
            {l}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const GameReel: React.FC<{ reel: Reel }> = ({ reel }) => {
  const f = useCurrentFrame();
  const asset = projectFile(reel.projectId);
  const fpb = framesPerBeat(reel);
  const total = reelFrames(reel);
  const at = (beat: number) => Math.round(beat * fpb);

  let cursor = reel.intro.beats;
  const placed = reel.shots.map((s) => {
    const from = at(cursor);
    cursor += s.beats;
    return { s, from, frames: at(cursor) - from };
  });
  const outroFrom = at(cursor);
  const music = interpolate(f, [0, 3, total - at(2), total], [0, 1, 1, 0], clamp);
  const fadeOut = interpolate(f, [total - at(1), total], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio src={asset(reel.music)} trimBefore={Math.round(reel.musicFrom * FPS)} volume={() => music} />
      <Sequence durationInFrames={at(reel.intro.beats)}>
        {reel.intro.bg && <ShotView reel={reel} shot={reel.intro.bg} frames={at(reel.intro.beats)} dim={0.45} />}
        <Slam reel={reel} title={reel.intro.title} kicker={reel.intro.kicker} at={at(Math.max(0, reel.intro.beats - 4))} />
      </Sequence>
      {placed.map(({ s, from, frames }, i) => (
        <Sequence key={i} from={from} durationInFrames={frames}>
          <ShotView reel={reel} shot={s} frames={frames} />
        </Sequence>
      ))}
      <Sequence from={outroFrom}>
        {reel.outro.bg && <ShotView reel={reel} shot={reel.outro.bg} frames={total - outroFrom} dim={0.55} />}
        <Slam reel={reel} title={reel.outro.title} lines={reel.outro.lines} size={120} />
      </Sequence>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
