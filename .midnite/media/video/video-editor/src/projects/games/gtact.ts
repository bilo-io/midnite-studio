import type { Reel } from "./GameReel";

/** GTA Cape Town — see projects/games/gtact-showreel/EDITORIAL_SCRIPT.md. */
export const GTACT: Reel = {
  projectId: "games/gtact-showreel",
  music: "music.mp3",
  bpm: 93.7,
  musicFrom: 30.86,
  accent: ["#ff3ea5", "#2de2ff"],
  intro: { beats: 4, title: "GTA Cape Town", kicker: "open world · three.js", bg: { clip: "clips/gtact-seaboard.mp4", at: 2, beats: 4 } },
  shots: [
    { clip: "clips/gtact-seaboard.mp4", at: 0, beats: 8, tag: "ATLANTIC SEABOARD" },
    { clip: "clips/gtact-cbd-orbit.mp4", at: 0.5, beats: 8, tag: "CAPE TOWN CBD" },
    { clip: "clips/gtact-traffic.mp4", at: 1, beats: 4, tag: "DOWNTOWN DRIVE", pulse: true },
    { clip: "clips/gtact-heli.mp4", at: 0, beats: 4, tag: "SEA POINT HELIPAD", pulse: true },
    { clip: "clips/gtact-heli.mp4", at: 6, beats: 8, tag: "LION'S HEAD" },
    { clip: "clips/gtact-city-bowl.mp4", at: 0.5, beats: 4, tag: "CITY BOWL" },
    { clip: "clips/gtact-jet.mp4", at: 0, beats: 4, tag: "CAPE TOWN AIRPORT", pulse: true },
    { clip: "clips/gtact-jet.mp4", at: 4, beats: 4, rate: 1.2 },
    { clip: "clips/gtact-seaboard.mp4", at: 6.5, beats: 8, tag: "CAMPS BAY" },
    { clip: "clips/gtact-menu.mp4", at: 0.4, beats: 4, tag: "PAUSE MENU · MAP", drift: [1, 1.02] },
    { clip: "clips/gtact-menu.mp4", at: 3.2, beats: 2, drift: [1, 1.02] },
    { clip: "clips/gtact-menu.mp4", at: 5, beats: 4, tag: "3D MAP", drift: [1, 1.02] },
    { clip: "clips/gtact-menu.mp4", at: 8, beats: 4, drift: [1, 1.02] },
  ],
  outro: { beats: 8, title: "GTA Cape Town", lines: ["by Bilo Lwabona", "Music: Basketball Flow — SoulProdMusic"], bg: { clip: "clips/gtact-city-bowl.mp4", at: 3, beats: 8 } },
};
