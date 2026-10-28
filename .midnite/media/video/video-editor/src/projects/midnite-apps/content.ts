import type { Tone } from "../../shared/neon-hud/palette";
import type { Crop } from "../../shared/AppWindow";

/**
 * Everything the film *says* and *shows*. Each entry is one eight-beat slot of
 * the bed (`cuts.ts`); `EDITORIAL_SCRIPT.md` has the frames.
 *
 * Video 1's grammar (chapter, statement, slugs, and a `say` line under every
 * slot, spoken by the voice-over) plus one new kind: **`clip`**, a headline
 * over real footage of the product — the website, the launcher and Studio's
 * views, recorded by the scripts in `projects/midnite-apps/capture/` into
 * `input/clips/`. A clip slot can hold several `shots`, cut on the beat; that
 * is how the launcher "jumps from app to app".
 *
 * `say` lines are the rap: rhymed couplets across slot pairs. Keep each to
 * ~15 syllables — a slot is 3.87 s, and the voice-over speeds a line up to
 * 1.25× at most to fit it.
 */
export type Shot = {
  /** In `input/clips/` — or `src`, a shared recording under `assets/` (`video/app/….mov`). */
  file?: string;
  src?: string;
  /** The recording's pixel size, when it is not the capture scripts' 2880×1800. */
  source?: { width: number; height: number };
  /** Seconds into the recording the shot starts at. */
  from?: number;
  /** Beats the shot holds; the last shot takes what is left of the slot. */
  beats?: number;
  /** Playback rate — 1.5 plays a slow recording through faster. */
  rate?: number;
  crop?: Crop;
  /** Where the card is, as "App ▸ View" — a small readout on the card's corner. */
  label?: string;
};

export type ClipSpec = {
  a: string;
  b?: string;
  tone?: Tone;
  aTone?: Tone;
  shots: readonly Shot[];
  /** Beats the scene waits before it starts building (the opening gives the mark two beats alone). */
  delay?: number;
};

export type Slot = (
  | { clip: ClipSpec }
  | { chapter: string }
  /** The golive statement: one sentence in two halves, the second landing on a wipe to the other stage. */
  | { statement: readonly [string, string] }
  /** The golive slugs: a typed title, then one line typed per beat. */
  | { slugs: { title: string; slugs: readonly string[]; star?: number } }
) & { say?: string };

/** `half` flips mid-slot (the statement's second half); `long` is the first change, meant to be watched. */
export type StageChange = { slot: number; theme: "light" | "dark"; half?: boolean; long?: boolean };

export const PROJECT_ID = "midnite-apps";

export const CONTENT = {
  episode: "Midnite Apps",

  timeline: [
    // ── Hook (beats 0–32): the website, over the intro pads ───────────────
    {
      clip: {
        a: "MIDNITE",
        b: "APPS",
        delay: 2,
        shots: [{ file: "web-hero-dark.mp4", from: 1.2, label: "the website" }],
      },
      say: "Midnite Apps — built a whole suite while the city was sleeping,",
    },
    {
      clip: {
        a: "THE NIGHT",
        b: "SHIFT",
        shots: [{ file: "web-hero-dark.mp4", from: 6.5, label: "the website" }],
      },
      say: "agents on the graveyard shift — every line they wrote, I'm keeping.",
    },
    {
      clip: {
        a: "NOT ONE APP",
        aTone: "red",
        b: "A LINEUP",
        shots: [{ file: "web-scroll-dark.mp4", from: 1.5, label: "the website" }],
      },
      say: "Not one app, a whole lineup — stacked up and designed;",
    },
    {
      clip: {
        a: "GET",
        b: "ACCESS",
        tone: "green",
        shots: [{ file: "web-access-dark.mp4", from: 1.5, label: "the website" }],
      },
      say: "the site's the front door: request access, get in line.",
    },

    // ── Drop A (beat 32): chapter 1, the launcher, on the light stage ─────
    { chapter: "The launcher", say: "Chapter one: the launcher — the front door to the floor:" },
    {
      clip: {
        a: "EVERY APP",
        b: "ONE GRID",
        shots: [{ file: "launcher-grid-light.mp4", from: 0.5, label: "Midnite Apps" }],
      },
      say: "every app in a grid — what it does and what it's for.",
    },
    {
      clip: {
        a: "ONE CLICK",
        b: "INSTALL",
        tone: "green",
        shots: [{ file: "launcher-detail-light.mp4", from: 3, label: "Midnite Apps" }],
      },
      say: "Missing one? Hit install — it's verified, then it swaps,",
    },
    {
      clip: {
        a: "ONE",
        b: "UPDATER",
        shots: [{ file: "launcher-table-light.mp4", from: 3, label: "Midnite Apps" }],
      },
      say: "the launcher runs the updates, so the whole suite never drops.",
    },
    {
      clip: {
        a: "HIT OPEN",
        b: "DEEP LINK",
        shots: [
          { file: "launcher-detail-light.mp4", from: 8.5, beats: 4, label: "Midnite Apps" },
          { file: "landing-light.mp4", from: 0.5, label: "Studio ▸ Home" },
        ],
      },
      say: "Hit open and it deep-links — Studio lands on the view;",
    },
    {
      clip: {
        a: "APP TO APP",
        b: "IN A HEARTBEAT",
        tone: "green",
        shots: [
          { file: "launcher-jump-light.mp4", from: 3, beats: 2, label: "Midnite Apps" },
          { file: "gitgraph-light.mp4", from: 10.5, beats: 2, label: "Studio ▸ Git Graph" },
          { file: "models-light.mp4", from: 6.5, beats: 2, label: "Agents ▸ Models" },
          { file: "landing-light.mp4", from: 6.5, label: "Studio ▸ Home" },
        ],
      },
      say: "app to app in a heartbeat, like the window's brand new.",
    },

    // ── Drop A's last phrase (beat 80): chapter 2, agents at work ─────────
    { chapter: "Agents at work", say: "Chapter two: the agents — and they never take a nap." },
    {
      clip: {
        a: "THE PROJECT",
        b: "GRAPH",
        shots: [{ file: "graph-partial-dark.mp4", from: 12.5, label: "Coder ▸ Tasks" }],
      },
      say: "Every phase is a node on the project graph's map:",
    },
    {
      clip: {
        a: "HALF DONE",
        b: "HALF IN FLIGHT",
        tone: "amber",
        shots: [{ file: "graph-partial-dark.mp4", from: 4.5, label: "Coder ▸ Tasks" }],
      },
      say: "green nodes shipped, half-lit nodes still in flight,",
    },
    {
      clip: {
        a: "AGENTS",
        b: "RUNNING",
        tone: "green",
        shots: [{ file: "graph-agents-dark.mp4", from: 0.5, label: "Coder ▸ Tasks" }],
      },
      say: "agents grinding on the nodes in the dead of the night.",
    },
    {
      clip: {
        a: "EVERY SESSION",
        b: "OWN WORKTREE",
        shots: [{ file: "sessions-dark.mp4", from: 2.5, label: "Coder ▸ Sessions" }],
      },
      say: "Every session's got a worktree, every terminal's lit;",
    },
    {
      clip: {
        a: "FIVE MINDS",
        b: "ONE ANSWER",
        tone: "amber",
        shots: [{ file: "councils-dark.mp4", from: 10, label: "Agents ▸ Councils" }],
      },
      say: "five minds in a council — one answer, that's it.",
    },

    // ── The breakdown (beat 128), then the riser into drop B ──────────────
    {
      statement: ["Every app is", "one window."],
      say: "Every app's a view... and every view's in one place:",
    },
    {
      clip: {
        a: "THE GIT",
        b: "GRAPH",
        shots: [{ file: "gitgraph-light.mp4", from: 0.5, label: "Studio ▸ Git Graph" }],
      },
      say: "the git graph in the middle — every commit's got a face.",
    },

    // ── Drop B (beat 144): chapter 3, app to app ───────────────────────────
    // The browser and the companion are the earlier real-app recordings in assets/video/app (the browser is an
    // Electron <webview>, which a plain page cannot host); everything else was recorded on seeded data in capture/.
    { chapter: "App to app", say: "Chapter three... app to app... and not one reload:" },
    {
      clip: {
        a: "MIND",
        b: "NOTES THAT STICK",
        shots: [{ file: "notes-dark.mp4", from: 1.5, label: "Mind ▸ Notes" }],
      },
      say: "Mind keeps the notes — type a thought, hit enter, and it's stowed;",
    },
    {
      clip: {
        a: "SPACED",
        b: "REVIEW",
        tone: "amber",
        /* The card is a band across the top of an empty screen, so the shot is cropped to it. */
        shots: [
          { file: "review-dark.mp4", from: 1.6, crop: { left: 804, right: 676, top: 180, bottom: 745 }, label: "Mind ▸ Review" },
        ],
      },
      say: "then it quizzes what you learned: show the answer, grade it Good —",
    },
    {
      clip: {
        a: "THE KNOWLEDGE",
        b: "GRAPH",
        tone: "green",
        shots: [{ file: "knowledge-dark.mp4", from: 3.5, label: "Studio ▸ Knowledge" }],
      },
      say: "the knowledge graph maps the code, every symbol in the hood.",
    },
    {
      clip: {
        a: "ASK",
        b: "THE AGENT",
        shots: [{ file: "chats-dark.mp4", from: 7, label: "Agents ▸ Chats" }],
      },
      say: "Chat with any agent — it'll read the code and cite the line;",
    },
    {
      clip: {
        a: "A BROWSER",
        b: "AGENTS DRIVE",
        shots: [
          { src: "video/app/midnite-studio-browser.mov", source: { width: 2912, height: 1758 }, label: "Browser" },
        ],
      },
      say: "the browser's got a driver: hands off, and it's doing fine.",
    },
    {
      clip: {
        a: "A COMPANION",
        b: "THAT LISTENS",
        tone: "amber",
        shots: [
          { src: "video/app/midnite-ai-companion.mov", from: 0.3, source: { width: 2912, height: 1758 }, label: "Studio ▸ Companion" },
        ],
      },
      say: "The companion's on the mic — it listens when I speak;",
    },
    {
      clip: {
        a: "WORKFLOWS",
        b: "RUN ALONE",
        shots: [{ file: "workflows-dark.mp4", from: 3, label: "Agents ▸ Graphs" }],
      },
      say: "workflows wire the agents into graphs that run all week.",
    },

    // ── Drop B's second half again (beat 208) ──────────────────────────────
    {
      clip: {
        a: "THE SWARM",
        b: "SHIPS IT",
        tone: "green",
        shots: [{ file: "graph-agents-dark.mp4", from: 9.5, label: "Coder ▸ Tasks" }],
      },
      say: "The swarm ships phase one-sixteen, and I ain't even home —",
    },
    {
      clip: {
        a: "THE FORGE",
        b: "BESIDE THE CODE",
        shots: [
          { file: "forge-light.mp4", from: 3.4, beats: 2, label: "Coder ▸ Git Forge" },
          { file: "forge-light.mp4", from: 7.6, beats: 3, label: "Coder ▸ Git Forge" },
          { file: "forge-light.mp4", from: 10, label: "Coder ▸ Git Forge" },
        ],
      },
      say: "the forge: four shards green, zero queued — LGTM, it's flown.",
    },
    {
      clip: {
        a: "LOCAL",
        b: "MODELS",
        shots: [{ file: "models-light.mp4", from: 2, label: "Agents ▸ Models" }],
      },
      say: "Local models on the laptop — no cloud, and no cost;",
    },
    {
      clip: {
        a: "EVERY CORE",
        b: "ACCOUNTED FOR",
        tone: "green",
        shots: [
          /* The Monitor page is a centred column, so its shot is cropped to it; the Optimizer runs full width. */
          { file: "monitor-dark.mp4", from: 0.6, beats: 4, crop: { left: 464, right: 336, top: 100, bottom: 400 }, label: "Studio ▸ Monitor" },
          { file: "monitor-dark.mp4", from: 11.5, label: "Studio ▸ Optimizer" },
        ],
      },
      say: "the monitor tracks every core, so not a cycle's lost.",
    },

    // ── The breakdown again (beat 240), under the build ────────────────────
    {
      statement: ["You've seen", "half of it."],
      say: "You've seen half the suite... and now the bass begins to build —",
    },
    {
      clip: {
        a: "AGENTS HARD",
        b: "AT WORK",
        tone: "green",
        shots: [{ file: "landing-light.mp4", from: 0.5, label: "Studio ▸ Home" }],
      },
      say: "four agents hard at work, and every order's getting filled;",
    },
    {
      clip: {
        a: "THE REST",
        b: "OF THE LINEUP",
        shots: [{ file: "launcher-grid-light.mp4", from: 3, label: "Midnite Apps" }],
      },
      say: "Creator, Gamer, Money, Media — lined up, waiting at the top,",
    },
    {
      clip: {
        a: "HOLD YOUR",
        b: "BREATH",
        tone: "amber",
        shots: [{ file: "launcher-jump-light.mp4", from: 6, label: "Midnite Apps" }],
      },
      say: "so hold your breath... count it down... and let it drop.",
    },

    // ── The dubstep drop (beat 272): chapter 4, the whole suite ────────────
    { chapter: "The whole suite", say: "Chapter four: the whole suite — and the bass just hit the dark;" },
    {
      clip: {
        a: "CREATOR",
        b: "DOCS AND ART",
        shots: [
          { file: "creator-dark.mp4", from: 0.7, beats: 3, label: "Creator ▸ Docs" },
          { file: "creator-dark.mp4", from: 5, beats: 2, label: "Creator ▸ Images" },
          { file: "creator-dark.mp4", from: 7, label: "Creator ▸ Images" },
        ],
      },
      say: "Creator writes the docs, and generates a marble mark;",
    },
    {
      clip: {
        a: "NIGHT DRIVE",
        b: "EIGHTY BPM",
        tone: "amber",
        shots: [{ file: "creator-dark.mp4", from: 11, label: "Creator ▸ Audio" }],
      },
      say: "night-drive at eighty BPM, the drum grid's in the pocket;",
    },
    {
      clip: {
        a: "GAMER",
        b: "THE CAPE IN 3D",
        tone: "green",
        shots: [{ file: "gamer-dark.mp4", from: 0.7, label: "Gamer ▸ Maps" }],
      },
      say: "Gamer flies the Cape in 3D — Table Mountain, lock it.",
    },
    {
      clip: {
        a: "CANYONS",
        b: "AND CARS",
        /* Cut around the terrain streaming in (4.5–6.5 s) and the "Opening model…" spinner (13.9 s). */
        shots: [
          { file: "gamer-dark.mp4", from: 6.8, beats: 4, label: "Gamer ▸ Terrain" },
          { file: "gamer-dark.mp4", from: 10.4, label: "Gamer ▸ Models" },
        ],
      },
      say: "Grand Canyon carved in polygons, a Lambo on the floor,",
    },
    {
      clip: {
        a: "MONEY",
        b: "IN THE GREEN",
        tone: "green",
        shots: [
          { file: "money-dark.mp4", from: 0.8, beats: 3, label: "Money ▸ Markets" },
          { file: "money-dark.mp4", from: 3.8, beats: 2, label: "Money ▸ Markets" },
          { file: "money-dark.mp4", from: 8, label: "Money ▸ Markets" },
        ],
      },
      say: "Money charts NVIDIA — the candles green, and up some more.",
    },
    {
      clip: {
        a: "MEDIA",
        b: "YOUR OWN CINEMA",
        shots: [
          { file: "media-dark.mp4", from: 1.6, beats: 4, label: "Media ▸ Films" },
          { file: "media-dark.mp4", from: 6, label: "Media ▸ Shows" },
        ],
      },
      say: "Media's your own cinema — Salt Line, resume at forty-one;",
    },
    {
      clip: {
        a: "MUSIC",
        b: "AND MEMORIES",
        tone: "amber",
        shots: [
          { file: "media-dark.mp4", from: 8.2, beats: 4, label: "Media ▸ Music" },
          { file: "media-dark.mp4", from: 13, label: "Media ▸ Photos" },
        ],
      },
      say: "Neon Tide on the speakers, and the Grand Canyon in the sun.",
    },

    // ── Back to the song (beat 336): the recap ─────────────────────────────
    {
      slugs: {
        title: "Eight apps",
        slugs: ["Studio", "Agents", "Coder", "Creator", "Gamer", "Money", "Media", "Mind"],
        star: 7,
      },
      say: "Eight apps, one launcher, one grid that ties up the loose ends —",
    },
    {
      clip: {
        a: "ONE LAUNCHER",
        b: "EVERY APP",
        shots: [{ file: "launcher-grid-light.mp4", from: 9, label: "Midnite Apps" }],
      },
      say: "one window, every app — and this night shift never ends.",
    },
  ] satisfies Slot[],

  /** The outro: the track's own tail (beat 352). */
  outro: {
    a: "IT NEVER",
    b: "CLOCKS OUT",
    caption: "MIDNITE · APPS",
    cta: "get access",
    /** The word after "Midnite" in the closing lockup. */
    qualifier: "Apps",
  },

  stage: [
    { slot: 4, theme: "light", long: true },
    { slot: 10, theme: "dark" },
    { slot: 16, theme: "light", half: true },
    { slot: 18, theme: "dark" },
    { slot: 27, theme: "light" },
    { slot: 29, theme: "dark" },
    { slot: 30, theme: "light", half: true },
    { slot: 34, theme: "dark" },
    { slot: 42, theme: "light" },
  ] satisfies StageChange[],
};
