import { AbsoluteFill, useCurrentFrame } from "remotion";

import { MidniteWordmark } from "../MidniteWordmark";
import { Backdrop } from "../neon-hud/Backdrop";
import { brandSkin, HudSkinProvider } from "../neon-hud/skin";
import { useStage } from "./stage";

/**
 * The neon-HUD kit, standing on the golive stage.
 *
 * Everything in `neon-hud/` reads its colours from a skin; this file supplies
 * midnite's (`brandSkin`) at the stage's own mix — 0 on dark, 1 on light and a
 * blend while a wipe's smoke is crossing — so a headline, a pill or any
 * diagram can sit on either page and follow the page across a wipe, the same
 * way the golive parts' type does with `useInk`.
 */

/**
 * Wrap HUD components in this. `at` is the composition frame the wrapper's
 * `<Sequence>` starts on; `x` is the column whose mix to follow (the centre,
 * where the kit draws).
 */
export const OnStage: React.FC<{ at: number; x?: number; children: React.ReactNode }> = ({ at, x = 960, children }) => {
  const frame = useCurrentFrame();
  const { themeMixAt } = useStage();
  return <HudSkinProvider skin={brandSkin(themeMixAt(at + frame, x))}>{children}</HudSkinProvider>;
};

/**
 * The HUD backdrop's atmosphere — lift, motes, vignette — without its page, over
 * the golive wipes. Mount it after the wipes; `at` is the composition frame
 * its `<Sequence>` starts on (0 at the top level).
 */
export const StageAtmosphere: React.FC<{ at?: number; motes?: number }> = ({ at = 0, motes = 22 }) => (
  <OnStage at={at}>
    <Backdrop base={null} motes={motes} />
  </OnStage>
);

/**
 * The mark in the top-left corner, cut for whichever stage is under it — the
 * brand's signature on a HUD scene, which centres its headline and so has no
 * line head for the mark to sit at the way a golive claim does. `opacity` lets
 * a caller hide it under a beat that draws the mark itself (a lockup, a breath).
 * `at` is the composition frame its `<Sequence>` starts on.
 */
export const MarkBug: React.FC<{ at?: number; opacity?: number }> = ({ at = 0, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { themeMixAt } = useStage();
  const theme = themeMixAt(at + frame, 90) > 0.5 ? "light" : "dark";
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 64, top: 52, opacity }}>
        <MidniteWordmark size={46} markOnly theme={theme} aura={0.35} />
      </div>
    </AbsoluteFill>
  );
};
