# `public/video/` — the hero's clips

Two unrelated pairs live here, committed on different terms.

## `pilot-intro.{webm,mp4}` — committed

The framed, click-to-play player beside the hero copy (`sections/hero/pilot-video.tsx`).
A narrated introduction, so unlike the backdrop clip below it keeps its audio, needs a
visitor's click before anything downloads (`preload="none"`, no `autoplay`), and ships
with `pilot-intro-poster.jpg` as its poster frame. **These three files are committed** —
transcoded down from a much larger source edit, they are small enough (a few MB) to
carry in the repo the same way `img/app-showcase/*.png` is, unlike the pair below.

```sh
# WebM (VP9 + Opus) — the primary
ffmpeg -i raw.mp4 -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 \
  -c:a libopus -b:a 96k pilot-intro.webm

# MP4 (H.264 + AAC) — the Safari fallback
ffmpeg -i raw.mp4 -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart pilot-intro.mp4

# Poster — a still already close to the video's own opening frame
ffmpeg -i still.png -vf "scale=1280:-2" -q:v 4 pilot-intro-poster.jpg
```

No `-an`: this clip is the one place on the site audio is the point. Scaled to 1280
wide (from a 1920×1080 source) because a player embedded beside the hero copy, not
full-bleed, does not need the source resolution to read as sharp, and it is most of
the size saving — both encodes land around 2 MB against a 14 MB source cut.

## `hero.{webm,mp4}` — not committed

The muted, looping, autoplaying `<video>` behind the hero copy, rendered by
`sections/hero/hero-video.tsx`. **Neither file below is committed** — they are large
binaries, and this repo is not where a 30 MB screen recording belongs. The hero
handles their absence deliberately: it listens for the `<video>`'s `error` event and
falls back to the poster image, so a checkout with an empty `public/video/` looks
finished rather than broken.

Drop these two in to light it up:

| File | What it is |
|---|---|
| `hero.webm` | The clip, VP9 or AV1 in WebM. This is the one every current browser will actually load. |
| `hero.mp4` | The same clip, H.264 in MP4. Safari's fallback, and the reason both exist. |

The poster frame is **not** here — it is
[`../img/app-showcase/multi-screen-horizontal-dark.png`](../img/app-showcase), which is
also what shows when the video is missing. Keep the clip's first frame close to it
or the swap will flash.

### What the clip should show, and what it must not

Roughly 12–20 seconds, no audio (it plays muted and always will), looping cleanly —
the last frame should sit next to the first without a visible cut.

Content, in the order the product's own README puts it: the commit graph with
coloured lanes, a right-click on a commit, the worktree sidebar, the terminal
toggling in with `` Ctrl+` ``. Record at 2560×1440 or wider and export at the same
aspect ratio as the poster so the layout does not shift.

**Nothing real in the frame.** No private repository names, no branch names from
client work, no email addresses in commit rows, no tokens on screen in the terminal.
Record against a throwaway repo.

### Encoding

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
