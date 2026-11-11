import type { Reel, Shot } from "./GameReel";

/**
 * Synth Surf — see projects/games/synthsurf-showreel/EDITORIAL_SCRIPT.md.
 *
 * The bed is the song the run was played to, so run shots are placed at the clip time where the game
 * was at the same song time as the film: the tiles and the track hit exactly what you hear.
 * `synthsurf-run.clock.json` fits song = 4.652 + 1.00008 × clip (max residual 0.28 s, the readout's tick).
 */
const BPM = 163.9;
const FROM = 85.148; // bar 58, 16 beats before the breakdown
const CLIP_LAG = 4.652;
const beat = 60 / BPM;

/** The ?debug timeline covers the bottom fifth of the run clip: scale from the top to crop it away. */
const crop = { origin: "50% 0%" } as const;
const runAt = (filmBeat: number, s: Partial<Shot> = {}): Shot => ({
  clip: "clips/synthsurf-run.mp4",
  at: FROM + filmBeat * beat - CLIP_LAG,
  beats: 8,
  drift: [1.3, 1.36],
  ...crop,
  ...s,
});

const DROP = 32; // film beat of the drop (song 96.86)
const looks: Partial<Shot>[] = [
  { tag: "THE DROP", pulse: true, drift: [1.42, 1.3] },
  { drift: [1.3, 1.38] },
  { tag: "YOUR SONG → YOUR LEVEL", pulse: true, drift: [1.32, 1.32] },
  { drift: [1.5, 1.36] },
  { pulse: true, drift: [1.3, 1.4] },
  { tag: "UNSTOPPABLE DRIVER", drift: [1.36, 1.3] },
  { pulse: true, drift: [1.45, 1.45] },
  { drift: [1.3, 1.36] },
  { pulse: true, drift: [1.4, 1.3] },
  { tag: "ENDLESS NEON WAVE FIELD", drift: [1.3, 1.34] },
  { pulse: true, drift: [1.5, 1.38] },
  { drift: [1.32, 1.4] },
  { pulse: true, drift: [1.3, 1.3] },
  { drift: [1.38, 1.3] },
  { pulse: true, drift: [1.3, 1.42] },
];

export const SYNTHSURF: Reel = {
  projectId: "games/synthsurf-showreel",
  music: "music.mp3",
  bpm: BPM,
  musicFrom: FROM,
  accent: ["#ff2fb3", "#33e7ff"],
  intro: { beats: 16, title: "Synth Surf", kicker: "endless neon wave field", bg: runAt(0, { beats: 16 }) },
  shots: [
    // The breakdown (song 91.0–96.9): the menu while the track drops out.
    { clip: "clips/synthsurf-menu.mp4", at: 0, beats: 8, drift: [1, 1.05] },
    { clip: "clips/synthsurf-menu.mp4", at: 8.3, beats: 8, tag: "DROP IN YOUR OWN SONG", drift: [1.05, 1] },
    ...looks.map((l, i) => runAt(DROP + i * 8, l)),
  ],
  outro: {
    beats: 16,
    title: "Synth Surf",
    lines: ["by Bilo Lwabona", "Music: Unstoppable Driver by Alexandr Zhelanov (CC BY)", "https://www.youtube.com/c/AlexandrZhelanovsMusic"],
    bg: runAt(DROP + looks.length * 8, { beats: 16 }),
  },
};
