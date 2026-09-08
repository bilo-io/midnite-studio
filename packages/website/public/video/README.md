# `public/video/` — the hero's product clip

The hero renders a muted, looping, autoplaying `<video>` behind its copy. **Neither
file below is committed** — they are large binaries, and this repo is not where a
30 MB screen recording belongs. The hero handles their absence deliberately: it
listens for the `<video>`'s `error` event and falls back to the poster image, so a
checkout with an empty `public/video/` looks finished rather than broken.

Drop these two in to light it up:

| File | What it is |
|---|---|
| `hero.webm` | The clip, VP9 or AV1 in WebM. This is the one every current browser will actually load. |
| `hero.mp4` | The same clip, H.264 in MP4. Safari's fallback, and the reason both exist. |

The poster frame is **not** here — it is
[`../img/app-showcase/multi-screen-horizontal-dark.png`](../img/app-showcase), which is
also what shows when the video is missing. Keep the clip's first frame close to it
or the swap will flash.

## What the clip should show, and what it must not

Roughly 12–20 seconds, no audio (it plays muted and always will), looping cleanly —
the last frame should sit next to the first without a visible cut.

Content, in the order the product's own README puts it: the commit graph with
coloured lanes, a right-click on a commit, the worktree sidebar, the terminal
toggling in with `` Ctrl+` ``. Record at 2560×1440 or wider and export at the same
aspect ratio as the poster so the layout does not shift.

**Nothing real in the frame.** No private repository names, no branch names from
client work, no email addresses in commit rows, no tokens on screen in the terminal.
Record against a throwaway repo.

## Encoding

```sh
# WebM (VP9) — the primary
ffmpeg -i raw.mov -c:v libvpx-vp9 -b:v 0 -crf 34 -an -row-mt 1 hero.webm

# MP4 (H.264) — the Safari fallback
ffmpeg -i raw.mov -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -an -movflags +faststart hero.mp4
```

`-an` strips the audio track; a muted autoplaying video with an audio track is
still a video some browsers will refuse to start. Aim under ~4 MB each — the
poster is what a visitor sees while this downloads, and a slow hero video is
worse than none.
