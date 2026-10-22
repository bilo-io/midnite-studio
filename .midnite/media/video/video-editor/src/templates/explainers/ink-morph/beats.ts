import type { RevealSpec } from "../../../shared/ink-morph/reveals";

/**
 * The template's clock. 24fps, because the film is drawn on twos and 12
 * drawings a second only divides evenly into a 24fps timeline.
 *
 * The reference runs 2:42 at a voice-over's pace: beats of 4–10s, one long
 * hold on the title card and one near the end, no music grid. The template
 * keeps the order and the proportions and trims each beat to about half, which
 * lands at ~73s. A real film gives each scene the length its voice-over line
 * needs: change `seconds` and everything after it moves.
 *
 * `reveal` is how a scene arrives, and `revealFrames` how long that takes. The
 * incoming scene is mounted on top of the outgoing one for that long, so a
 * scene's exit is the *next* scene's reveal.
 */
export const FPS = 24;

export type SceneId =
  | "screen"
  | "overhead"
  | "title"
  | "room"
  | "lens"
  | "slit"
  | "almond"
  | "morph"
  | "hold"
  | "credits";

export type SceneSlot = { id: SceneId; seconds: number; reveal: RevealSpec; revealFrames: number };

export const SCENES: readonly SceneSlot[] = [
  { id: "screen", seconds: 5, reveal: { kind: "cut" }, revealFrames: 0 },
  { id: "overhead", seconds: 7, reveal: { kind: "lens", x: 960, y: 540, r0: 260 }, revealFrames: 16 },
  { id: "title", seconds: 8, reveal: { kind: "bloom", x: 1080, y: 540, seed: "to-title" }, revealFrames: 18 },
  { id: "room", seconds: 6, reveal: { kind: "cut" }, revealFrames: 0 },
  { id: "lens", seconds: 7, reveal: { kind: "bloom", x: 960, y: 560, seed: "to-lens" }, revealFrames: 18 },
  { id: "slit", seconds: 6, reveal: { kind: "cut" }, revealFrames: 0 },
  { id: "almond", seconds: 5, reveal: { kind: "wipe", angle: -0.5, seed: "to-almond" }, revealFrames: 16 },
  { id: "morph", seconds: 11, reveal: { kind: "almond", x: 960, y: 540, l0: 700, h0: 150 }, revealFrames: 20 },
  { id: "hold", seconds: 8, reveal: { kind: "bloom", x: 960, y: 520, seed: "to-hold" }, revealFrames: 18 },
  { id: "credits", seconds: 10, reveal: { kind: "cut" }, revealFrames: 0 },
];

export type Placed = SceneSlot & { from: number; frames: number; index: number };

/** Lays the scenes end to end. A scene's `from` is where its reveal starts. */
export const PLACED: readonly Placed[] = SCENES.reduce<Placed[]>((acc, slot, index) => {
  const prev = acc[acc.length - 1];
  const from = prev ? prev.from + prev.frames : 0;
  return [...acc, { ...slot, index, from, frames: Math.round(slot.seconds * FPS) }];
}, []);

export const DURATION = PLACED[PLACED.length - 1].from + PLACED[PLACED.length - 1].frames;
