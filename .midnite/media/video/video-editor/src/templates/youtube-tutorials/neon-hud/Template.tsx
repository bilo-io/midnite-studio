import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { Backdrop } from "../../../shared/neon-hud/Backdrop";
import { Headline } from "../../../shared/neon-hud/Headline";
import { HudLabel, HudPill } from "../../../shared/neon-hud/HudPill";
import { STAGE, TONES } from "../../../shared/neon-hud/palette";
import { ChapterCard, Scene } from "../../../shared/neon-hud/Scene";
import { VisualView } from "../../../shared/neon-hud/Visuals";
import { SfxSound } from "../../../shared/Sfx";
import { BEAT, OUTRO_BEATS, SCENE_BEATS, beatAt } from "./beats";
import { CONTENT, type Slot } from "./content";

/**
 * The neon-HUD tutorial, as a template: a hook, two chapters and an outro, in
 * the visual grammar of the reference (see `templates/youtube-tutorials/
 * neon-hud/README.md`). This file only sequences; what it says is in
 * `content.ts` and when it lands is in `beats.ts`.
 */

type Placed = { slot: Slot; from: number; index: number };

/** Lays the timeline end to end, eight beats a slot. */
export const place = (timeline: readonly Slot[]): Placed[] =>
  timeline.map((slot, index) => ({ slot, index, from: beatAt(index * SCENE_BEATS) }));

const PLACED = place(CONTENT.timeline);
const OUTRO_FROM = beatAt(CONTENT.timeline.length * SCENE_BEATS);
export const DURATION = beatAt(CONTENT.timeline.length * SCENE_BEATS + OUTRO_BEATS);

export const Template: React.FC<{ annotate?: boolean }> = ({ annotate = false }) => {
  let chapter = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: STAGE.base }}>
      <Backdrop />

      {PLACED.map(({ slot, from, index }) => {
        const len = beatAt((index + 1) * SCENE_BEATS) - from;
        if ("chapter" in slot) {
          chapter += 1;
          return (
            <Sequence key={index} from={from} durationInFrames={len} name={`Chapter ${chapter}`}>
              <ChapterCard index={chapter} title={slot.chapter} beat={BEAT} beats={SCENE_BEATS} />
            </Sequence>
          );
        }
        return (
          <Sequence key={index} from={from} durationInFrames={len} name={`Scene ${index + 1} · ${slot.scene.visual.kind}`}>
            <Scene {...slot.scene} beat={BEAT} beats={SCENE_BEATS} seed={`s${index}`} />
          </Sequence>
        );
      })}

      <Sequence from={OUTRO_FROM} durationInFrames={DURATION - OUTRO_FROM} name="Outro">
        <Outro />
      </Sequence>

      <Soundtrack />
      {annotate ? <Annotations /> : null}
    </AbsoluteFill>
  );
};

/**
 * The closing beat: the payoff pair over the check badge, then the channel
 * line and a subscribe pill. It runs twice a scene's length over the bed's
 * break, and fades out with the music.
 */
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const len = DURATION - OUTRO_FROM;
  const fade = interpolate(frame, [0, 5, len - 1.5 * BEAT, len], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <Headline a={CONTENT.outro.a} b={CONTENT.outro.b} aAt={0.5 * BEAT} bAt={2 * BEAT} seed="outro" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 280, gap: 26 }}>
        <VisualView visual={{ kind: "badge", caption: CONTENT.outro.caption }} at={Math.round(1 * BEAT)} />
        <HudPill text={CONTENT.outro.cta} at={Math.round(4 * BEAT)} tone="blue" size={18} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Bed, voice and punctuation. Whooshes peak *on* each cut (the shared `SfxSound`
 * aligns a sample's loudest frame to the beat rather than its first), the
 * bigger one marks a chapter, and the impact lands with the outro.
 */
const Soundtrack: React.FC = () => {
  const { music, voiceover, musicVolume, musicUnderVoice, sfx } = CONTENT.audio;
  const bed = voiceover ? musicUnderVoice : musicVolume;
  return (
    <>
      {music ? (
        <Audio
          src={staticFile(music)}
          volume={(f) =>
            interpolate(f, [0, BEAT * 2, DURATION - BEAT * 4, DURATION], [0, bed, bed, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
      {voiceover ? <Audio src={staticFile(voiceover)} /> : null}
      {sfx
        ? PLACED.slice(1).map(({ slot, from, index }) => (
            <SfxSound key={index} atFrame={from} kind={"chapter" in slot ? "big" : "light"} volume={"chapter" in slot ? 0.35 : 0.18} />
          ))
        : null}
      {sfx ? <SfxSound atFrame={OUTRO_FROM} kind="impact" volume={0.45} /> : null}
    </>
  );
};

/** Slot index, kind and beat, over the picture — `TemplateNeonHudAnnotated`. */
const Annotations: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = (frame - beatAt(0)) / BEAT;
  const slot = Math.floor(beat / SCENE_BEATS);
  const current = PLACED[slot];
  const label = current
    ? "chapter" in current.slot
      ? `chapter card · "${current.slot.chapter}"`
      : `scene · ${current.slot.scene.visual.kind}`
    : "outro";
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: 28 }}>
      <div style={{ display: "flex", gap: 30, padding: "10px 16px", backgroundColor: "rgba(0,0,0,0.7)", border: `1px solid ${TONES.amber}` }}>
        <HudLabel text={`slot ${slot + 1}`} color={TONES.amber} />
        <HudLabel text={label} color={TONES.amber} />
        <HudLabel text={`beat ${beat.toFixed(2)} (${(beat % SCENE_BEATS).toFixed(2)} in slot)`} color={TONES.amber} />
      </div>
    </AbsoluteFill>
  );
};
