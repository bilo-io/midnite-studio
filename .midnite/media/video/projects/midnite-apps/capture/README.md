# capture/ — footage for the Midnite Apps promo

Screen-recordings of the real Midnite Studio renderer (`packages/app`) for the Remotion promo. Nothing here
is a test suite, and nothing here is tracked. Website and launcher captures (`web.mjs`, `launcher.mjs`,
`lib.mjs`, `SHOTS-web-launcher.md`, `web-*` and `launcher-*` clips) belong to a separate pass. This README
covers the **Studio** pass: `playwright.config.ts`, `lib.ts`, `fixtures/`, `shots/*.cap.ts`, and
`SHOTS-studio.md`.

## How it works

- The renderer runs in headless Chromium against the **e2e mock bridge**
  (`packages/app/test-support/mock-bridge.ts`). The installed app, its broker and
  `~/Library/Application Support/Midnite*` are never touched.
- Each `shots/<clip>.cap.ts` sets up the following, then records:
  - It seeds realistic data. Fixtures live in `fixtures/`: the roadmap board, agent runs and pty output, git history laid out by git-engine's own `layoutGraph`, and a sample of this repo's graphify graph.
  - The repos panel is closed (`reposOpen:false`) and the terminal is shut.
  - The page is made to think it has focus and is visible.
  - It waits for `document.fonts.ready`.
- `lib.ts`'s `Recorder` captures a CDP screencast at 2880×1800 (DSF 2, JPEG q92) into `frames/<clip>/`.
  - It then runs an ffmpeg concat with real frame durations, producing constant 30 fps H.264 (`-crf 16 -preset slow -pix_fmt yuv420p -movflags +faststart`) at `../input/clips/<clip>.mp4`.
  - The cursor is a DOM overlay with eased glides and a click ripple.
  - `frames/` is scratch and can be deleted after a run.

## Re-run

```sh
# 1. one Vite dev server (leave it running while you capture)
cd packages/app && pnpm exec vite --port 5293 --strictPort &

# 2. one clip at a time, from packages/app
node_modules/.bin/playwright test \
  --config ../../.midnite/media/video/projects/midnite-apps/capture/playwright.config.ts \
  -g "workflows-dark"

# 3. check it: ffprobe + start/mid/end stills, and a 6-frame contact sheet, into stills/
cd ../../.midnite/media/video/projects/midnite-apps/capture
./verify.sh workflows-dark && ./sheet.sh workflows-dark

# 4. stop Vite when done:  lsof -nP -i :5293  → kill <pid>
```

Clip names to pass to `-g`:

- `graph-partial-dark`
- `graph-agents-dark`
- `sessions-dark`
- `councils-dark`
- `gitgraph-light`
- `knowledge-dark`
- `workflows-dark`
- `models-light`
- `notes-dark`
- `landing-light`
- `creator-dark`
- `gamer-dark`
- `money-dark`
- `media-dark`
- `forge-light`
- `chats-dark`
- `review-dark`
- `monitor-dark`

`capture/node_modules/@playwright/test` is a symlink to the repo's own Playwright (1.64.0), so the
spec imports resolve. Never run the repo gate (`moon run :typecheck :lint :test`), vitest, tsc or eslint for
this. It is not needed, and on this laptop it exhausts RAM.

### Per-shot launch flags

- **`graph.cap.ts` and `sessions.cap.ts`** pass `--disable-webgl --disable-webgl2`. At DSF 2, xterm's WebGL renderer draws garbage in headless; with WebGL off it falls back to DOM rendering.
- **`knowledge.cap.ts`** passes `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`. Sigma on SwiftShader drops the screencast to about 8 fps.
- **`gamer.cap.ts`** passes the same GPU flags for maplibre and three.js. `creator.cap.ts` and `gamer.cap.ts` seed the Media tabs from the real `.midnite/media/` projects through `fixtures/media-seed.ts`, which also serves their bytes and proxies map tiles (cached in `frames/_tiles`).

### Knowledge sample

`fixtures/data/knowledge-sample.json` holds 519 nodes and 2,289 links, taken from `graphify-out/graph.json`:

- **Communities sampled (13):** 0, 44, 14, 192, 5, 148, 13, 26, 9, 169, 27, 426, 151.
- **Nodes kept:** the 40 highest-degree nodes in each community, and only the links between them. Nodes with no link are dropped.
- **Positions:** from `node fixtures/layout-knowledge.mjs` (offline Fruchterman–Reingold).

The one-off Python sampler was not kept. To rebuild, redo those steps against a newer `graph.json`, then re-run the layout script.
