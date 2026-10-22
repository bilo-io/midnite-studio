# Studio shots — Midnite Apps promo

These clips are in `../input/clips/`. Every clip is 2880×1800 at 30 fps (constant), H.264 yuv420p, recorded from 1440×900 at DSF 2.

Every clip opens with a hold of roughly 0.5–0.8 s. The repos side panel is closed in all of them. The terminal is closed except where the shot is about sessions or terminals. The cursor overlay is visible throughout.

The stills `stills/<clip>-{start,mid,end}.jpg` and `stills/<clip>-sheet.jpg` were checked for every clip:
- text is crisp;
- nothing is blank and no spinners are stuck;
- no "mock", "fixture" or error text appears.

The timings in the table are approximate and come from the spec scripts.

| Clip | Theme | Res / fps / dur | On screen over time | Best 4 s | Caveats |
|---|---|---|---|---|---|
| `graph-partial-dark.mp4` | dark | 2880×1800 · 30 · 16.6 s | **Tasks ▸ Graph view** of "Midnite Studio roadmap" (16 phases, dependency edges, statuses).<br>0.6–4.5 s: hover Phase 87 · Knowledge graph #842 → Phase 89 · Knowledge variants #860 → Phase 113 · Midnite Apps split #930.<br>4.5–6.4 s: ctrl-zoom in.<br>6.4–8.6 s: pan down and right.<br>8.6–10.8 s: hover Phase 116 · Test suite diet #950 → Phase 111 · Voice agent #925.<br>11–16.6 s: eased pull-out that frames the whole 16-node board. | 4.5–8.5 (zoom + pan)<br>12.5–16.5 (pull-out to the full board) | Runs over 14 s; trim the head or the tail. |
| `graph-agents-dark.mp4` | dark | 2880×1800 · 30 · 14.4 s | Same board with **4 live agents**: glow rings on 116, 111, 106, 89 (running, plus one waiting); title-bar pill "4 agents".<br>1.5–5 s: hover 89 → 111 → 116.<br>5.5–7.3 s: zoom in.<br>~7.8 s: click Phase 116 → detail pane "Phase 116 · Test suite diet" (Task tab, `/midnite-create`, In progress).<br>~9.5 s: click the node's terminal toggle → the terminal opens on the Claude session streaming in `worktrees/phase-116-test-suite-diet` (Update/Write/Bash lines, `git commit -am "feat: the visual-baseline ratchet"`), with the agent roster on the right.<br>Holds to the end. | 0.5–4.5 (glows)<br>9.5–13.5 (terminal streaming) | Terminal is open by design. |
| `sessions-dark.mp4` | dark | 2880×1800 · 30 · 13.0 s | **Sessions**: list "SESSIONS 7" under MIDNITE-STUDIO.<br>Live sessions: phase-116-test-suite-diet, phase-111-voice-agent, phase-106-2d-assets, phase-89-knowledge-variants.<br>Ended sessions: phase-113-midnite-apps-split, phase-108-maps, phase-105-terrain.<br>Agent output streams in each.<br>Clicks: 116 → ~3.4 s 111 → ~7 s 106 → ~10.5 s back to 116.<br>Header reads e.g. "/midnite-create Phase 116 · Test suite diet — Theme D — the visual-baseline ratchet". | 2.5–6.5 | — |
| `councils-dark.mp4` | dark | 2880×1800 · 30 · 16.0 s | **Councils ▸ Release council** ("Go / no-go before a tag is cut."). Members: Architect (Antigravity), Skeptic (Codex), Security (OpenCode), Release manager (Antigravity).<br>~1.5–3.5 s: type "Should v0.0.5 ship the launcher auto-update channel, or hold it a release?"<br>~4.3 s: Run.<br>Member tabs spin, then settle one by one ("Still running: …").<br>~6 s: Architect answer. ~8.2 s: Skeptic answer.<br>~10.6 s: Synthesis → "Verdict: ship the auto-update channel in v0.0.5, default-off." Run row turns green "Done". | 3.5–7.5 (Run + panel settling)<br>10.5–14.5 (verdict) | Over 14 s, so trim. The final green "Done" on the run-list row is a DOM patch, because the mock never refetches the list. Answers are staged in-page with written prose. |
| `gitgraph-light.mp4` | light | 2880×1800 · 30 · 15.4 s | **Git graph** (Timeline): 36 commits, tags v0.0.3 and v0.0.4, merged PRs #884, #889, #915, #931, #949, squash commits #951 and #952.<br>Four open agent branches glow: feature/phase-116-test-suite-diet, feature/phase-89-knowledge-variants, feature/phase-106-parallax, feature/phase-111-voice-agent. Pill reads "4 agents".<br>0.6–4 s: hover rows.<br>4–6.5 s: scroll down through the merges.<br>~7 s: hover "Merge pull request #931".<br>8–10 s: scroll back.<br>~10.7 s: click "feat(e2e): visual-baseline ratchet in e2e-budget.mjs (Phase 116 Theme D)" → commit panel (author Bilo Lwabona, "4 files +57 −9", "Refs #950").<br>~12.9 s: expand `scripts/e2e-budget.mjs` diff. | 0.5–4.5 (glowing branches)<br>10.5–14.5 (commit + diff) | Avatars are blocked (initials shown). The BRANCH / TAG column is widened before recording. |
| `knowledge-dark.mp4` | dark | 2880×1800 · 30 · 10.5 s | **Knowledge**: 519 real symbols from this repo in 13 communities. All relations are on ("Relations 2,289 / 2,289 edges").<br>0.7–2.9 s: drift.<br>~3.7 s: type `useTerminalStore` into "Search nodes…". The camera flies to it.<br>~6 s: click → "Knowledge · node" panel with the real `terminal-store.ts` source.<br>Drift, then hold. | 3.5–7.5 | A sample of the real graph, not all 15k nodes. |
| `workflows-dark.mp4` | dark | 2880×1800 · 30 · 13.4 s | **Graphs ▸ Research & publish** (15 nodes), zoomed so the cards read. Demo API pill "running on :4747".<br>0.6–1.8 s: glide over Start.<br>~2.9 s: Run → "Run output · running" opens.<br>~3.4–9.7 s: nodes light up wave by wave while the camera pans along the chain: Start → Scope topic → Decompose → Company sources / Papers / Expert posts → Join (allSettled) → Dedupe → Draft → Final check → Repair → Sign off → Publish.<br>The table fills with Succeeded and ~560 ms durations. Ends "completed". | 3–7<br>7–11 | The run is staged through the app's own `onRunChanged` handler. Every node succeeds, including the Repair step (a real run would skip it). HTTP cards show the template's own `{{demo.baseUrl}}` URLs. The left graph list and the node palette stay open. |
| `models-light.mp4` | light | 2880×1800 · 30 · 12.2 s | **Models ▸ Installed**: qwen3.5:9b, llama3.2:3b, gemma3:12b, deepseek-r1:8b, qwen2.5-coder:7b, nomic-embed-text:latest (families, sizes, Q4_K_M).<br>~2.5 s: click qwen3.5:9b → detail: Parameters 9.2B, Quantisation Q4_K_M, Architecture qwen3, Context 262,144 max / 65,536 effective; tags completion, vision, tools, thinking; "Fit for agents"; Modelfile shown.<br>~5 s: close.<br>~5.5 s: **Discover** tab.<br>~6.5 s: type "qwen" → qwen3.5 and qwen3-coder rows with variants and Pull buttons. | 2–6 (detail)<br>6.5–10.5 (Discover) | Library rows (pull counts, blurbs) are written in-page, not fetched. |
| `notes-dark.mp4` | dark | 2880×1800 · 30 · 15.3 s | **Notes** ("2/6 done" → "2/7 done"): six realistic notes with captured, planned and implemented tags.<br>~1.5–4.5 s: type "Graphs: let the camera follow the running wave during a run, so a long chain stays on screen." then Enter. It lands at the top and opens in the editor.<br>~7.5 s: open the Councils note (markdown in the editor).<br>~9.5 s: toggle preview → rendered headings "Shape" and "Open", bullets, and checkboxes. | 1.5–5.5 (capture)<br>7–11 (open + preview) | Over 14 s, so trim. |
| `landing-light.mp4` | light | 2880×1800 · 30 · 10.8 s | **Landing page**: "Wednesday / 21 October 2026", "Midnite Studio" wordmark, a live clock with "LOCAL TIME", and a rotating typewriter word (e.g. "tinkering", "vibing") over "Agents hard at work".<br>Pills: 1 repos · 4 agents · 0 my PRs · 0 team PRs. CPU / RAM / GPU sparklines with "14 cores".<br>~7.5 s: the carousel slides to "Getting around — The panels and the two ways to find anything" (shortcut cheat sheet). | 0.5–4.5<br>6.5–10.5 | The typewriter word varies run to run. The "No watchlisted assets" empty line is hidden by a DOM tweak, because the finance store never hydrates on the mock. The PR counts are 0. |
| `creator-dark.mp4` | dark | 2880×1800 · 30 · 15.7 s | **Creator** (Studio's Media tabs), seeded from the real projects in `.midnite/media/`.<br>0–4.9 s **Media ▸ Docs**: "Midnite Studio" in DOCS PILOT 2 ("A desktop workspace for everything you do around a repository…", "What it is", "At a glance" table), scrolls to "Screenshots" / "Architecture" / "The IPC envelope"; edit thread on the right ("Edit to document Accepted").<br>~5–6.9 s **Media ▸ Images**: "GENERATED 22" wallpaper masonry with the "Generate image" tile.<br>~7–8.4 s lightbox, white marble Midnite logo; ~8.5–9.4 s ArrowRight to the dark marble logo; ~9.5–10.4 s back on the gallery.<br>~10.5–15.7 s **Media ▸ Audio** editor, night-drive "Song 1": Drums / Bass / Piano Chords / Piano Melody tracks, 80 BPM · 4/4, "Drum grid", "Chat · Song 1" with "What changed". | 0.6–4.6 (Docs scroll)<br>5–9 (gallery + lightbox)<br>11–15 (Audio) | No Video tab: it needs a Remotion project root. Lightbox holds are static for ~1.2 s and ~1 s (no frames change, by design). The Docs lead image line is removed from the seeded markdown (its file is not in the project). |
| `gamer-dark.mp4` | dark | 2880×1800 · 30 · 16.9 s | **Gamer** (Studio's Media tabs), real projects from `.midnite/media/`, live GPU render.<br>0–4.4 s **Media ▸ Maps** "VIEW · CAPE PENINSULA": Table Mountain / Cape Town, Satellite basemap with 3D terrain; pan 0.7–2.4 s, rotate ~2.4–3.4 s.<br>4.5–5.7 s **Media ▸ Terrain** "Select a terrain" → loading; 5.75–6.5 s the Grand Canyon mesh streams in; 6.5–9.9 s full terrain ("Captured from Maps · Grand Canyon, Ari…", heightmap 1025 × 1025 · 16-bit), orbit.<br>~10–13.8 s **Media ▸ Models** "SHOWCASE": the yellow Lamborghini Gallardo, orbit ~10.5–12.5 s.<br>~13.9–14.5 s "Opening model…"; ~15–16.9 s Iron Man armour. | 0.6–4.4 (map)<br>6.5–9.9 (terrain orbit)<br>10–13.8 (Lamborghini) | Terrain's empty/loading beat (4.5–6.5 s) and the model spinner (~13.9–14.5 s) should be cut around. Streets (vector) basemap would not load in headless, so the map is Satellite. Map tiles came over the network through main's own tile handler (cached in `frames/_tiles`). The mesh-warning pill is hidden by CSS. No Sprites or Games: there are no such projects on disk. |
| `money-dark.mp4` | dark | 2880×1800 · 30 · 15.0 s | **Money ▸ Markets** (Studio's Dashboard ▸ Finance board). Cards ZAR / EUR / USD $4,820.50; Assets NVIDIA, SPY, ETH, BTC; Allocation donut "TOTAL $48,904.38"; Watchlist Apple, Bitcoin, Ethereum, NVIDIA, Solana, Tesla with sparklines.<br>0–1 s Bitcoin BTC $59,684.02 candles (1M).<br>~1–2 s bank cards fan out (EUR €1,250.00); ~2–3 s asset stack fans; ~2.5 s Allocation hover.<br>~4 s "Show NVIDIA on the chart" → NVIDIA NVDA $112.36 candles; ~6 s 1Y.<br>~8–11 s chart type Area, crosshair across the line.<br>~11–12 s the board scrolls; 12–15 s Insights ("Up 3.9% over the past year…", Volatility, Max drawdown), Markets (Alphabet, Amazon, AMD, Avalanche, BNB, Cardano, Chainlink, Coca-Cola), Transactions (NVIDIA / Bitcoin / Ethereum buys, Oct 2026), Market news. | 1–5 (cards fan + NVIDIA)<br>7.5–11.5 (Area + crosshair)<br>11–15 (scroll to markets + news) | Prices are the mock's seeded series (stable run to run), shifted onto today's dates in-page. Transactions and headlines are written in the spec. The Studio dashboard tab strip (Git / Agents / Finance) shows at the top. |
| `media-dark.mp4` | dark | 2880×1800 · 30 · 15.7 s | **Media ▸ Library** (Movies & Shows / Music / Photos).<br>0–1.9 s Films grid ("CONTINUE WATCHING") with The Long Meridian detail ("Resume from 18:00").<br>~2–3.9 s Salt Line detail ("A FILM BY NOOR ADEYEMI", "Resume from 41:00").<br>~4–5.9 s Shows grid; ~6 s Harbour Lights episode list; ~7 s Shipping Forecast detail.<br>~8–9.9 s Music grid (Terra, Neon Tide, Meridian, Blue Hour, Warehouse Hours, Late Session); ~10 s Neon Tide track list; ~11 s Midnight Ferry detail.<br>~12–13.9 s Photos grid; ~14–15.7 s "Grand Canyon, South Rim" detail. | 0.5–4.5 (films + detail)<br>8–12 (music) | Posters and covers are generated art (`fixtures/media-art.mjs`, from local captures). `mstudio-file:` image URLs are rewritten to the Vite server in-page. |
| `forge-light.mp4` | light | 2880×1800 · 30 · 14.2 s | **Coder ▸ Git Forge** (Studio rail "Reviews").<br>0–1 s #952 open, Open list.<br>~1–2.9 s click "All" → 9 PRs (open #950 / #951 / #952, draft #953, merged #944–#949).<br>~3–5.9 s #950 "fold gate-locale into gate-native…" Overview (What / Why table).<br>~6–9.9 s Checks: CI run in progress, jobs pane scrolls, e2e (4) running selected, Playwright log.<br>~10–11.9 s Conversation (thandi-m thread, bilo-io "Peak concurrent macos-14 jobs… 5. Queued: 0", jkruger "LGTM 🚀").<br>~12–14.2 s Files: ci.yml diff with an inline thread on `shard: [1, 2]`, then scrolls. | 2.5–6.5 (list → #950)<br>6–10 (checks running) | Reviewers thandi-m and jkruger are invented, as is draft #953. The diff hunks are real ci.yml lines from #950. |
| `chats-dark.mp4` | dark | 2880×1800 · 30 · 12.4 s | **Agents ▸ Chats**, chat "The terminal broker" (6 chats listed).<br>0–1.9 s prior Q&A ("Where does the pty broker live?").<br>~2–4.9 s type "Why do my terminals survive a reinstall? Show me where the socket name is built."<br>~5–6 s sent, "Calibrating…" thinking pill.<br>~7–8.9 s tool chips: Read socket-name.ts, Grep "brokerSocketName", Read staleness.ts, Read client.ts.<br>~9–10.9 s the answer streams: **build fingerprint**, a ts code block (`brokerSocketName`, `fingerprintFile`), numbered list.<br>~11–12.4 s done, "Thought for 1s · … tokens". | 2–6 (type + send)<br>7–11 (tools + stream) | The reply is staged in-page through the app's own `chats.onEvent` stream. Token counts are approximate. |
| `review-dark.mp4` | dark | 2880×1800 · 30 · 14.8 s | **Mind ▸ Review** (Notes ▸ Review tab).<br>0–0.9 s Notes with a note open.<br>~1–3.9 s card "What does git rebase --onto main feature-a feature-b do?" (8 due) → Show answer → Good.<br>~4–6.9 s broker fingerprint card (new card) → Easy.<br>~7–9.9 s "-z and %x00" card → Good.<br>~10–12.9 s force-with-lease card → Again.<br>~13–14.8 s "B-tree or LSM tree for a write-heavy log?" (4 due). | 1–5<br>9.5–13.5 | The card is a small band at the top (y≈100–330 of 900); the rest of the frame is empty dark, so crop or punch in. The max gap (~1 s) is a static hold on an answer. |
| `monitor-dark.mp4` | dark | 2880×1800 · 30 · 15.3 s | **Monitor ▸ System health** (Studio rail "Monitor").<br>0–6.9 s CPU / RAM / GPU sparklines moving live, Disk 762 GB / 1.1 TB, Sessions (Phase 116 · Test suite diet claude, Phase 111 · Voice agent codex, Phase 106, Phase 89 agy), Token spend.<br>~7 s rail flyout to Optimizer.<br>~8–9.9 s **Cleaner ▸ Workspace optimizer ▸ Memory**: CPU and RAM charts, 74% Memory Used, the process table sorted by memory.<br>~10 s click the CPU header; 11–15.3 s sorted by CPU, wheel-scrolled: node, Midnite Studio Helper (Renderer), claude, vite, Midnite Studio, codex. | 0.5–4.5 (live charts)<br>11–15 (process table) | Metrics are pushed in-page every 260 ms (chart steps, max gap 267 ms). The table shows ~3 rows at a time. The rail flyout flashes at ~7 s. Battery reads "No battery"; the disk label says "HDD". |

## Skipped (and why)

- **Media ▸ Video, Sprites and Games** (left out of creator-dark and gamer-dark): Video needs a Remotion project root and a `video.*` seed; there are no sprite or game projects under `.midnite/media/` to seed from, and an empty page is worse than no shot.
- **browser-dark**: the embedded browser is an Electron `<webview>`, which a plain Chromium page cannot host, so there is no real page to show.

## Re-running

See `README.md`. In short, start one Vite server with `cd packages/app && pnpm exec vite --port 5293 --strictPort`. Then run each clip from `packages/app`:

```
node_modules/.bin/playwright test --config ../../.midnite/media/video/projects/midnite-apps/capture/playwright.config.ts -g "<clip>"
```

Afterwards, run `./verify.sh <clip> && ./sheet.sh <clip>` from `capture/`. Every clip is re-runnable. The timestamp-dependent text (clock, "started 7m ago", note ages) is relative to the time of the run.

## Lyric facts (exact on-screen text)

- **Rail views:** Dashboard, Notes, Chats, Sessions, Knowledge, Explorer, Search, Monitor, Vault, Capture, Tests, Database, API Client, Tasks, Timeline, Actions, Reviews, History, Councils, Graphs, Media, Models.
- **Title bar:**
  - midnite-studio · main
  - "4 agents"
  - Wed, Oct 21
- **Agents:** Claude, Codex, Antigravity, OpenCode.
- **Tasks:**
  - "Source: Midnite Studio roadmap", "Plan with AI", "Describe what to build…", "Legend", "Graph view".
  - Nodes read "Phase N · …" with "#950", Open / Closed, and "2/5 themes".
  - Statuses: Todo, In progress, In review, Done.
  - Nodes: Phase 87 · Knowledge graph, Phase 89 · Knowledge variants, Phase 92 · Agentic Projects, Phase 94 · AI engineering, Phase 95 · Agentic improvements, Phase 105 · Terrain, Phase 106 · 2D Assets & sprites, Phase 107 · Games, Phase 108 · Maps, Phase 110 · Prompt & Context Lab, Phase 111 · Voice agent, Phase 113 · Midnite Apps split, Phase 114 · Settings by voice, Phase 115 · Privacy at rest, Phase 116 · Test suite diet, Phase 117 · Launcher auto-update.
  - Detail pane: Task / Agent tabs, "/midnite-create", "Running · Terminal · Stop".
- **Sessions:**
  - "SESSIONS 7", "MIDNITE-STUDIO", "started 7m ago", "Exited on its own".
  - Slugs: phase-116-test-suite-diet, phase-111-voice-agent, phase-106-2d-assets, phase-89-knowledge-variants.
- **Councils:**
  - "Release council", "Go / no-go before a tag is cut.", "What should the council answer?", Run.
  - Run states: "Waiting for the panel", "Still running: …", Synthesis, "Done".
  - Members: Architect, Skeptic, Security, Release manager.
- **Git graph:**
  - Columns: BRANCH / TAG, CI, GRAPH, COMMIT MESSAGE, DATE, SHA.
  - Filters: "All branches", "All authors", All / Humans / Agents.
  - Footer: "36 commits", "5 branches".
  - Badges: main, origin/main, v0.0.4.
  - Commit panel: "author Bilo Lwabona", "4 files +57 −9", "Refs #950".
- **Knowledge:**
  - "Search nodes…".
  - Style: Atlas / Constellation / Orbit / Clusters. Layout: Atlas / Clusters / Hierarchy / Spread.
  - "Relations 2,289 / 2,289 edges", with relation types calls, contains, dynamic_import, imports, imports_from, indirect_call, re_exports.
  - "Min weight", "Min confidence", "Communities 13 shown".
  - Nodes: shared/src/index.ts, schemas.ts, bridge(), useUiStore, useTerminalStore, GitOpResult, desktop/src/main/index.ts, app/src/app.tsx.
  - Panel title: "Knowledge · node".
- **Graphs:**
  - "GRAPHS 4": "Research & publish · 15 nodes", "Graph Engineering diamond · 12 nodes", "Harness bounded build · 8 nodes", "Risk router · 9 nodes".
  - Palette "NODES" with groups TRIGGERS, AGENTS & AI, CONTROL FLOW, ACTIONS.
  - Node kinds: Trigger, Agent, Ask AI, AI extract, Condition, Delay, Join, Gate, Router, Verify, Assert, Fail, HTTP.
  - Header: "Enabled", "Saved", "Save as template", "Run".
  - Demo pill: "Demo API · running on :4747 · stop".
  - Card types: AGENT, HTTP, TRANSFORM, VERIFY.
  - Node names: Start, Scope topic, Decompose, Company sources, Papers, Expert posts, Join (allSettled), Dedupe, Draft, Final check, Repair, Sign off, Publish.
  - "Run output running / completed", Nodes / Logs, Node / Status / Duration / Output / error, "Succeeded".
- **Models:**
  - Tabs: Installed / Discover / Cloud.
  - Search placeholders: "Search to pull — qwen3.5, llama3.2, nomic-embed-text…" and "Search ollama.com — qwen, llama, embedding…". Local / Cloud.
  - Detail fields: PARAMETERS, QUANTISATION, ARCHITECTURE, CONTEXT ("262,144 max", "65,536 effective"), "Fit for agents".
  - Detail tabs: Modelfile / Template / Parameters / Licence.
  - Buttons: "Launch with…", "Set as default", Pull.
- **Notes:**
  - Notes / Review tabs, "2/7 done", "Hide completed", "Capture a thought... (Enter to save)".
  - Tags: captured / planned / implemented.
  - Preview headings: "Shape", "Open".
- **Landing:**
  - "Wednesday", "LOCAL TIME".
  - Typewriter words seen: keen to roll, vibing, tidying, tinkering. Subtitles: "Agents hard at work", "All caught up — workspace ready".
  - Pills: "1 repos · 4 agents · 0 my PRs · 0 team PRs". "CPU / RAM / GPU", "14 cores".
  - "Getting around" / "The panels and the two ways to find anything", with Command Palette, Go to File…, Search Everywhere, Toggle Repositories, Toggle Terminal, Toggle Browser, Quick Access, Go to Timeline.
