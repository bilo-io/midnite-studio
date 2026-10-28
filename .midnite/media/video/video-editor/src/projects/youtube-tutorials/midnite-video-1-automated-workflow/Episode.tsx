import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { themeRainbowText } from "../../../shared/brand";
import { uiFontFamily } from "../../../shared/fonts";
import { OnStage, StageAtmosphere } from "../../../shared/golive/hud";
import { Breath, Slugs, StageWipes, Statement } from "../../../shared/golive/parts";
import { LONG_WIPE, type Stage, StageProvider, type Wipe, createStage, wipeTo } from "../../../shared/golive/stage";
import { Headline } from "../../../shared/neon-hud/Headline";
import { HudLabel, HudPill } from "../../../shared/neon-hud/HudPill";
import { TONES } from "../../../shared/neon-hud/palette";
import { Say } from "../../../shared/neon-hud/Say";
import { ChapterCard, Scene } from "../../../shared/neon-hud/Scene";
import { VisualView } from "../../../shared/neon-hud/Visuals";
import { projectFile } from "../../../shared/projectFile";
import { SFX, SfxSound } from "../../../shared/Sfx";
import { SmokeStreak } from "../../../shared/SmokeStreak";
import { CONTENT, PROJECT_ID, type Slot } from "./content";
import { CUTS, type Cut, type CutId, frameAt } from "./cuts";
import { HOME, Mark, type Station, UNFURL, headOf, headlineStation, textWidth } from "./Mark";
import * as VOICE_BED from "./voice-bed";
import * as VOICE_IRON_ARIA from "./voice-iron-aria";

/**
 * Midnite video 1 — the automated workflow, from v4 on the golive template.
 *
 * The slots, words and voice are v3's; the picture stands on the golive kit's
 * two stages (`shared/golive/`): a long wipe to the light page on chapter 1,
 * back to dark on chapter 2, the statement split across a wipe, dark again on
 * the drop into chapter 3 — every flip listed in `CONTENT.stage`. The HUD
 * scenes are the neon-HUD kit in midnite's skin (`OnStage`), so they follow the
 * page across each wipe. The golive beats in it: the statement, the breath
 * before a drop, the shimmer across the stage on a drop, the typed slugs, the
 * mark in the corner and the lockup the film ends on.
 *
 * `cut` picks the song and with it every slot's length (`cuts.ts`): `bed` is
 * v3's timing, `ironAria` the go-live promo's track.
 */

const asset = projectFile(PROJECT_ID);

/** Where each cut's voice-over put each spoken part, by slot (`scripts/make-midnite-video-1-voiceover.mjs`). */
const VOICE = { bed: VOICE_BED.PARTS, ironAria: VOICE_IRON_ARIA.PARTS } as const;
type Parts = (typeof VOICE)[CutId][number];

type Placed = { slot: Slot; index: number; from: number; len: number; beats: number };

const place = (cut: Cut): Placed[] =>
  CONTENT.timeline.map((slot, index) => {
    const start = cut.slots[index];
    const next = cut.slots[index + 1] ?? cut.outro;
    const from = frameAt(cut, start);
    return { slot, index, from, len: frameAt(cut, next) - from, beats: next - start };
  });

export const durationOf = (cutId: CutId): number => frameAt(CUTS[cutId], CUTS[cutId].end);

/** Every change of stage, from `CONTENT.stage`, placed on this cut's slots. Directions alternate. */
const stageFor = (cut: Cut, placed: Placed[]): Stage => {
  const wipes: Wipe[] = CONTENT.stage.map((change, i) => {
    const p = placed[change.slot];
    const at = change.half ? p.from + Math.round(p.len / 2) : p.from;
    const direction = change.theme === "light" ? 1 : -1;
    return wipeTo(change.theme, `ep-wipe-${i}`, at, direction, 3 + i * 4, "long" in change && change.long ? LONG_WIPE : undefined);
  });
  wipes.push(wipeTo("dark", "ep-wipe-outro", frameAt(cut, cut.outro), -1, 31));
  return createStage(wipes);
};

export const Episode: React.FC<{ cut: CutId; annotate?: boolean }> = ({ cut: cutId, annotate = false }) => {
  const cut = CUTS[cutId];
  const placed = place(cut);
  const stage = stageFor(cut, placed);
  const outroFrom = frameAt(cut, cut.outro);
  const duration = frameAt(cut, cut.end);
  const lockupAt = outroFrom + Math.round((duration - outroFrom) / 2);
  /* The name folds back in three beats from the end, so the last frames are the first one's picture. */
  const foldAt = duration - Math.round(3 * cut.beat);
  const stations = stationsFor(cut, placed, outroFrom, lockupAt, foldAt);
  let chapter = 0;

  return (
    <StageProvider stage={stage}>
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <StageWipes />
        <StageAtmosphere />

        {placed.map((p) => {
          if ("chapter" in p.slot) chapter += 1;
          return (
            <Sequence key={p.index} from={p.from} durationInFrames={p.len} name={`${p.index + 1} · ${kindOf(p.slot)}`}>
              <SlotView placed={p} chapter={chapter} cut={cut} isBreath={p.index === cut.breath} voice={VOICE[cutId][p.index]} />
            </Sequence>
          );
        })}

        {/* The golive drop: a shimmer across the whole stage with the wipe, over everything. */}
        {cut.drops.map((slot, i) => (
          <Sequence key={slot} from={placed[slot].from} durationInFrames={22} name={`Drop shimmer · slot ${slot + 1}`}>
            <SmokeStreak id={`ep-drop-streak-${i}`} durationInFrames={22} direction={i % 2 ? 1 : -1} intensity={0.6} seed={5 + i * 6} />
          </Sequence>
        ))}

        <Sequence from={outroFrom} durationInFrames={duration - outroFrom} name="Outro">
          <Outro cut={cut} at={outroFrom} length={duration - outroFrom} foldAt={foldAt - outroFrom} />
        </Sequence>

        <Mark cut={cutId} stations={stations} lockupAt={lockupAt} foldAt={foldAt} qualifier={CONTENT.outro.qualifier} />

        <Soundtrack cut={cut} placed={placed} />
        {annotate ? <Annotations cut={cut} placed={placed} stage={stage} /> : null}
      </AbsoluteFill>
    </StageProvider>
  );
};

/**
 * Where the one mark (`Mark.tsx`) stands, slot by slot: at the head of each
 * title, flying there on the cut. Statement halves get a station each; the
 * breath draws it to the centre over the breath's own length, driven hard;
 * the outro takes it to the HUD headline's head and then to the centre, where
 * the lockup unfurls out of it. It starts and ends at `HOME`: a scene with a
 * `delay` keeps it there until the scene starts building.
 */
const stationsFor = (cut: Cut, placed: Placed[], outroFrom: number, lockupAt: number, foldAt: number): Station[] => {
  const stations: Station[] = [{ at: 0, ...HOME }];
  for (const p of placed) {
    const { slot, from, len } = p;
    if ("scene" in slot) stations.push(headlineStation(from + Math.round((slot.scene.delay ?? 0) * cut.beat), slot.scene));
    else if ("chapter" in slot)
      stations.push(headOf(from, textWidth(slot.chapter.toUpperCase(), 104, 800, 0.02), CHAPTER_TITLE_Y, 128));
    else if ("statement" in slot) {
      const half = Math.round(len / 2);
      slot.statement.forEach((text, i) =>
        stations.push(headOf(from + i * half, textWidth(text, 104, 600, 0.01), 540, 116)),
      );
    } else stations.push({ at: from, x: SLUGS_MARK.x, y: SLUGS_MARK.y, size: SLUGS_MARK.size });
    if (p.index === cut.breath) {
      const at = from + breathStart(p, cut);
      stations.push({ at, x: 960, y: 540, size: 250, fly: from + len - Math.round(0.6 * cut.beat) - at, drive: 1.85 });
    }
  }
  stations.push({ ...headlineStation(outroFrom, CONTENT.outro), drive: 1.3 });
  stations.push({ at: lockupAt - 18, x: 960, y: LOCKUP_Y, size: 168, fly: 18, drive: 1.5 });
  stations.push({ at: foldAt, ...HOME, fly: UNFURL + 8, drive: 1.3 });
  return stations;
};

/** The chapter card's title line: the column is centred, and the label and rule above push the title down. */
const CHAPTER_TITLE_Y = 580;
/** The slugs' caption line: its mark slot at the window's left edge, 64px down on a 60px line. */
const SLUGS_MARK = { x: (1920 - 1391) / 2 + 25, y: 64 + 30, size: 64 } as const;
/** The lockup's line, with the call to action under it. */
const LOCKUP_Y = 500;

const kindOf = (slot: Slot): string =>
  "scene" in slot ? `scene · ${slot.scene.visual.kind}` : "chapter" in slot ? "chapter" : "statement" in slot ? "statement" : "slugs";

/**
 * When each slug is typed, in frames into its slot. With a spoken line in two
 * parts and a `star`, the slugs before the star are spread over the first part
 * as it names them, and the star lands on the second part's third syllable or
 * so — "with a SWARM". Otherwise one a beat.
 */
const slugTimes = (s: { slugs: readonly string[]; star?: number }, voice: Parts, from: number, cut: Cut): number[] => {
  if (s.star === undefined || voice.length < 2) return s.slugs.map((_, i) => Math.round((1 + i) * cut.beat));
  const [[a, b], [c]] = voice;
  const lead = s.slugs.slice(0, s.star);
  return s.slugs.map((_, i) => (i < lead.length ? Math.round(a + ((b - a) * i) / lead.length) : c + 6) - from);
};

/** The breath takes the slot's last two and a half beats. */
const breathStart = (p: Placed, cut: Cut): number => p.len - Math.round(2.5 * cut.beat);

const SlotView: React.FC<{ placed: Placed; chapter: number; cut: Cut; isBreath: boolean; voice: Parts }> = ({
  placed: { slot, from, len, beats, index },
  chapter,
  cut,
  isBreath,
  voice,
}) => {
  const say = slot.say ? <Say text={slot.say} beat={cut.beat} beats={beats} /> : null;

  if ("statement" in slot) {
    const half = Math.round(len / 2);
    return (
      <>
        <Sequence durationInFrames={half} layout="none">
          <Statement text={slot.statement[0]} at={from} theme="dark" length={half} />
        </Sequence>
        <Sequence from={half} durationInFrames={len - half} layout="none">
          <Statement text={slot.statement[1]} at={from + half} theme="light" length={len - half} />
        </Sequence>
        <OnStage at={from}>{say}</OnStage>
      </>
    );
  }

  if ("slugs" in slot) {
    return (
      <>
        <Slugs
          title={slot.slugs.title}
          slugs={slot.slugs.slugs}
          times={slugTimes(slot.slugs, voice, from, cut)}
          at={from}
          mark={false}
          star={slot.slugs.star}
        />
        <OnStage at={from}>{say}</OnStage>
      </>
    );
  }

  if ("chapter" in slot) {
    return (
      <OnStage at={from}>
        <ChapterCard index={chapter} title={slot.chapter} beat={cut.beat} beats={beats} />
        {say}
      </OnStage>
    );
  }

  /* The breath: the scene fades out early, then the mark comes to centre and the motes implode into it. */
  const start = isBreath ? breathStart({ slot, index, from, len, beats }, cut) : len;
  return (
    <>
      <OnStage at={from}>
        <Scene {...slot.scene} beat={cut.beat} beats={isBreath ? start / cut.beat + 0.4 : beats} seed={`s${index}`} />
        {say}
      </OnStage>
      {isBreath ? (
        <Sequence from={start} layout="none">
          <Breath at={from + start} implode={from + len - Math.round(0.6 * cut.beat)} drop={from + len} mark={false} />
        </Sequence>
      ) : null}
    </>
  );
};

/**
 * Two halves: the HUD outro (headline, badge) and then the golive lockup. The
 * lockup itself is the film's one mark (`Mark.tsx`) flying to the centre and
 * unfurling the name, then folding it back in to end where the film began;
 * this draws only the call to action under it.
 */
const Outro: React.FC<{ cut: Cut; at: number; length: number; foldAt: number }> = ({ cut, at, length, foldAt }) => {
  const frame = useCurrentFrame();
  const B = cut.beat;
  const lockupAt = Math.round(length / 2);
  const hudOut = interpolate(frame, [lockupAt - 0.5 * B, lockupAt], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  /* The call to action goes before the name folds back in, so the film ends on the mark alone. */
  const fade = interpolate(frame, [foldAt - 0.75 * B, foldAt], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {frame < lockupAt ? (
        <OnStage at={at}>
          <AbsoluteFill style={{ opacity: hudOut }}>
            <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
              <Headline a={CONTENT.outro.a} b={CONTENT.outro.b} aAt={0.5 * B} bAt={2 * B} seed="outro" />
            </AbsoluteFill>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 280, gap: 26 }}>
              <VisualView visual={{ kind: "badge", caption: CONTENT.outro.caption }} at={Math.round(B)} />
            </AbsoluteFill>
          </AbsoluteFill>
        </OnStage>
      ) : (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: LOCKUP_Y + 84 + 40 }}>
          <div
            style={{
              opacity: interpolate(frame - lockupAt, [30, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              fontFamily: uiFontFamily,
              fontWeight: 600,
              fontSize: 44,
              ...themeRainbowText("dark"),
              padding: "0.12em 0.12em 0.28em",
              margin: "-0.12em -0.12em -0.28em",
            }}
          >
            {CONTENT.outro.cta}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/**
 * Music, voice and punctuation. The voice-over runs from frame 0 to the outro,
 * one line a slot, so the music sits at `musicUnderVoice` throughout — a
 * steady duck reads better than pumping between sentences — and comes back up
 * to `musicVolume` over the outro's first two beats. A whoosh peaks on each
 * cut; the stock riser (bed cut only) swells into drop B; the promo's closing
 * swoosh opens the outro.
 */
const Soundtrack: React.FC<{ cut: Cut; placed: Placed[] }> = ({ cut, placed }) => {
  const { music, voiceover, musicVolume, musicUnderVoice, riserVolume } = cut.audio;
  const outroFrom = frameAt(cut, cut.outro);
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const musicAt = (f: number) =>
    interpolate(f, [0, cut.beat * 2], [0, 1], clamp) *
    interpolate(f, [outroFrom, outroFrom + cut.beat * 2], [musicUnderVoice, musicVolume], clamp);
  return (
    <>
      <Audio src={asset(music)} volume={musicAt} />
      <Audio src={asset(voiceover)} />
      {placed.slice(1).map(({ slot, from, index }) => (
        <SfxSound key={index} atFrame={from} kind={"chapter" in slot ? "big" : "light"} volume={"chapter" in slot ? 0.35 : 0.18} />
      ))}
      {cut.riser !== null && riserVolume > 0 ? <Riser cut={cut} peakAt={placed[cut.riser].from} volume={riserVolume} /> : null}
      {/*
        The go-live promo's closing swoosh (its `big`, at its 0.5), where v4–v7 had the
        template's impact — a low hit with an 8 s tail that read as a loud, odd thud
        under the last line. The swoosh is −23 LUFS on its own, so at 0.5 it sits
        well under the −16 voice and inside the music coming back up.
      */}
      <SfxSound atFrame={outroFrom} kind="big" volume={0.5} />
    </>
  );
};

/**
 * The stock riser, peaking on `peakAt` with eight beats of swell, faded in over
 * its first half-beat rather than arriving (v1's hard step).
 */
const Riser: React.FC<{ cut: Cut; peakAt: number; volume: number }> = ({ cut, peakAt, volume }) => {
  const { file, peak } = SFX.riser;
  const head = Math.round(8 * cut.beat);
  const fadeIn = Math.round(0.5 * cut.beat);
  return (
    <Sequence from={peakAt - head} layout="none">
      <Audio
        src={staticFile(file)}
        trimBefore={peak - head}
        volume={(f) => interpolate(f, [0, fadeIn], [0, volume], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
    </Sequence>
  );
};

/** Slot, kind, beat and stage, over the picture — the `…Annotated` compositions. */
const Annotations: React.FC<{ cut: Cut; placed: Placed[]; stage: Stage }> = ({ cut, placed, stage }) => {
  const frame = useCurrentFrame();
  const current = [...placed].reverse().find((p) => frame >= p.from);
  const inOutro = frame >= frameAt(cut, cut.outro);
  const label = inOutro || !current ? "outro" : `slot ${current.index + 1} · ${kindOf(current.slot)}`;
  const beat = frame / cut.beat;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: 28 }}>
      <div style={{ display: "flex", gap: 30, padding: "10px 16px", backgroundColor: "rgba(0,0,0,0.7)", border: `1px solid ${TONES.amber}` }}>
        <HudLabel text={label} color={TONES.amber} />
        <HudLabel text={`beat ${beat.toFixed(2)} · bar ${(beat / 4).toFixed(2)}`} color={TONES.amber} />
        <HudLabel text={`stage ${stage.themeAt(frame)} · mix ${stage.themeMixAt(frame, 960).toFixed(2)}`} color={TONES.amber} />
        {stage.wipeAt(frame) ? <HudLabel text={`wipe ${stage.wipeAt(frame)?.id}`} color={TONES.amber} /> : null}
      </div>
      <HudPill text={inOutro ? "outro" : "on air"} at={0} tone="amber" size={12} />
    </AbsoluteFill>
  );
};
