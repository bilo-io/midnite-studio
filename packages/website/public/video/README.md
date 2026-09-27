# `public/video/` — the hero's clips

Two unrelated pairs live here, both committed.

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

## `hero.{webm,mp4,poster.jpg}` — committed

The muted, looping, autoplaying `<video>` behind the hero copy, rendered by
`sections/hero/hero-video.tsx`. **These three files are committed.** They were not
always: for a while `public/video/` shipped with this pair absent on purpose (a
large screen recording did not belong in the repo yet), and every visitor got the
poster-image fallback instead of a clip — which is the bug this pair fixes. The
`<video>`'s `error` listener stays regardless, as the permanent degrade path for
whenever the clip is genuinely unavailable (a bad deploy, a host serving the wrong
content-type), not as a workaround for the asset's past absence.

| File | What it is |
|---|---|
| `hero.webm` | The clip, VP9 in WebM. This is the one every current browser will actually load. |
| `hero.mp4` | The same clip, H.264 in MP4. Safari's fallback, and the reason both exist. |
| `hero-poster.jpg` | The video's own first frame, used as the `<video poster>` so playback starting never flashes. (The `<img>` the component falls back to on a hard `error` is a *different*, unrelated image — the app-showcase screenshot beside it in `img/app-showcase/` — kept distinct because that fallback has to read as the product, not as this marketing clip.) |

### Source

`v10-you-decide.mp4` from the `001-golive-promo` marketing project
(`midnite-videos/projects/midnite/marketing/001-golive-promo/output/`) — 1920×1080,
~88 s, 31 MB with an AAC audio track. Re-encoded here at 1280×720 with the audio
dropped (the hero always plays muted; a muted autoplaying video that still carries
an audio track is one some browsers refuse to start at all).

### Encoding

```sh
# WebM (VP9) — the primary
ffmpeg -i v10-you-decide.mp4 -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 0 -crf 36 \
  -row-mt 1 -deadline good -cpu-used 2 -an hero.webm

# MP4 (H.264) — the Safari fallback
ffmpeg -i v10-you-decide.mp4 -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 28 \
  -pix_fmt yuv420p -an -movflags +faststart hero.mp4

# Poster — the video's own opening frame
ffmpeg -i hero.mp4 -ss 0.1 -vf "scale=1280:-2" -frames:v 1 -q:v 4 hero-poster.jpg
```

`-an` strips the audio track. `crf 36`/`crf 28` (looser than `pilot-intro`'s, since
this clip is roughly 4× the duration and needs to stay a few MB regardless) land the
pair at ~4 MB (`hero.mp4`) and ~5 MB (`hero.webm`) against the 31 MB source — text in
the clip's title cards stays legible at that setting, checked by eye against source
stills before committing.

### What a future re-record should show, and what it must not

Should the clip ever get re-recorded from the app itself rather than sourced from a
marketing edit: roughly 12–20 seconds, no audio, looping cleanly — the last frame
sitting next to the first without a visible cut. Content, in the order the product's
own README puts it: the commit graph with coloured lanes, a right-click on a commit,
the worktree sidebar, the terminal toggling in with `` Ctrl+` ``. Record at
2560×1440 or wider. **Nothing real in the frame** — no private repository names, no
branch names from client work, no email addresses in commit rows, no tokens on
screen in the terminal. Record against a throwaway repo.
