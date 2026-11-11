import type { Reel } from "./GameReel";

/** Omniverse — see projects/games/omniverse-showreel/EDITORIAL_SCRIPT.md. Local only: fan project. */
export const OMNIVERSE: Reel = {
  projectId: "games/omniverse-showreel",
  music: "music.mp3",
  bpm: 126.7,
  musicFrom: 40.033,
  accent: ["#ffb81c", "#e62429"],
  intro: { beats: 8, title: "Omniverse", kicker: "pick a hero · pick a world", bg: { clip: "clips/omni-menus.mp4", at: 0, beats: 8 } },
  shots: [
    { clip: "clips/omni-menus.mp4", at: 4, beats: 8, rate: 1.5, tag: "CHOOSE YOUR HERO", drift: [1, 1.02] },
    { clip: "clips/omni-menus.mp4", at: 21.2, beats: 4, drift: [1, 1.02] },
    { clip: "clips/omni-goku.mp4", at: 0, beats: 8, tag: "TITAN COLOSSEUM", pulse: true },
    { clip: "clips/omni-goku.mp4", at: 6, beats: 8 },
    { clip: "clips/omni-storm.mp4", at: 2, beats: 8, tag: "THE X-MANSION", pulse: true },
    { clip: "clips/omni-storm.mp4", at: 6, beats: 8, tag: "TAKING FLIGHT" },
    { clip: "clips/omni-spidey.mp4", at: 3.5, beats: 8, tag: "TEST LEVEL · DISTRICT", pulse: true },
    { clip: "clips/omni-spidey.mp4", at: 9, beats: 8 },
    { clip: "clips/omni-menus.mp4", at: 26, beats: 8, rate: 1.5, tag: "CHOOSE YOUR WORLD", drift: [1, 1.02] },
    { clip: "clips/omni-goku.mp4", at: 13.5, beats: 8, pulse: true },
  ],
  outro: { beats: 8, title: "Omniverse", lines: ["by Bilo Lwabona", "Music: Dark Hero — Ebunny"], bg: { clip: "clips/omni-goku.mp4", at: 16.5, beats: 8 } },
};
