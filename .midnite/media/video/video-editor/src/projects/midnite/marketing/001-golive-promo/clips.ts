import type { Crop } from "../../../../shared/AppWindow";
import { BUILD, CLAIM, HARNESS, OUTRO } from "./beats";

/**
 * Which frames of which recording each shot plays — and which shots have no
 * recording yet.
 *
 * Every number here is measured, not guessed. `seconds` is `ffprobe`'s
 * container duration (these recordings are variable-rate, so frame count ÷
 * nominal fps is not it); `trimBefore` is in *composition* frames, 30ths of a
 * second, whatever the source runs at; the window each one picks was chosen off
 * a 2fps contact sheet of the whole clip rather than by scrubbing, because a
 * screen recording is mostly a still image and the wrong two seconds of one is
 * a screenshot with a soundtrack.
 *
 * ── Where one screen appears twice ─────────────────────────────────────────
 *
 * Once, and deliberately: the **multi-window main take** is in the film
 * twice — its dark cut after the folds, as the commit graph under "Watch your
 * swarm", and its light cut during them, as Multi-window. Different themes of
 * one screen, twenty seconds apart, and the second is the first coming apart.
 *
 * Until v9 the workflow builder was a second, as both stage 3's "Workflows"
 * and stage 4's "Custom graphs". The agentic-graph recording replaced the
 * latter.
 *
 * What is *not* done anywhere is showing the same screen twice at different
 * speeds and hoping; where there is no footage there is a placeholder instead.
 *
 * ── Pending shots ───────────────────────────────────────────────────────────
 *
 * `clip: null` is a shot whose recording does not exist yet. It renders a
 * designed card — the feature's name on a brand-ramp panel — rather than a hole,
 * so the cut is watchable today and gets better when the file lands. `awaiting`
 * is the exact filename to drop into `assets/video/app/`; filling one in is a
 * two-line change (set `clip`, set `seconds` from `ffprobe`) plus a `trimBefore`
 * chosen the way the others were.
 */

export type Shot = {
  /** `video/app/….mov` under the shared library, or `null` while unrecorded. */
  clip: string | null;
  /** `ffprobe`'s container duration in seconds. 0 for a pending shot. */
  seconds: number;
  /** Frames to skip at the head, in composition frames. */
  trimBefore: number;
  /** `playbackRate`. */
  rate: number;
  crop?: Crop;
  /** Frames the shot is on screen — the span the fit check is made against. */
  frames: number;
  /** What a pending shot's placeholder card says. */
  pendingLabel?: string;
  /** The filename a pending shot is waiting for. */
  awaiting?: string;
  /**
   * The recording's pixel size, where it is not a full midnite window
   * (`AppWindow`'s default). A detached panel is a third the width of one, and
   * fitted as if it were a whole window it is scaled for the wrong box.
   */
  source?: { width: number; height: number };
  /**
   * A change of speed partway through, with no jump in source time: from shot
   * frame `at` the take runs at `rate` instead. For a take whose events have to
   * land on beats that are spaced differently from the take's own — see
   * `MULTI_WINDOW`.
   */
  then?: { at: number; rate: number };
};

/** A shot that has footage. */
const shot = (
  clip: string,
  seconds: number,
  trimBefore: number,
  rate: number,
  frames: number,
  crop?: Crop,
): Shot => ({ clip, seconds, trimBefore, rate, frames, crop });

/* ── Stage 2 ──────────────────────────────────────────────────────────────── */

export const STAGE2 = {
  /**
   * The agent picker with the whole roster open — "Find an agent…" over
   * Claude, Cursor, Antigravity, Codex, Copilot, Grok, OpenClaude, OpenCode. The
   * clip spends its first fourteen seconds launching agents one at a time, which
   * is the same claim made slowly; the list itself is the shot.
   */
  agents: shot("video/app/midnite-agent-cli-providers.mov", 16.73, 414, 1, CLAIM.repos - CLAIM.agentsVideo),

  /**
   * The repos sidebar. It slides in at 0.6s and the pane is settled by 0.9s;
   * before that the shot is a terminal with nothing on its right.
   */
  repos: shot("video/app/midnite-video-terminal-git-graph-repos.mov", 5.19, 27, 1, CLAIM.swarm - CLAIM.repos),

  /**
   * The commit graph on its own, from the dark multi-window take (v7). That
   * take opens on the whole app and folds its three panels away by 4.93s; from
   * 5.1s it is the graph filling the window and nothing else, for 3.6s, which
   * covers the claim's 1.7s at 1× — so this no longer needs the 0.40× the old
   * take was slowed to in order to stretch 0.9s of graph over the beat.
   */
  swarm: {
    ...shot(
      "video/app/midnite-dark-multiwindow-mainwindow-and-gitgraph-longer.mov",
      8.715,
      153,
      1,
      CLAIM.forge - CLAIM.swarm,
    ),
    source: { width: 3024, height: 1894 },
  },

  /**
   * The agentic kanban, light — bar 9 stands on the light stage. From 0.2s,
   * with the cursor already on the card in Todo: it is dragged into In
   * Progress, dropped, and the agent's terminal opens under the board.
   *
   * 1.5× so that whole move fits the claim's one bar; at 1× the bar ends
   * mid-drag. The rest of the take is the card filling with output.
   */
  kanban: {
    ...shot("video/app/midnite-light-agentic-kanban.mov", 6.312, 6, 1.5, CLAIM.end - CLAIM.kanban),
    source: { width: 1920, height: 1208 },
  },

  /**
   * The workflow-runs pane, green and red down the left. The clip's first 1.7s
   * is a loading skeleton and its middle is the project board; the runs are the
   * only part of it that reads as "CI" in the 1.7s this claim gets.
   *
   * **From 4.47s, not 3.90s.** The earlier start caught the tail of the project
   * board and then the view switch into the runs pane — which on this recording
   * is three frames of a completely black window. A 10fps sheet of the source
   * puts the board up to 4.2s and the switch at 4.23s; 4.30s looked settled on
   * that sheet and was not, because the pane deals its rows in over the two
   * frames after it, which a rendered still at the cut showed as an empty shell.
   * 4.47s is past all of it.
   *
   * 0.88× is what makes 1.7s of picture fit in the 1.58s left of the clip after
   * that, and it is invisible: the pane holds still for the whole shot.
   */
  forge: shot(
    "video/app/midnite-github-integration.mov",
    6.055,
    134,
    0.88,
    CLAIM.browser - CLAIM.forge,
  ),

  /**
   * The split: terminal on the left, a real browser docked on the right. Opens
   * after the view-switcher popover has closed — the popover is the feature
   * being explained, not the feature.
   */
  browser: shot("video/app/midnite-studio-browser.mov", 7.572, 75, 1, CLAIM.monitor - CLAIM.browser),

  /**
   * The memory view with the CPU/RAM sparklines and the three gauges live, not
   * the "Smart Scan" panel the recording opens on — which is a button on an
   * empty page.
   */
  monitor: shot("video/app/midnite-optimiser.mov", 5.562, 108, 1, CLAIM.graph - CLAIM.monitor),

  /**
   * The graph spread out and coloured, after the opening hairball has resolved.
   *
   * The crop is the pilot's, for the pilot's reason and with its arithmetic:
   * the view carries a "this graph is 17 commits behind HEAD" banner across its
   * top 100 source pixels, which is true of the machine it was recorded on and
   * says nothing about the product. The 166px off the right is not cosmetic —
   * it makes the kept box 2746×1658, which is the card's own aspect to within a
   * thousandth, so the cover fit clips nothing beyond what is asked for.
   */
  graph: shot(
    "video/app/midnite-video-knowledge-graph.mov",
    5.748,
    21,
    1,
    CLAIM.kanban - CLAIM.graph,
    { top: 100, right: 166 },
  ),
} as const;

/* ── Stage 3 ──────────────────────────────────────────────────────────────── */

/**
 * The build-up's three quick clips, all on the light stage — which is why each
 * uses the `light-` cut of its take. The recordings come in both themes
 * precisely so a feature can be shown on whichever stage the film happens to
 * be standing on when it is named.
 */
const BUILD_ENDS = [...BUILD.items.slice(1), BUILD.breath];

/* ── Multi-window ── */

/**
 * The seconds, in the main-window take, at which each of its three panels has
 * finished folding away — the last frame `ffmpeg scdet` sees move in each
 * collapse. Right (the loops panel) first, then left (repos), then the bottom
 * (terminal).
 */
const FOLDED = { loops: 6.363, repos: 8.047, terminal: 8.947 } as const;

/** Shot frames — counted from the cut to Multi-window — each panel detaches on. */
const LAND = {
  loops: BUILD.detach.loops - BUILD.items[0],
  repos: BUILD.detach.repos - BUILD.items[0],
  terminal: BUILD.detach.terminal - BUILD.items[0],
} as const;

/*
  Two speeds, because the take's folds are 1.7s and then 0.9s apart and the
  accents they land on are half a bar each. One rate cannot put three unevenly
  spaced events on three evenly spaced beats; two rates, joined where the second
  fold finishes, put each exactly. The join is continuous in source time — the
  second segment starts on the frame the first would have shown — so what
  changes is how fast the app runs, which on a window mostly standing still is
  not something a viewer can see.
*/
const MAIN_RATE = ((FOLDED.repos - FOLDED.loops) * 30) / (LAND.repos - LAND.loops);
const MAIN_THEN = ((FOLDED.terminal - FOLDED.repos) * 30) / (LAND.terminal - LAND.repos);
const MAIN_TRIM = Math.round(FOLDED.loops * 30 - LAND.loops * MAIN_RATE);

/** A detached panel, from the frame it lands to the end of the shot. */
const panel = (clip: string, seconds: number, trimBefore: number, at: number, source: Shot["source"], crop?: Crop): Shot => ({
  ...shot(clip, seconds, trimBefore, 1, BUILD_ENDS[0] - BUILD.items[0] - at, crop),
  source,
});

export const MULTI_WINDOW = {
  /**
   * The main window folding its three panels away, one per accent. Opens on
   * the whole app — git repos down the left, the loops panel on the right, the
   * terminal along the bottom, the commit graph in the middle — and ends with
   * the graph alone, which is the point: everything that was a panel is now a
   * window of its own beside it.
   */
  main: {
    ...shot(
      "video/app/midnite-light-multiwindow-mainwindow-and-gitgraph.mov",
      13.737,
      MAIN_TRIM,
      MAIN_RATE,
      BUILD_ENDS[0] - BUILD.items[0],
    ),
    source: { width: 1920, height: 1204 },
    then: { at: LAND.repos, rate: MAIN_THEN },
  } satisfies Shot,

  /**
   * The loops panel as its own window. From 1.5s: the take opens with a
   * different window still in front of it for its first second.
   */
  loops: panel(
    "video/app/midnite-light-multiwindow-agent-loops.mov",
    16.908,
    45,
    LAND.loops,
    { width: 840, height: 1718 },
  ),

  /** The repos panel as its own window — the whole tree, before it scrolls at 6s. */
  repos: panel(
    "video/app/midnite-light-multiwindow-gitrepos.mov",
    16.548,
    30,
    LAND.repos,
    { width: 840, height: 1718 },
  ),

  /**
   * The terminal as its own window, cut to a strip. It is laid under the main
   * window at that window's width, 948×290, which is an aspect of 3.3:1 against
   * the take's 1.7:1 — so the crop keeps the band that
   * says what the pane is for: the tail of an agent's command, its status table,
   * the ETA line, the prompt and the agent status under it. Above that is a path
   * and a scheduling notice; below it, empty well and a "synced" badge.
   */
  terminal: panel(
    "video/app/midnite-light-multiwindow-terminal.mov",
    9.665,
    0,
    LAND.terminal,
    { width: 2198, height: 1278 },
    { top: 470, bottom: 136 },
  ),
} as const;

/* The fit check below reads `rate` only; the second segment is checked here. */
{
  const s = MULTI_WINDOW.main;
  const used = (s.trimBefore + s.then.at * s.rate + (s.frames - s.then.at) * s.then.rate) / 30;
  if (used > s.seconds) throw new Error(`${s.clip}: the two-speed shot needs ${used.toFixed(2)}s of ${s.seconds}s`);
}

export const STAGE3 = [
  MULTI_WINDOW.main,

  /**
   * The council view. The clip opens on a "Select a council" empty state and
   * the panel is populated from 1.0s; 1.2s in is the first frame where the
   * council has a name, a roster and a transcript in it at once.
   */
  shot("video/app/midnite-light-councils.mov", 4.833, 36, 1, BUILD_ENDS[1] - BUILD.items[1]),

  /**
   * The workflow graph. The middle of this take — 1.0s to 2.3s — is an empty
   * canvas with the inspector cleared, so the shot starts after it, at 3.2s,
   * where there are wired nodes on the left and a filled inspector on the right.
   */
  shot("video/app/midnite-light-workflows.mov", 7.067, 96, 1, BUILD_ENDS[2] - BUILD.items[2]),
] as const;

/* ── Stage 4 ──────────────────────────────────────────────────────────────── */

export const STAGE4 = {
  /**
   * The skill browser: the list on the left, a skill open beside it, and the
   * menus over it as one is picked. The take's first 1.5s is the page before
   * the sidebar has loaded — a header on an empty well — so the shot starts
   * after it and runs to the end of the movement.
   */
  skills: shot(
    "video/app/midnite-dark-skills.mov",
    6.92,
    48,
    1,
    HARNESS.loops.heading - HARNESS.skills.heading,
  ),

  /**
   * The loops panel — the one beat in this stage that is fully covered, and the
   * reason the six colour flashes are an overlay rather than a scene of their
   * own: the recording's tab bar already reads
   * `Guard · Concepts · Develop · Patrol · Medic · Overhaul` in exactly the six
   * colours the brief names, so the flashes ride over the product saying the
   * same thing rather than standing in for it.
   *
   * It is on screen for the whole movement, four bars, not just the two lines
   * about configuring — which is why `frames` is measured from the *heading*.
   * At 1× that is 6.8s of a 10.8s clip starting 3.0s in, so the tab selection
   * changes twice inside the shot and the panel is never held still.
   */
  loops: shot(
    "video/app/midnite-loops.mov",
    10.807,
    90,
    1,
    HARNESS.graphs.heading - HARNESS.loops.heading,
  ),

  /**
   * The agent graph, dark: the issue's dependency graph with its root picked
   * and an agent launched on it from the inspector, the terminal opening under
   * the canvas. The dark cut because it is the only one long enough — the
   * light take is 4.35s against a 5.13s movement and would have to be slowed.
   *
   * From 0.1s at 1.05×, which is what fits three bars into the 5.55s take.
   */
  graphs: {
    ...shot(
      "video/app/midnite-dark-agentic-graph.mov",
      5.552,
      3,
      1.05,
      HARNESS.companion.heading - HARNESS.graphs.heading,
    ),
    source: { width: 1920, height: 1208 },
  },

  /**
   * The companion being summoned and the panel sliding in. From frame 0 the
   * clip is a dashboard with nothing happening on it; the menu with "Companion"
   * under the cursor is at 0.45s and the panel is in by 1.3s.
   *
   * 0.78× to cover the three bars this movement runs. The clip is the shortest
   * of the nine at 4.49s and the span asks for 5.5s of it at 1×, so the rate is
   * not a stylistic choice — it is the fastest this shot can run without
   * freezing on its last frame. It is also invisible: the shot is a panel
   * sliding in and a cursor moving, neither of which has a speed a viewer knows.
   */
  companion: shot(
    "video/app/midnite-ai-companion.mov",
    4.49,
    12,
    0.78,
    OUTRO.connect - HARNESS.companion.heading,
  ),
} as const;

/* ── The check that stops a frozen shot shipping ──────────────────────────── */

/**
 * Every shot has to fit inside its clip, and this is the one thing in the edit
 * that fails silently: ask for more source than there is and `OffthreadVideo`
 * holds the last frame, which on a screen recording is indistinguishable from
 * the app having hung. Nothing in the render, the log or a still will tell you.
 *
 * So the arithmetic is checked here, at module scope, where getting it wrong
 * stops the bundle instead of shipping a freeze. Pending shots are skipped —
 * they have no clip to overrun — which means **filling one in re-arms this
 * check for it**, and that is the point: the `seconds` you paste from `ffprobe`
 * is what proves the window you chose exists.
 */
const ALL: readonly Shot[] = [
  ...Object.values(STAGE2),
  ...STAGE3.filter((s) => s.then === undefined),
  MULTI_WINDOW.loops,
  MULTI_WINDOW.repos,
  MULTI_WINDOW.terminal,
  ...Object.values(STAGE4),
];

for (const s of ALL) {
  if (s.clip === null) continue;
  const used = (s.trimBefore + s.frames * s.rate) / 30;
  if (used > s.seconds)
    throw new Error(
      `${s.clip}: the shot needs ${used.toFixed(2)}s of a ${s.seconds}s clip ` +
        `(trimBefore ${s.trimBefore}, ${s.frames} frames at ${s.rate}×)`,
    );
}
