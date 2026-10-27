import type { SceneSpec } from "../../../shared/neon-hud/Scene";

/**
 * Everything the episode *says* — the template's `content.ts`, filled in from
 * the editorial script. Each entry is one slot; how long a slot is depends on
 * the cut (`cuts.ts`): eight beats of the bed, or two or three bars of the
 * Iron Aria. The comments mark where each sits on the bed (see
 * `EDITORIAL_SCRIPT.md` for frames).
 *
 * `say` is the episode's one addition to the template's grammar: a sentence
 * under the picture, in the author's own words from the voice note, so the
 * film explains rather than only asserts, and is spoken by the voice-over.
 * Keep it under ~70 characters — it has the slot's middle six beats to be read.
 */
export type Slot = (
  | { scene: SceneSpec }
  | { chapter: string }
  /** The golive statement: one sentence in two halves, the second landing on a wipe to the other stage. */
  | { statement: readonly [string, string] }
  /** The golive slugs: a typed title, then one command typed per beat. */
  | { slugs: { title: string; slugs: readonly string[]; star?: number } }
) & { say?: string };

/**
 * Where the stage turns over, by slot: from v4 the episode stands on the golive
 * kit's two stages (`shared/golive/stage.ts`). `half` flips mid-slot (the
 * statement's second half); `long` is the first change, meant to be watched.
 * The outro always wipes back to dark.
 */
export type StageChange = { slot: number; theme: "light" | "dark"; half?: boolean; long?: boolean };

export const PROJECT_ID = "youtube-tutorials/midnite-video-1-automated-workflow";

export const CONTENT = {
  episode: "Midnite video 1 — the automated workflow",

  timeline: [
    // ── Hook (beats 0–32): intro pads, light kick from 16 ──────────────────
    {
      scene: {
        a: "TWO MONTHS",
        b: "ZERO LINES",
        tone: "red",
        /* The mark has the frame to itself for the first two beats (see `Mark.tsx`'s HOME). */
        delay: 2,
        visual: { kind: "compare", cards: [{ title: "lines typed by me", tone: "red", mark: "cross" }] },
        pill: { text: "by hand" },
      },
      say: "Two months and I typed not even one line of code —",
    },
    {
      scene: {
        a: "OVER A",
        b: "MILLION LINES",
        visual: { kind: "growth", value: 1_000_000, suffix: "++", caption: "lines my laptop wrote" },
      },
      say: "my laptop wrote over a million — ghostwriter workflow.",
    },
    {
      scene: {
        a: "NOT",
        aTone: "red",
        b: "ANOTHER APP",
        layout: "inline",
        visual: {
          kind: "compare",
          cards: [
            { title: "another IDE or chat app", tone: "red", mark: "cross" },
            { title: "the workflow around it", tone: "green", mark: "check" },
          ],
        },
      },
      say: "The trick isn't the tool — it's the workflow around the tools:",
    },
    {
      scene: {
        a: "A TOKEN",
        b: "FACTORY",
        visual: {
          kind: "hub",
          core: "orchestrator",
          nodes: [
            { label: "ideate", icon: "ideate" },
            { label: "refine", icon: "refine" },
            { label: "create", icon: "create" },
            { label: "swarm", icon: "swarm" },
          ],
        },
        pill: { text: "skills + loops + agents" },
      },
      say: "skills, loops, sub-agents — every token pays its dues.",
    },

    // ── Drop A (beat 32) ───────────────────────────────────────────────────
    { chapter: "The skill loop", say: "Every step is a skill... with a loop is quite chill." },
    {
      scene: {
        a: "IDEATE",
        b: "INTERVIEWS ME",
        layout: "inline",
        visual: {
          kind: "terminal",
          title: "~/midnite-studio",
          lines: ["$ /midnite-ideate", "? what should we build next"],
        },
      },
      say: "Ideation interviews me: what are we building next?",
    },
    {
      scene: {
        a: "FOUR OPTIONS",
        b: "PICK ONE",
        visual: {
          kind: "hub",
          core: "next feature",
          nodes: [{ label: "option 1" }, { label: "option 2" }, { label: "option 3" }, { label: "option 4" }],
          pick: 2,
        },
        pill: { text: "planning mode, on crack" },
      },
      say: "Multiple choice every time... you and I choose what's best.",
    },
    {
      scene: {
        a: "THE PLAN",
        b: "LIVES IN THE REPO",
        visual: {
          kind: "terminal",
          title: "~/midnite-studio",
          lines: ["$ ls .midnite/tasks/phases", "phase-91-security.md", "phase-101-music.md"],
        },
      },
      say: "Then it writes the plan in markdown, right there in the repo —",
    },
    {
      scene: {
        a: "REFINE",
        b: "THE PLAN",
        tone: "amber",
        layout: "inline",
        visual: {
          kind: "compare",
          cards: [
            { title: "rough plan", tone: "red", mark: "cross" },
            { title: "refined spec", tone: "green", mark: "check" },
          ],
        },
        pill: { text: "so a smaller model can run it" },
      },
      say: "refine sharpens every edge till a cheaper model runs the show.",
    },
    {
      scene: {
        a: "CREATE",
        b: "PICKS IT UP",
        tone: "green",
        layout: "inline",
        visual: {
          kind: "steps",
          steps: [
            { title: "backlog", sub: "pick a task", tone: "blue" },
            { title: "worktree", sub: "build it", tone: "cyan" },
            { title: "PR", sub: "ship it", tone: "green" },
          ],
        },
      },
      say: "Create picks it off the backlog, builds it — ready, set, go.",
    },

    // ── Drop A, last phrase (beat 80) ──────────────────────────────────────
    { chapter: "The swarm", say: "One session's good. A swarm is better — top notch." },
    {
      scene: {
        a: "ONE",
        b: "ORCHESTRATOR",
        layout: "inline",
        visual: {
          kind: "hub",
          core: "orchestrator",
          nodes: [{ label: "phase 91" }, { label: "phase 101" }, { label: "issue #612" }],
        },
        pill: { text: "the session I watch" },
      },
      say: "my main session's the orchestrator — the only one I watch.",
    },
    {
      scene: {
        a: "SUB-AGENTS",
        b: "IN PARALLEL",
        visual: {
          kind: "terminal",
          title: "~/midnite-studio",
          lines: ["$ /midnite-swarm 91 101", "→ 2 sub-agents launched"],
        },
      },
      say: "It spawns the sub-agents, and they do the actual building —",
    },
    {
      scene: {
        a: "RIGHT MODEL",
        b: "PER TASK",
        visual: {
          kind: "steps",
          steps: [
            { title: "haiku", sub: "mechanical", tone: "blue" },
            { title: "sonnet", sub: "spec'd builds", tone: "cyan" },
            { title: "opus", sub: "judgment", tone: "green" },
          ],
        },
      },
      say: "clever models hold the fort, cheaper ones do the filling.",
    },
    {
      scene: {
        a: "EVERY AGENT",
        b: "OWN WORKTREE",
        tone: "green",
        visual: {
          kind: "terminal",
          title: "~/midnite-studio",
          lines: ["$ git worktree add wt/a", "$ git worktree add wt/b", "2 agents · 0 clashes"],
        },
      },
      say: "Each one in its own git worktree, so nobody collides —",
    },
    {
      scene: {
        a: "OTHER MODELS",
        b: "REVIEW IT",
        tone: "amber",
        visual: {
          kind: "compare",
          cards: [
            { title: "writer model", tone: "green", mark: "ring" },
            { title: "reviewer model", tone: "amber", mark: "check" },
          ],
        },
        pill: { text: "a second opinion on every PR" },
      },
      say: "then a different model, ideally, reviews each PR — no free rides.",
    },

    // ── The breath (beats 128–144): breakdown, then the riser ──────────────
    // From v4, golive's statement: the dark half, then the light half on a wipe.
    {
      statement: ["Every app is", "a terminal."],
      say: "All these tools and apps? Just a front end for a terminal —",
    },
    {
      scene: {
        a: "STRETCH",
        b: "EVERY TOKEN",
        visual: { kind: "lines", flat: "refined plan", rising: "raw prompt" },
      },
      say: "the whole point's to stretch my usage: that's the formula.",
    },

    // ── Drop B (beat 144) ──────────────────────────────────────────────────
    { chapter: "Never lose work", say: "Sessions die... the work... does not." },
    {
      scene: {
        a: "THE CATCH",
        b: "CONTEXT FILLS UP",
        tone: "amber",
        visual: {
          kind: "bars",
          bars: [
            { label: "t1", value: 20 },
            { label: "t2", value: 45 },
            { label: "t3", value: 70 },
            { label: "t4", value: 96 },
          ],
          best: 3,
        },
      },
      say: "Long sessions' context window should eventually be released —",
    },
    {
      scene: {
        a: "AUTO",
        b: "COMPACT",
        layout: "inline",
        visual: { kind: "pie", from: 50, to: 0, caption: "context window used" },
        pill: { text: "compacts at 20–40%" },
      },
      say: "so the orchestrator auto-compacts to give the session a relief.",
    },
    {
      scene: {
        a: "ROTATE AT",
        b: "HALF FULL",
        tone: "amber",
        visual: { kind: "stat", value: 500, unit: "K", caption: "tokens, then a fresh sub-agent" },
      },
      say: "sub-agents cap at 500K tokens — fresh one's sent.",
    },
    {
      scene: {
        a: "WRITE IT",
        b: "DOWN",
        layout: "inline",
        visual: {
          kind: "terminal",
          title: "wt/a/SCRATCHPAD.md",
          lines: ["## task", "## decisions", "## next"],
        },
      },
      say: "Every worktree keeps a scratchpad: what it's doing, and why.",
    },
    {
      scene: {
        a: "CRASH?",
        b: "NOTHING LOST",
        tone: "green",
        visual: {
          kind: "terminal",
          title: "~/midnite-studio",
          lines: ["$ claude --resume", "orchestrator: picking up wt/a"],
        },
      },
      say: "laptop dies of memory loss? I resume — no goodbye.",
    },

    // ── Recap (beats 192–208): drop B's last phrase ────────────────────────
    // From v4, golive's typed slugs. From v10 the loop's four skills, each typed as it is
    // named, then /swarm in the full ramp on the word itself (`Episode.tsx`, from the voice's timing).
    {
      slugs: { title: "The whole loop", slugs: ["/ideate", "/refine", "/create", "/review", "/swarm"], star: 4 },
      say: "Ideate, refine, create, review... with a swarm on the go:",
    },
    {
      scene: {
        a: "AS LONG AS",
        b: "THE USAGE LASTS",
        visual: {
          kind: "checklist",
          items: ["work in the backlog", "usage left this week"],
        },
      },
      say: "as long as there's work to do, the session's gonna flow.",
    },
  ] satisfies Slot[],

  /** The outro: the track's own tail carries the close (beat 208 of the bed). */
  outro: {
    a: "IT JUST",
    b: "KEEPS GOING",
    caption: "MIDNITE · AUTOMATED WORKFLOW",
    cta: "subscribe",
    /** The word after "Midnite" in the closing lockup. */
    qualifier: "Studio",
  },

  stage: [
    { slot: 4, theme: "light", long: true },
    { slot: 10, theme: "dark" },
    { slot: 16, theme: "light", half: true },
    { slot: 18, theme: "dark" },
    { slot: 25, theme: "light" },
  ] satisfies StageChange[],
};
