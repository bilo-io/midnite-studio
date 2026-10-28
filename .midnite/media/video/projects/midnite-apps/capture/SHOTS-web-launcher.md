# Web + Launcher footage (all 2880x1800, 30 fps H.264 crf16, 16:10)

Clips in `../input/clips/`. Stills in `stills/` (`_m-<clip>.png` = start/mid/end montage).

| clip | theme | dur | on screen | best 4 s window (start s) | caveats |
|---|---|---|---|---|---|
| web-hero-dark.mp4 | dark | 10.9 s | 0-0.7 blank dark page (loading); 0.7-3 hero fades in, "Midnite Apps" wordmark, typewriter headline cycles ("for your media." / "for your agents."), launcher mock with app icons; 4-6 cursor glides over the mock; 6-10 slow eased scroll into the Suite section | 1.5 (hero entrance + typewriter) or 6.5 (scroll) | first ~0.7 s is an empty dark frame (page loading, by design: records the load) |
| web-scroll-dark.mp4 | dark | 12.3 s | hero -> Suite ("An app for each part of the day") -> Launcher ("One place to get them all", 3 cards) -> Studio -> ends on Early access ("Ask for a build.") with email form; nav highlights current section | 0.5 (hero->suite) / 7.5 (end on CTA form) | scroll is stepwise (eased moves with short holds) |
| web-access-dark.mp4 | dark | 10.2 s | 0-1.5 hero, cursor glides to nav "Get Access", hover glow; ~2 s click ripple; page scrolls to Early access section; cursor moves to email field, click, types "you@studio.dev"; form fields (project, agent chips) expand | 1.5 (cursor+hover+click) / 5.5 (form + typing) | NOTHING submitted; the "Request" button composes a GitHub issue, never clicked |
| launcher-grid-light.mp4 | light | 16.2 s | Midnite Apps launcher, all installed; cursor glides across tiles Studio, Agents, Coder, Gamer, Creator, Media, Money, Mind, Browser with coloured hover glow; then scrolls to Science, Accountant, Vanguard (Coming soon) | 0.5 (hover glow on Coder) / 9 (scroll + Vanguard glow) | a bit over 14 s; trim freely |
| launcher-grid-dark.mp4 | dark | 20.3 s | same as above, dark | 0.5 / 12 | long; trim freely |
| launcher-detail-light.mp4 | light | 13.8 s | `?studio=missing`: tiles show "Available to install"; click Studio tile -> side sheet (vision, features, "Built on the Midnite frame"); click Install -> "Downloading 80%" progress bar -> Installed -> Open button; sheet scrolls | 3 (Install click + progress) / 9 (Open appears) | |
| launcher-table-light.mp4 | light | 18.2 s | `?studio=update`: "Midnite Studio 0.4.1 is available." banner with Update button, "Update available" pills (v0.3.2); click Table -> rows with features/status/version; scroll; back to Grid | 3 (switch to table) / 6 (table scroll) | Update button not clicked |
| launcher-jump-light.mp4 | light | 15.2 s | click tile -> detail sheet (~1.3 s) -> Esc -> next: Studio, Agents, Coder, Creator, Gamer, Mind; ripple on every click | any 4 s, e.g. 3 / 8 | sheet slide animation visible; cursor-driven |
| launcher-jump-dark.mp4 | dark | 15.3 s | same, dark | 3 / 8 | |

## Re-run
```
cd "$(git rev-parse --show-toplevel)"
(cd packages/website && node_modules/.bin/vite --port 5291 --strictPort &)
(cd apps/launcher && node_modules/.bin/vite --port 5292 --strictPort &)
node .midnite/media/video/projects/midnite-apps/capture/web.mjs [hero|scroll|access]
node .midnite/media/video/projects/midnite-apps/capture/launcher.mjs [grid-light|grid-dark|detail-light|table-light|jump-light|jump-dark]
```
Then kill the two vite servers. `lib.mjs` has the CDP screencast + ffmpeg builder + fake cursor. Theme: website uses localStorage `midnite-studio.website.theme` + colorScheme; launcher uses `midnite-launcher.theme` (`light|dark`), layout key `midnite-launcher.layout`; mock states via `?studio=installed|update|missing`.

## Facts for the lyricist
- Website: "Midnite Apps" wordmark (script "Midnite" + "Apps"); eyebrow "MIDNITE APPS · MACOS ON APPLE SILICON"; headline "Midnite Apps for your media." / typewriter cycles words ("for your agents."). Copy: "One launcher for 13 desktop apps that share one frame: a terminal that survives restarts, a docked browser, the companion and your own agents come with every one of them. Install the ones you want, open them from one place, and let the launcher keep them current." CTAs: "Get Access" (primary, nav + hero) and "Explore the apps". Footnote: "No analytics and no telemetry." Sections: Suite ("An app for each part of the day"), Launcher ("One place to get them all": Install the launcher / Pick your apps / Updates, verified), The frame, Agents, Studio, FAQ, Early access ("Ask for a build." email + "Request"). Hero mock icons: Studio, Agents, Coder, Gamer, Creator, Media, Money, Mind, Browser; utility apps Cleaner, Vault, Capture, Monitor.
- Launcher: title "Midnite Apps"; footer says "19 apps" (15 in the "Midnite apps" section incl. Coming-soon Science, Accountant, Vanguard, Startup, Simulator, Health; the rest utility). Taglines: Studio "Every midnite app in one window"; Agents "Chats, councils, graphs and local models"; Coder "Sessions, tasks, forge, APIs and databases"; Gamer "Maps, terrains, models, sprites and games"; Creator "Docs, images, audio and video"; Media "Your own media server - films, shows, music and photos"; Money "Stocks, investments, crypto and trading"; Mind "Notes and spaced review"; Browser "A browser that agents can drive". Buttons: Install / Open / Update / Coming soon. Note website says 13 apps, launcher says 19 total.
- Port 5291/5292 servers and browsers were killed. Other agents' clips (graph-*) in the folder are not mine.
