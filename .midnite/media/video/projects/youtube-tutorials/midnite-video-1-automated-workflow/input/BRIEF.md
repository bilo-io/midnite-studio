# Brief — Midnite video 1: the automated workflow

*In the neon-HUD template's shape
([`templates/youtube-tutorials/neon-hud`](../../../../templates/youtube-tutorials/neon-hud/README.md)).*

A **~80-second explainer** of how the midnite workflow builds software with
almost no hand-written code: skills, loops and a swarm of sub-agents run by one
orchestrator session, tuned so every token goes further. The source is a 5:47
voice note from the author (transcript beside this brief,
[`voice-note-transcript.md`](voice-note-transcript.md)); the video is that
note, edited down to its essence.

- **Music**: a re-arrangement of the template's own bed,
  `assets/audio/music/soulprodmusic-gym-energy-514739.mp3` (123.05 BPM,
  G minor), with a little more variation than the template: a
  breakdown, a riser into a second drop, a dropout before the second chapter,
  and the track's own tail as the ending. It is built offline to
  `input/bed.wav` by `scripts/make-midnite-video-1-soundtrack.mjs`.
- **Voice-over**: none. The copy is on screen, like the reference.
- **Grid**: eight beats a scene, every cut on the bed's beat grid, chapter
  cards on its phrase changes, and the outro on the last bars of the drop.
- **Tone**: confident and a little cheeky ("planning mode, on crack"). No
  swearing on screen.

## The message, in one line

> I stopped typing code. A loop of skills plans it, a swarm builds it, and
> nothing is lost when the laptop dies. It's a token factory.

---

## Hook (4 scenes, before chapter 01)

| # | Line A (setup) | Line B (payoff) | Tone | Diagram | Pill |
|---|---|---|---|---|---|
| 1 | TWO MONTHS | ZERO LINES | red | compare: *typed by me* (struck) vs *typed by agents* ✓ | by hand |
| 2 | OVER A | MILLION LINES | cyan | stat: 1.0 M, "lines my laptop wrote" | |
| 3 | NOT (red) | ANOTHER APP | cyan | compare: *IDE* / *chat window* both struck | |
| 4 | A TOKEN | FACTORY | cyan | hub: *orchestrator* → ideate / refine / create / swarm, routes to swarm | skills + loops + agents |

## Chapter 01 — The skill loop

| # | Line A | Line B | Tone | Diagram | Pill |
|---|---|---|---|---|---|
| 5 | IDEATE | MULTIPLE CHOICE | cyan | terminal: `/midnite-ideate`, four options, pick one | planning mode, on crack |
| 6 | REFINE | THE PLAN | amber | compare: *rough plan* vs *refined spec* ✓ | so a smaller model can run it |
| 7 | CREATE | PICKS IT UP | green | steps: backlog → worktree → PR | |

## Chapter 02 — The swarm

| # | Line A | Line B | Tone | Diagram | Pill |
|---|---|---|---|---|---|
| 8 | ONE | ORCHESTRATOR | cyan | hub: *orchestrator* → three phases | the session I watch |
| 9 | RIGHT MODEL | PER TASK | cyan | steps: haiku / sonnet / opus | |
| 10 | EVERY AGENT | OWN WORKTREE | green | terminal: two `git worktree add` lines | |

## The breath (2 scenes over the breakdown)

| # | Line A | Line B | Tone | Diagram | Pill |
|---|---|---|---|---|---|
| 11 | STRETCH | EVERY TOKEN | cyan | lines: *refined plan* flat vs *raw prompt* climbing | |
| 12 | THE CATCH | CONTEXT FILLS UP | amber | bars climbing to full | |

## Chapter 03 — Never lose work

| # | Line A | Line B | Tone | Diagram | Pill |
|---|---|---|---|---|---|
| 13 | AUTO | COMPACT | cyan | gauge 40 %, "orchestrator compacts at 20–40 %" | |
| 14 | ROTATE AT | HALF FULL | amber | stat 500 K, "tokens, then a fresh sub-agent" | |
| 15 | CRASH? | NOTHING LOST | green | terminal: `cat SCRATCHPAD.md`, `claude --resume` | |

## Outro

- Payoff pair: IT JUST / KEEPS GOING
- Caption: MIDNITE · AUTOMATED WORKFLOW
- Call to action: subscribe

---

## Revision — v2 (2026-10-19)

Feedback on v1:

- **Longer and more verbose.** v1 ran 81s with headlines only.
- **The music sounds broken in places**: "a loud crack out of rhythm", pinpointed at
  **~30s and ~69s**.

What v2 does about it:

- 1:52 (232 beats) and 26 slots against 18. Each chapter has five scenes, the swarm
  chapter gains *sub-agents in parallel* and *other models review it*, and there is a
  recap.
- A `say` line under every slot: one sentence in the author's own words from the voice
  note.
- The two half-beat dropouts (the ~30s and ~69s glitches) are gone. The bed is decoded
  as float and given headroom, so its 95 clipped transients are gone too. The riser now
  fades in instead of stepping in.
