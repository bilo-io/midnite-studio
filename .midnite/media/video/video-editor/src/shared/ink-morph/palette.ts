/**
 * The ink-morph look, as numbers.
 *
 * Two grounds only, and the film alternates between them hard: cream paper and
 * a black void. Everything drawn on them is black brush ink, plus *one* accent
 * per scene from a fixed set of three. A scene that reaches for two accents is
 * usually two scenes.
 *
 * Read off frame samples of the reference (see the template's README); the hex
 * values are this kit's own, picked to sit together rather than matched to any
 * frame.
 */
import { loadFont as loadScriptFont } from "@remotion/google-fonts/Caveat";
import { loadFont as loadSerifFont } from "@remotion/google-fonts/LibreCaslonText";

/** Titles and credit names: a bookish serif, never bold on screen. */
export const { fontFamily: serifFamily } = loadSerifFont("normal", {
  weights: ["400"],
  subsets: ["latin", "latin-ext"],
});

/** The handwritten line above a credit name. */
export const { fontFamily: scriptFamily } = loadScriptFont("normal", {
  weights: ["500"],
  subsets: ["latin", "latin-ext"],
});

export const INK = {
  /** The page. Warm, never white. */
  paper: "#efe9d6",
  /** The page's fibres and the shadow side of a wash. */
  paperShade: "#ddd5bc",
  /** A cooler wash, used under the title card. */
  wash: "#dfe8d5",
  /** The void. Not pure black, so chalk on it keeps a little warmth. */
  void: "#0b0a09",
  /** Brush ink on paper. */
  ink: "#141210",
  /** Chalk on the void. */
  chalk: "#f3efe4",
} as const;

export const ACCENTS = {
  magenta: "#d6386a",
  teal: "#7fd1c3",
  ember: "#e8452c",
} as const;

export type Accent = keyof typeof ACCENTS;

export const STAGE = { width: 1920, height: 1080 } as const;
/** Half the frame diagonal: a circle this big centred on screen covers it. */
export const COVER = Math.hypot(STAGE.width, STAGE.height) / 2;
