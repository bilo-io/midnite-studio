import { LONG_WIPE, createStage, wipeTo } from "../../../shared/golive/stage";
import { T } from "./beats";

/**
 * Every change of stage in the template, in one list. The rules (long first
 * wipe, short drops, alternating directions, unique ids and seeds, the accent
 * from the arriving theme's ramp) are written up in `shared/golive/stage.ts`,
 * which builds `STAGE` from this list; `Template.tsx` hands `STAGE` to every
 * part through `StageProvider`.
 *
 * The HUD act turns the stage over on every bar — light, dark, light… — so
 * each of the neon-HUD kit's diagrams is shown on both pages.
 */
export const WIPES = [
  wipeTo("light", "tpl-wipe-first-hit", T.claims[0], 1, 3, LONG_WIPE),
  wipeTo("dark", "tpl-wipe-claim-dark", T.claims[2], -1, 7),
  wipeTo("light", "tpl-wipe-claim-light", T.claims[3], 1, 13),
  wipeTo("dark", "tpl-wipe-statement-dark", T.statement[0], -1, 11),
  wipeTo("light", "tpl-wipe-statement-light", T.statement[1], 1, 17),
  wipeTo("dark", "tpl-wipe-drop", T.drop, -1, 23),
  wipeTo("light", "tpl-wipe-late", T.late, 1, 29),
  wipeTo("dark", "tpl-wipe-chapter", T.chapter, -1, 31),
  ...T.hud.map((at, i) =>
    i % 2 === 0 ? wipeTo("light", `tpl-wipe-hud-${i}`, at, 1, 37 + i * 2) : wipeTo("dark", `tpl-wipe-hud-${i}`, at, -1, 37 + i * 2),
  ),
  wipeTo("dark", "tpl-wipe-outro", T.connect, -1, 61),
];

export const STAGE = createStage(WIPES);
export const { themeAt, themeMixAt, wipeProgress, wipeAt } = STAGE;
