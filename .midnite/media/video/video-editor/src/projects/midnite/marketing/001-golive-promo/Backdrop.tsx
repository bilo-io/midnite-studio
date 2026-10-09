import { Fragment } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { LIGHT, RAINBOW } from "../../../../shared/brand";
import { LiquidWipe } from "../../../../shared/LiquidWipe";
import { Particles } from "../../../../shared/Particles";
import { BUILD, STAGE } from "./beats";
import { Crescendo } from "./Crescendo";
import { WIPES, themeMixAt, wipeProgress } from "./wipes";

/**
 * The film's surface, from the first frame to the last.
 *
 * Five surfaces and four wipes between them, and it is one component rather
 * than a background per scene for the same reason the lockup is one object: the
 * surface is a property of the *film*, and a `<Sequence>` per act would unmount
 * each one at the boundary, which is precisely where the transition has to be
 * mid-flight.
 *
 * They stack, and the stack is the whole implementation. `LiquidWipe` covers the
 * frame completely at `progress: 1` and keeps covering it, so painting the black
 * of the intro and then leaving the wipes mounted on top of it gives the
 * sequence of surfaces for free: at any frame, the topmost wipe that has started
 * is the stage you are on, and the one beneath it is what is showing through its
 * leading edge. Nothing has to know what came before it.
 *
 * Which surface is which, and in what order, is in `wipes.ts` — it is shared
 * with `Promo`, because the lockup standing on this surface has to change
 * colour as each wipe passes under it.
 *
 * ── What is drawn between the wipes ─────────────────────────────────────────
 *
 * Two atmospheres, each sandwiched between the wipe that brings its stage in
 * and the wipe that takes it away, so that neither has to be faded out by hand
 * on a boundary — the wipe above simply covers it:
 *
 *   build-up  a wide bloom off the lower left with motes drifting in it, on the
 *             light stage, from "Empower everyone!" to the drop. The four
 *             feature cards are a bar each with two bars of nothing after them,
 *             and a held flat colour for five seconds under a rising track
 *             reads as a stall.
 *   harness   a slow violet bloom under the drop and the outro, drifting just
 *             enough that the last forty seconds are never a flat rectangle of
 *             near-black.
 *
 * The first is dropped entirely once the drop's wipe covers it. That is only
 * about cost — eighteen blurred discs and two radial gradients are not free to
 * rasterise, and from that frame they are invisible behind an opaque panel.
 *
 * A third, `Crescendo`, is mounted the same way `DriftingBloom` is — above the
 * whole wipe stack, as its own top-level sibling, self-gating on its own frame
 * window rather than needing a `<Sequence>` — but is not one of the two above:
 * it is centred on the mark rather than the stage's corners, spans one short
 * stretch (`BUILD.breath` to just past `STAGE.harness`) that overlaps the tail
 * of both other atmospheres, and has to sit *above* `wipe-harness` itself so
 * the drop's incoming panel does not bury the explosion it is timed to land
 * with. See `Crescendo.tsx` for why it is a separate file rather than a third
 * case bolted onto either atmosphere above.
 */
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();

  /*
    The build-up's atmosphere rises with the track and goes with it: from the
    moment the music empties at bar 17 the glow is already on its way out, so
    the frame the drop lands on is as close to bare as this film gets.
  */
  const glow = interpolate(
    frame,
    [BUILD.empower, BUILD.empower + 60, STAGE.harness - 110, STAGE.harness],
    [0, 1, 1, 0.1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const harnessLanded = frame >= STAGE.harness;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
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

          {/*
            The build-up's atmosphere goes immediately above the wipe that
            brings its stage in, so the *next* wipe in the stack covers it. Its
            strength is a gated opacity rather than a `<Sequence>`, because a
            sequence would give it a hard edge on exactly the frames a wipe is
            crossing.
          */}
          {wipe.id === "wipe-empower" && !harnessLanded ? (
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

      {/*
        The harness bloom is above every wipe rather than inside the stack,
        because from the drop onwards the stage keeps turning over — light for
        the graphs movement, dark again for the companion — and a bloom buried
        under those wipes would be covered by the first of them and never come
        back.

        Being on top means it has to be told when *not* to draw instead. It is a
        near-black page's atmosphere: a violet wash on 99%-lightness paper is not
        atmosphere, it is a colour cast. `themeMixAt` at the middle of the frame
        fades it with the stage rather than switching it, so it goes out under
        the wipe that takes the page white and comes back under the one that
        brings it back.
      */}
      {harnessLanded ? <DriftingBloom dark={1 - themeMixAt(frame, 960)} /> : null}

      {/*
        Above everything, including `DriftingBloom` — the explosion has to read
        on top of the harness's own atmosphere, not underneath it, on the
        frames both are mounted at once.
      */}
      <Crescendo />
    </AbsoluteFill>
  );
};

const DriftingBloom: React.FC<{ dark: number }> = ({ dark }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 4;
  if (dark <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        opacity: dark,
        backgroundImage: `radial-gradient(60% 50% at ${50 + drift}% 45%, ${RAINBOW[2]}22, transparent 70%)`,
      }}
    />
  );
};
