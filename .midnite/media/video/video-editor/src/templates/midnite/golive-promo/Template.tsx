import { Fragment } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";

import { LIGHT } from "../../../shared/brand";
import { monoFontFamily } from "../../../shared/fonts";
import { LiquidWipe } from "../../../shared/LiquidWipe";
import { MidniteWordmark } from "../../../shared/MidniteWordmark";
import { Particles } from "../../../shared/Particles";
import { SmokeStreak } from "../../../shared/SmokeStreak";
import { T } from "./beats";
import { CONTENT } from "./content";
import { type Approach, Breath, Claim, LoopCard, Lockup, Outro, Slugs, Statement } from "./parts";
import { WIPES, themeAt, themeMixAt, wipeAt, wipeProgress } from "./wipes";

/**
 * The go-live promo, as a template: its whole grammar in fifteen bars, with a
 * placeholder wherever the promo has copy or a recording.
 *
 * Read `templates/midnite/golive-promo/README.md` first — it maps each section
 * here to the promo's own scene and explains the rules. This file only
 * sequences: what lands on which beat. What it says is in `content.ts`; when it
 * lands is in `beats.ts`; which stage it lands on is in `wipes.ts`.
 *
 * `annotate` draws the documentation over the picture: the section, its stage,
 * the wipe in flight, and a timeline of every section coloured by theme. The
 * `TemplateGolivePromoAnnotated` composition is this with it on.
 */

type Section = { id: string; from: number; to: number; title: string; note: string };

/** Every section, for the annotation overlay — and as the table of contents. */
export const SECTIONS: readonly Section[] = [
  { id: "intro", from: T.intro, to: T.lockup, title: "Intro", note: "The mark alone on black, glowing." },
  { id: "lockup", from: T.lockup, to: T.claims[0], title: "Lockup", note: "The name unfurls out of the mark; the qualifier is typed." },
  { id: "claim-1", from: T.claims[0], to: T.claims[1], title: "Claim · first hit", note: "LONG wipe to light (46f). Card struck in from the top." },
  { id: "claim-2", from: T.claims[1], to: T.claims[2], title: "Claim", note: "Hard cut on the bar, same stage. Card from the right." },
  { id: "claim-3", from: T.claims[2], to: T.claims[3], title: "Claim · to dark", note: "SHORT wipe to dark, right-to-left. Title ink follows the wipe." },
  { id: "claim-4", from: T.claims[3], to: T.statement[0], title: "Claim · to light", note: "SHORT wipe back to light, left-to-right." },
  { id: "statement-dark", from: T.statement[0], to: T.statement[1], title: "Statement · dark half", note: "One sentence across a change of stage." },
  { id: "statement-light", from: T.statement[1], to: T.breath, title: "Statement · light half", note: "Lands on the frame its wipe starts." },
  { id: "breath", from: T.breath, to: T.drop, title: "Breath", note: "Motes accelerate in and all reach the mark before the drop." },
  { id: "drop", from: T.drop, to: T.loops[0], title: "Drop", note: "SHORT wipe to dark + shimmer across the stage. Slugs typed." },
  { id: "loops", from: T.loops[0], to: T.late, title: "Colour cards", note: "One every half bar, each in its own colour, with a wash." },
  { id: "late", from: T.late, to: T.connect, title: "Claim · light again", note: "The stage can turn over inside an act, too." },
  { id: "connect", from: T.connect, to: T.end, title: "Outro · connect with", note: "Wipe to dark. Lower case, titles' font. Names shimmer in turn." },
  { id: "end", from: T.end, to: T.duration, title: "Outro · lockup", note: "The film ends on the lockup — rhymes with the intro." },
];

const APPROACH: readonly Approach[] = ["top", "right", "bottom", "left"];

export const Template: React.FC<{ annotate?: boolean }> = ({ annotate = false }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Backdrop />

    <Sequence from={T.intro} durationInFrames={T.claims[0] - T.intro} name="Intro + lockup">
      <Opening />
    </Sequence>

    {CONTENT.claims.map((c, i) => {
      const at = T.claims[i];
      const until = i < 3 ? T.claims[i + 1] : T.statement[0];
      return (
        <Sequence key={i} from={at} durationInFrames={until - at} name={`Claim ${i + 1}`}>
          <Claim title={c.title} shot={c.shot} at={at} theme={themeAt(at)} from={APPROACH[i % 4]} />
        </Sequence>
      );
    })}

    {CONTENT.statement.map((text, i) => {
      const at = T.statement[i];
      const until = i === 0 ? T.statement[1] : T.breath;
      return (
        <Sequence key={i} from={at} durationInFrames={until - at} name={`Statement ${i + 1}`}>
          <Statement text={text} at={at} theme={themeAt(at)} length={until - at} />
        </Sequence>
      );
    })}

    <Sequence from={T.breath} durationInFrames={T.drop - T.breath} name="Breath">
      <Breath at={T.breath} implode={T.implode} drop={T.drop} />
    </Sequence>

    <Sequence from={T.drop} durationInFrames={T.loops[0] - T.drop} name="Drop + slugs">
      <Slugs
        title={CONTENT.slugsTitle}
        shot={CONTENT.slugsShot}
        slugs={CONTENT.slugs}
        times={T.slugs.map((s) => s - T.drop)}
        at={T.drop}
      />
    </Sequence>
    {/* The shimmer across the whole stage on the drop — over everything, and short. */}
    <Sequence from={T.drop} durationInFrames={22} name="Drop shimmer">
      <SmokeStreak id="tpl-drop-streak" durationInFrames={22} direction={-1} intensity={0.6} seed={5} />
    </Sequence>

    {CONTENT.loops.map((l, i) => {
      const at = T.loops[i];
      const until = i < T.loops.length - 1 ? T.loops[i + 1] : T.late;
      return (
        <Fragment key={l.slug}>
          <Sequence from={at} durationInFrames={until - at} name={`/${l.slug}`}>
            <LoopCard slug={l.slug} blurb={l.blurb} length={until - at} />
          </Sequence>
          <Sequence from={at} durationInFrames={18} name={`/${l.slug} shimmer`}>
            <SmokeStreak id={`tpl-loop-streak-${i}`} durationInFrames={18} direction={i % 2 ? -1 : 1} intensity={0.42} seed={9 + i} />
          </Sequence>
        </Fragment>
      );
    })}

    <Sequence from={T.late} durationInFrames={T.connect - T.late} name="Late claim">
      <Claim title={CONTENT.late.title} shot={CONTENT.late.shot} at={T.late} theme={themeAt(T.late)} from="left" />
    </Sequence>

    <Sequence from={T.connect} durationInFrames={T.duration - T.connect} name="Outro">
      <Outro
        connect={CONTENT.connect}
        names={CONTENT.names}
        cta={CONTENT.cta}
        qualifier={CONTENT.qualifier}
        lockupAt={T.end - T.connect}
      />
    </Sequence>

    {annotate ? <Annotations /> : null}
  </AbsoluteFill>
);

/**
 * Black, then every wipe stacked in order, each covering the last — so the
 * stage at any frame is simply "whatever the most recent wipe has made it".
 * The light statement's stage carries a little atmosphere (a glow and a few
 * motes) mounted directly above its own wipe, so the next wipe covers it.
 */
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(frame, [T.statement[1], T.statement[1] + 30, T.drop - 20, T.drop], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      {WIPES.map((wipe) => (
        <Fragment key={wipe.id}>
          <LiquidWipe
            id={wipe.id}
            progress={wipeProgress(frame, wipe)}
            background={wipe.background}
            direction={wipe.direction}
            accent={wipe.accent}
            seed={wipe.seed}
          />
          {wipe.id === "tpl-wipe-statement-light" && glow > 0 ? (
            <AbsoluteFill style={{ opacity: glow }}>
              <AbsoluteFill
                style={{
                  backgroundImage:
                    `radial-gradient(70% 62% at 24% 80%, ${LIGHT.RAINBOW[2]}26, transparent 68%), ` +
                    `radial-gradient(56% 50% at 84% 22%, ${LIGHT.RAINBOW[4]}1f, transparent 70%)`,
                }}
              />
              <Particles count={18} theme="light" intensity={0.5} speed={1.15} />
            </AbsoluteFill>
          ) : null}
        </Fragment>
      ))}
    </AbsoluteFill>
  );
};

/** The mark alone, then the lockup built on screen out of it. */
const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.lockup) {
    const breathe = 0.5 + 0.5 * Math.sin((frame / 40) * Math.PI);
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <MidniteWordmark size={168} markOnly theme="dark" aura={0.5 + breathe * 0.3} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Lockup local={frame - T.lockup} qualifier={CONTENT.qualifier} />
    </AbsoluteFill>
  );
};

/* ── The documentation overlay ────────────────────────────────────────────── */

const Annotations: React.FC = () => {
  const frame = useCurrentFrame();
  const section = SECTIONS.find((s) => frame >= s.from && frame < s.to) ?? SECTIONS[SECTIONS.length - 1];
  const wipe = wipeAt(frame);
  const mix = themeMixAt(frame, 960);
  const bar = (frame / 51.0808).toFixed(2);

  const chip: React.CSSProperties = {
    fontFamily: monoFontFamily,
    fontSize: 18,
    color: "#e8e8f0",
    backgroundColor: "rgba(10, 10, 18, 0.82)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 10,
    padding: "10px 14px",
    lineHeight: 1.45,
  };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", right: 24, top: 20, maxWidth: 560, ...chip }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{section.title}</div>
        <div style={{ color: "#a9a9bd" }}>{section.note}</div>
        <div style={{ marginTop: 6 }}>
          frame {frame} · bar {bar} · stage {themeAt(frame)} · mix {mix.toFixed(2)}
        </div>
        {wipe ? (
          <div style={{ color: "#c9a7ff" }}>
            wipe {wipe.id} → {wipe.theme} · dir {wipe.direction > 0 ? "→" : "←"} · {wipe.length}f ·{" "}
            {Math.round(wipeProgress(frame, wipe) * 100)}%
          </div>
        ) : null}
      </div>

      {/* The timeline: each section as a block in its stage's colour, a playhead over it. */}
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 18, height: 26, ...chip, padding: 0, display: "flex", overflow: "hidden" }}>
        {SECTIONS.map((s) => (
          <div
            key={s.id}
            style={{
              flex: s.to - s.from,
              backgroundColor: themeAt(s.from) === "light" ? "#e9e9f1" : "#1b1b27",
              borderRight: "1px solid rgba(128,128,150,0.5)",
              opacity: s.id === section.id ? 1 : 0.7,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 3,
            left: `${(frame / T.duration) * 100}%`,
            backgroundColor: "#ff4fa3",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
