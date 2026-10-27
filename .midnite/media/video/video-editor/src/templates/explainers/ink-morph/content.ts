import type { Accent } from "../../../shared/ink-morph/palette";
import type { SceneId } from "./beats";

/**
 * Everything the template *says*, and the one accent each scene wears — the
 * only file to edit to turn it into a film. Square brackets mark a placeholder.
 *
 * The reference puts almost no words on screen: a voice-over carries the
 * argument and the picture illustrates it a beat behind. So each scene here
 * has a `vo` line, which is a note for the script and the annotated render,
 * not a caption. Write the voice-over first, then fit the scene lengths in
 * `beats.ts` to it.
 *
 * Accent rule worth keeping: one per scene, and change it when the scene
 * changes. Two accents in one picture is the moment the look goes generic.
 */
export const CONTENT = {
  title: "[The Title]",
  author: "[Author]",

  scenes: {
    screen: { accent: "ember", vo: "[VO: the hook — who is talking, and to whom]" },
    overhead: { accent: "magenta", vo: "[VO: the everyday object the argument starts from]" },
    title: { accent: "magenta", vo: "[VO: name the book / subject, then let the card hold]" },
    room: { accent: "ember", vo: "[VO: the setting, said flatly]" },
    lens: { accent: "teal", vo: "[VO: zoom in on one detail; it opens the next idea]" },
    slit: { accent: "magenta", vo: "[VO: the turn — what it is really about]" },
    almond: { accent: "magenta", vo: "[VO: a short aside]" },
    morph: { accent: "teal", vo: "[VO: the long riff; the picture keeps changing under it]" },
    hold: { accent: "magenta", vo: "[VO: the verdict, then silence while the card holds]" },
    credits: { accent: "teal", vo: "[no VO]" },
  } satisfies Record<SceneId, { accent: Accent; vo: string }>,

  credits: [
    { role: "[made by]", name: "[NAME ONE]" },
    { role: "[voice of]", name: "[NAME TWO]" },
  ],

  audio: {
    /** Under `assets/`. The reference is voice-led with a sparse score under it. */
    music: null as string | null,
    voiceover: null as string | null,
    musicVolume: 0.5,
    musicUnderVoice: 0.15,
  },
};
