# Editorial script — Midnite Apps

Project id `midnite-apps` · composition `MidniteApps` (and `MidniteAppsAnnotated`) · 1920×1080 ·
30 fps · **376 beats at 124 BPM = 5458 frames = 3:01.9** (v1 was v11's length, 264 beats / 2:07.7; v2 grew
it so every recorded app gets a slot).

The brief, with what was settled in conversation, is [`input/BRIEF.md`](input/BRIEF.md). In short:
video 1's **song** (the gym-energy bed, as in its v1), video 1's **v11 template** (the golive stage
with the neon-HUD kit in midnite's skin, the travelling mark, the looping lockup), the **Kokoro
`am_onyx` rap** voice-over with every line captioned, and **real footage** of the website, the
launcher and Studio's views in place of v11's HUD diagrams.

## Environment notes

- Editor: `video-editor/`. Preview: `cd video-editor && npm run dev -- --no-open`. Render:
  `node scripts/render.mjs midnite-apps <label>`; a still: `… --still <frame>`.
- **Sync assets first** after any new clip or audio: `node scripts/sync-assets.mjs midnite-apps`.
- **After every render, remux the audio 2048 samples earlier** (Remotion's AAC priming), as video 1:
  `ffmpeg -i vN.mp4 -itsoffset -0.0426667 -i vN.mp4 -map 0:v -map 1:a -c copy -movflags +faststart out.mp4`.
- Generated inputs, each re-run after the change named:
  - `node scripts/make-midnite-apps-soundtrack.mjs --report` → `input/bed.wav` (after a `MAP` change).
  - `node scripts/make-midnite-apps-voiceover.mjs --report` → `input/voiceover.wav` and
    `video-editor/src/projects/midnite-apps/voice-bed.ts` (after any `say` line or timing change).
    Kokoro's model is read from the app's own cache, offline.
  - `node scripts/make-track-envelope.mjs` → `energy-bed.ts`, the mark's speaker pulse (after the bed changes).
- Footage: `capture/README.md`, `capture/SHOTS-web-launcher.md`, `capture/SHOTS-studio.md`. Every
  clip was recorded in headless Chromium against the e2e/dev **mock bridges** — never the user's
  live app or profile — via CDP screencast at 1440×900 @2x (2880×1800), 30 fps H.264 crf 16, with an
  injected cursor.
- Do not run the repo-wide gate locally (RAM). `node_modules/.bin/tsc --noEmit -p video-editor` is
  cheap and is the check for this project's code.

## Source ground truth

No source video; from-scratch build. The only timing source is the bed.

| | Source `soulprodmusic-gym-energy-514739.mp3` | `input/bed.wav` |
|---|---|---|
| Tempo | 124.00 BPM (measured for video 1; beat = 14.516 frames) | same |
| Peak | 1.37 decoded as float | 0.95 (×0.6917, played back up by the same) |
| Length | 108.5 s | 181.94 s, 376 beats |

### The bed, arranged

| Output beats | Frames | Source beats | What |
|---|---|---|---|
| 0–96 | 0–1394 | 0–96 | intro pads → drop A |
| 96–136 | 1394–1974 | 64–104 | drop A's second half again, into the breakdown |
| 136–144 | 1974–2090 | 120–128 | breakdown's last bars + riser |
| 144–208 | 2090–3019 | 128–192 | drop B |
| 208–240 | 3019–3484 | 160–192 | drop B's second half again |
| 240–272 | 3484–3948 | 96–128 | the breakdown again, high-passed 20 Hz → 900 Hz over its last 16 beats, under the synthesized build; silent from 271.5 |
| 272–336 | 3948–4877 | — | the dubstep drop, synthesized (`scripts/midnite-apps-dubstep.mjs`) |
| 336–352 | 4877–5110 | 176–192 | back to the song: drop B's last phrase |
| 352–376 | 5110–5458 | 192–216 | the track's own tail, faded over the last 4 beats |

### The remix (v2)

`scripts/make-midnite-apps-soundtrack.mjs` arranges the source; `scripts/midnite-apps-dubstep.mjs`
synthesizes the two new parts in the song's key (G minor, measured by chroma; drop bass walks
G–C–G–B♭ a bar) and on its 124 BPM grid, deterministic (seeded noise):

- **Build** (beats 240–272): a snare roll accelerating quarters → 8ths → 16ths → 32nds with rising
  pitch, a noise riser 400 Hz → 9 kHz, a saw sweep G2 → G5, then a half-beat of silence.
- **Drop** (272–336), sixteen bars half-time (kick on 1, snare on 3), four 4-bar phrases so it never
  loops: a wobble opening half → quarter → 8th notes; "yoy" octave leaps with glide; an FM growl
  through a vowel formant with triplet LFOs; a gated reese into 1/32 chops, ending on D with an
  accelerating LFO and a 12-semitone bend under a snare roll back into the song.
- Levelled against the source: original drop B −14.5 LUFS, dubstep −13.2 LUFS, return −14.6 LUFS.
  Committed as `assets/audio/music/midnite-apps-gym-energy-dubstep-remix.mp3` (and the build + drop
  alone as `…-dubstep-drop.mp3`).

Every join is on a 16-beat phrase line with a 12 ms equal-power crossfade (video 1's method).

## Asset inventory

| Asset | Where | Referenced as |
|---|---|---|
| Bed, voice-over (generated) | `input/bed.wav`, `input/voiceover.wav` | `projectFile("midnite-apps")(…)` |
| New footage (27 clips) | `input/clips/*.mp4` | `shots[].file` |
| Browser, companion | `assets/video/app/midnite-studio-browser.mov`, `midnite-ai-companion.mov` (shared, 2912×1758, earlier real-app recordings) | `shots[].src` + `source` |
| Whooshes, riser | `assets/audio/sfx/…` via `shared/Sfx` | as video 1 |

## Timeline

Eight beats a slot; frame = round(beat × 14.516). Clip slots: card rises from beat 0, line A at
0.5, line B at 2, the "App ▸ View" readout at 2.75, the `say` line from beat 3. Stage: dark;
light from slot 5 (long wipe); dark at 11; the statement splits to light mid-slot 17; dark at 19;
light at 28 (the forge); dark at 30; the statement splits to light mid-slot 31; dark at 35 (the
dubstep drop); light at 43 for the recap; dark for the outro.

| # | Beat | Frame | Time | Slot | Footage (from s) | `say` |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0:00.0 | MIDNITE / APPS (delay 2) | web-hero-dark 1.2 | Midnite Apps — built a whole suite while the city was sleeping, |
| 2 | 8 | 116 | 0:03.9 | THE NIGHT / SHIFT | web-tour-dark 0.3 | agents on the graveyard shift — every line they wrote, I'm keeping. |
| 3 | 16 | 232 | 0:07.7 | NOT ONE APP / A LINEUP | web-tour-dark 4.2 | Not one app, a whole lineup — stacked up and designed; |
| 4 | 24 | 348 | 0:11.6 | GET / ACCESS | web-tour-dark 8.1 | the site's the front door: request access, get in line. |
| 5 | 32 | 465 | 0:15.5 | **ch 01 · The launcher** (drop A) | — | Chapter one: the launcher — the front door to the floor: |
| 6 | 40 | 581 | 0:19.4 | EVERY APP / ONE GRID | launcher-grid-light 0.5 | every app in a grid — what it does and what it's for. |
| 7 | 48 | 697 | 0:23.2 | ONE CLICK / INSTALL | launcher-detail-light 3.4 | Missing one? Hit install — it's verified, then it swaps, |
| 8 | 56 | 813 | 0:27.1 | ONE / UPDATER | launcher-table-light 3 | the launcher runs the updates, so the whole suite never drops. |
| 9 | 64 | 929 | 0:31.0 | HIT OPEN / DEEP LINK | launcher-detail-light 8.5 (4 beats) → landing-light 0.5 | Hit open and it deep-links — Studio lands on the view; |
| 10 | 72 | 1045 | 0:34.8 | APP TO APP / IN A HEARTBEAT | launcher-jump-light 3 → gitgraph-light 10.5 → models-light 6.5 → landing-light 6.5 (2 beats each) | app to app in a heartbeat, like the window's brand new. |
| 11 | 80 | 1161 | 0:38.7 | **ch 02 · Agents at work** | — | Chapter two: the agents — and they never take a nap. |
| 12 | 88 | 1277 | 0:42.6 | THE PROJECT / GRAPH | graph-partial-dark 12.5 | Every phase is a node on the project graph's map: |
| 13 | 96 | 1394 | 0:46.5 | HALF DONE / HALF IN FLIGHT | graph-partial-dark 4.5 | green nodes shipped, half-lit nodes still in flight, |
| 14 | 104 | 1510 | 0:50.3 | AGENTS / RUNNING | graph-agents-dark 0.5 | agents grinding on the nodes in the dead of the night. |
| 15 | 112 | 1626 | 0:54.2 | EVERY SESSION / OWN WORKTREE | sessions-dark 2.5 | Every session's got a worktree, every terminal's lit; |
| 16 | 120 | 1742 | 0:58.1 | FIVE MINDS / ONE ANSWER | councils-dark 10 | five minds in a council — one answer, that's it. |
| 17 | 128 | 1858 | 1:01.9 | statement "Every app is" / "one window." (breakdown) | — | Every app's a view... and every view's in one place: |
| 18 | 136 | 1974 | 1:05.8 | THE GIT / GRAPH, then the breath (riser) | gitgraph-light 0.5 | the git graph in the middle — every commit's got a face. |
| 19 | 144 | 2090 | 1:09.7 | **ch 03 · App to app** (drop B) | — | Chapter three... app to app... and not one reload: |
| 20 | 152 | 2206 | 1:13.5 | MIND / NOTES THAT STICK | notes-dark 1.5 | Mind keeps the notes — type a thought, hit enter, and it's stowed; |
| 21 | 160 | 2323 | 1:17.4 | SPACED / REVIEW | review-dark 1.6, cropped to the card | then it quizzes what you learned: show the answer, grade it Good — |
| 22 | 168 | 2439 | 1:21.3 | THE KNOWLEDGE / GRAPH | knowledge-dark 3.5 | the knowledge graph maps the code, every symbol in the hood. |
| 23 | 176 | 2555 | 1:25.2 | ASK / THE AGENT | chats-dark 7 | Chat with any agent — it'll read the code and cite the line; |
| 24 | 184 | 2671 | 1:29.0 | A BROWSER / AGENTS DRIVE | assets midnite-studio-browser 0 | the browser's got a driver: hands off, and it's doing fine. |
| 25 | 192 | 2787 | 1:32.9 | A COMPANION / THAT LISTENS | assets midnite-ai-companion 0.3 | The companion's on the mic — it listens when I speak; |
| 26 | 200 | 2903 | 1:36.8 | WORKFLOWS / RUN ALONE | workflows-dark 3 | workflows wire the agents into graphs that run all week. |
| 27 | 208 | 3019 | 1:40.6 | THE SWARM / SHIPS IT (drop B again) | graph-agents-dark 9.5 | The swarm ships phase one-sixteen, and I ain't even home — |
| 28 | 216 | 3135 | 1:44.5 | THE FORGE / BESIDE THE CODE | forge-light 3.4 → 7.6 → 10 (2, 3 beats) | the forge: four shards green, zero queued — LGTM, it's flown. |
| 29 | 224 | 3252 | 1:48.4 | LOCAL / MODELS | models-light 2 | Local models on the laptop — no cloud, and no cost; |
| 30 | 232 | 3368 | 1:52.3 | EVERY CORE / ACCOUNTED FOR | monitor-dark 0.6 cropped (4 beats) → 11.5 | the monitor tracks every core, so not a cycle's lost. |
| 31 | 240 | 3484 | 1:56.1 | statement "You've seen" / "half of it." (breakdown, build starts) | — | You've seen half the suite... and now the bass begins to build — |
| 32 | 248 | 3600 | 2:00.0 | AGENTS HARD / AT WORK | landing-light 0.5 | four agents hard at work, and every order's getting filled; |
| 33 | 256 | 3716 | 2:03.9 | THE REST / OF THE LINEUP | launcher-grid-light 3 | Creator, Gamer, Money, Media — lined up, waiting at the top, |
| 34 | 264 | 3832 | 2:07.7 | HOLD YOUR / BREATH, then the breath (build's gap) | launcher-jump-light 6 | so hold your breath... count it down... and let it drop. |
| 35 | 272 | 3948 | 2:11.6 | **ch 04 · The whole suite** (dubstep drop) | — | Chapter four: the whole suite — and the bass just hit the dark; |
| 36 | 280 | 4065 | 2:15.5 | CREATOR / DOCS AND ART | creator-dark 0.7 → 5 → 7 (3, 2 beats) | Creator writes the docs, and generates a marble mark; |
| 37 | 288 | 4181 | 2:19.4 | NIGHT DRIVE / EIGHTY BPM | creator-dark 11 | night-drive at eighty BPM, the drum grid's in the pocket; |
| 38 | 296 | 4297 | 2:23.2 | GAMER / THE CAPE IN 3D | gamer-dark 0.7 | Gamer flies the Cape in 3D — Table Mountain, lock it. |
| 39 | 304 | 4413 | 2:27.1 | CANYONS / AND CARS | gamer-dark 6.8 (4 beats) → 10.4 | Grand Canyon carved in polygons, a Lambo on the floor, |
| 40 | 312 | 4529 | 2:31.0 | MONEY / IN THE GREEN | money-dark 0.8 → 3.8 → 8 (3, 2 beats) | Money charts NVIDIA — the candles green, and up some more. |
| 41 | 320 | 4645 | 2:34.8 | MEDIA / YOUR OWN CINEMA | media-dark 1.6 (4 beats) → 6 | Media's your own cinema — Salt Line, resume at forty-one; |
| 42 | 328 | 4761 | 2:38.7 | MUSIC / AND MEMORIES | media-dark 8.2 (4 beats) → 13 | Neon Tide on the speakers, and the Grand Canyon in the sun. |
| 43 | 336 | 4877 | 2:42.6 | slugs "Eight apps": Studio … Media, **Mind** (back to the song) | — | Eight apps, one launcher, one grid that ties up the loose ends — |
| 44 | 344 | 4994 | 2:46.5 | ONE LAUNCHER / EVERY APP | launcher-grid-light 9 | one window, every app — and this night shift never ends. |
| — | 352–376 | 5110–5458 | 2:50.3–3:01.9 | outro IT NEVER / CLOCKS OUT, badge MIDNITE · APPS, lockup "Midnite Apps", cta "get access" | — | — |

Copy, tones and shots live in `content.ts`, which is the source of truth. Red is used once, for
negation ("NOT ONE APP").

### The rap

Couplets across slot pairs, with multi-syllable end rhymes where they cost no clarity
(sleeping/keeping, designed/line, floor/for, swaps/drops, view/new, nap/map, flight/night,
lit/it, place/face, reload/stowed, Good/hood, line/fine, speak/week, home/flown, cost/lost,
build/filled, top/drop, dark/mark, pocket/lock it, floor/more, one/sun, ends/ends), and
the hook paid off in the last line and the outro (the night shift that never clocks out). Every fact
is one the footage shows or the launcher's catalog states: the launcher verifies a download before
it swaps it in and owns the suite's updates; Open deep-links Studio onto the app's view; the
project graph's nodes are phases (Todo / In progress / In review / Done); the landing shows "Agents
hard at work"; models run locally. Respellings for Kokoro: "Midnite" → "Midnight", "PRs" → "P Rs".

## Code layout

`video-editor/src/projects/midnite-apps/` (shared kit imports are `../../shared/`):

- `cuts.ts` — the one cut's clock, slots, drops, breath, riser and audio levels (video 1's bed levels).
- `content.ts` — the 44 slots (`clip`, `chapter`, `statement`, `slugs`, each with a `say`), stage, outro.
- `Clip.tsx` — the clip slot: inline 80px headline, a 1184×740 `AppWindow` card, beat-cut shots
  with a flash, the readout pill; `clipStation` for the mark.
- `Episode.tsx` — video 1's sequencer with clips for scenes. `Mark.tsx` — video 1's mark on this bed.
- `energy-bed.ts`, `voice-bed.ts` — generated.
- `register.tsx`, plus one line in `src/Root.tsx`.

## Open items

- **Two shots are the earlier real-app recordings** in `assets/video/app` (browser, companion),
  because the browser is an Electron webview a plain page can't host. They are real product footage.
- **Staged content in the captures** (see `capture/SHOTS-studio.md`): the council run's answers,
  the workflow run and the chat's streamed answer are driven in-page on the mock; Creator, Gamer,
  Money, Media, Review and Monitor run on seeded fixtures in `capture/`.
- **Review and Monitor are cropped** in the card (`crop` on the shot): Review's card is a band
  across an otherwise empty page, Monitor's page is a centred column.

## Next steps

1. [x] Bed arranged to 264 beats; envelope baked.
2. [x] Footage captured (website, launcher, Studio views).
3. [x] Composition built; stills of every slot checked.
4. [x] Rap voice-over generated.
5. [x] v1 render, remux, measure — `output/v1-first-cut.mp4`, −16.8 LUFS, peak −1.6 dBFS.
6. [x] v2: grown to 376 beats with the dubstep remix; Creator, Gamer, Money, Media, Forge, Chats,
   Review and Monitor recorded; 44 lines, 0 spilling.
7. [ ] Review in Media ▸ Video.
