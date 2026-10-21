/**
 * The three faces, matching midnite's own split.
 *
 * `brandFontFamily` (Damion) sets the word **Midnite** and nothing else;
 * `uiFontFamily` (Poppins) sets everything a viewer actually reads. Setting a
 * whole line in the script face reads as one made-up word, which is the
 * mistake the app's `Wordmark` exists to prevent — see `MidniteWordmark`.
 *
 * Damion rather than the desktop app's Quick Kiss: Quick Kiss is licensed for
 * personal use only, and a rendered video is distribution. The website made
 * the same substitution for the same reason, and the face here is whichever
 * one the website is wearing — a video and a landing page are the same brand
 * seen twice, so they cannot be set in two different scripts.
 *
 * It was Kaushan Script until midnite-studio `fc36d817`
 * (*feat(website): set the wordmark in Damion*, #470) moved the site to Damion,
 * another SIL OFL script in the same hand. One thing has to move with the face
 * and it is not a preference: the clip headroom in `MidniteWordmark`, which is
 * measured per face. Damion's ink runs 0.104em past its advance box over
 * "Midnite" where Kaushan Script's ran 0.051em.
 *
 * The site self-hosts a Latin subset it built itself (`src/fonts/damion/`);
 * here the face comes through `@remotion/google-fonts`, which is the same
 * upstream `google/fonts` outline fetched at bundle time. A render is a file,
 * not an origin, so there is no third-party-request argument to answer — but
 * the *family* must stay in step with the site's, which is the point.
 *
 * `monoFontFamily` (JetBrains Mono) is for anything quoting the product's own
 * surface — a typed line, a command, a path. midnite drives command-line
 * agents, so a claim about it set in a proportional face reads as marketing
 * copy about a terminal; set in mono it reads as the terminal.
 */
import { loadFont as loadBrandFont } from "@remotion/google-fonts/Damion";
import { loadFont as loadMonoFont } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadUiFont } from "@remotion/google-fonts/Poppins";

export const { fontFamily: uiFontFamily } = loadUiFont("normal", {
  weights: ["300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin", "latin-ext"],
});

export const { fontFamily: brandFontFamily } = loadBrandFont("normal", {
  weights: ["400"],
  subsets: ["latin", "latin-ext"],
});

export const { fontFamily: monoFontFamily } = loadMonoFont("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
});
