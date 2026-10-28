import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { INK, scriptFamily } from "../../../shared/ink-morph/palette";
import { Reveal } from "../../../shared/ink-morph/reveals";
import { DURATION, FPS, PLACED } from "./beats";
import { CONTENT } from "./content";
import { SCENE_COMPONENTS } from "./scenes";

/**
 * The ink-morph explainer, as a template: ten drawn scenes on two grounds,
 * each arriving through the last (see `templates/explainers/ink-morph/
 * README.md`). This file only sequences; what each scene draws is in
 * `scenes.tsx`, what it says is in `content.ts` and when is in `beats.ts`.
 *
 * Each scene is mounted from the start of its own reveal until the end of the
 * next one's, so the incoming scene always has the outgoing one under it.
 */
export { DURATION };

export const Template: React.FC<{ annotate?: boolean }> = ({ annotate = false }) => (
  <AbsoluteFill style={{ backgroundColor: INK.void }}>
    {PLACED.map((slot, i) => {
      const next = PLACED[i + 1];
      const length = (next ? next.from + next.revealFrames : DURATION) - slot.from;
      const Scene = SCENE_COMPONENTS[slot.id];
      return (
        <Sequence key={slot.id} from={slot.from} durationInFrames={length} name={`${i + 1} · ${slot.id} (${slot.reveal.kind})`}>
          <Reveal spec={slot.reveal} frames={slot.revealFrames}>
            <Scene frames={slot.frames} accent={CONTENT.scenes[slot.id].accent} />
          </Reveal>
        </Sequence>
      );
    })}
    <Soundtrack />
    {annotate ? <Annotations /> : null}
  </AbsoluteFill>
);

const Soundtrack: React.FC = () => {
  const { music, voiceover, musicVolume, musicUnderVoice } = CONTENT.audio;
  const bed = voiceover ? musicUnderVoice : musicVolume;
  return (
    <>
      {music ? (
        <Audio
          src={staticFile(music)}
          volume={(f) => interpolate(f, [0, FPS, DURATION - FPS * 2, DURATION], [0, bed, bed, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      ) : null}
      {voiceover ? <Audio src={staticFile(voiceover)} /> : null}
    </>
  );
};

/** Scene, reveal, the voice-over note and the clock — `TemplateInkMorphAnnotated`. */
const Annotations: React.FC = () => {
  const frame = useCurrentFrame();
  const current = [...PLACED].reverse().find((s) => frame >= s.from) ?? PLACED[0];
  const local = frame - current.from;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: 28 }}>
      <div
        style={{
          display: "flex",
          gap: 28,
          padding: "10px 18px",
          backgroundColor: "rgba(11,10,9,0.78)",
          color: INK.chalk,
          fontFamily: scriptFamily,
          fontSize: 30,
        }}
      >
        <span>
          {current.index + 1} · {current.id}
        </span>
        <span>arrives by {current.reveal.kind}</span>
        <span>{CONTENT.scenes[current.id].vo}</span>
        <span style={{ marginLeft: "auto" }}>
          {(frame / FPS).toFixed(1)}s · {(local / FPS).toFixed(1)}s in
        </span>
      </div>
    </AbsoluteFill>
  );
};
