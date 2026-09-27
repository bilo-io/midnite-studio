# `public/video/` — the hero's clips

Two clips, both committed, both **MP4 (H.264) only**.

## Why no WebM

Both VP9 WebMs this directory used to ship failed in Chrome on macOS with
`PIPELINE_ERROR_DECODE: video decode error!`, while `ffmpeg` decoded them cleanly.
A decode error does **not** make a `<video>` fall through to its next `<source>` —
only an unsupported type or a network error does — so a WebM listed first took the
working MP4 down with it, and neither player on the page played. H.264 plays in
every browser the site targets, so each clip ships as one MP4.

## `pilot-intro.mp4` + `pilot-intro-poster.jpg`

The framed, click-to-play player beside the hero copy (`sections/hero/pilot-video.tsx`).
It carries the launch promo **with its audio**, so it needs a visitor's click before
anything downloads (`preload="none"`, no `autoplay`).

Source: `~/Dev/midnite/midnite-videos/projects/midnite/marketing/001-golive-promo/output/v10-you-decide.mp4`
(31 MB, 1080p, 88 s).

```sh
SRC=…/001-golive-promo/output/v10-you-decide.mp4
ffmpeg -i "$SRC" -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart pilot-intro.mp4          # ~6.6 MB
ffmpeg -ss 3 -i "$SRC" -frames:v 1 -vf "scale=1280:-2" -q:v 4 pilot-intro-poster.jpg
```

## `hero.mp4` + `hero-poster.jpg`

The muted, looping, autoplaying backdrop below the fold (`sections/hero/hero-video.tsx`),
the same source with the audio dropped. Its `error` listener stays as the permanent
degrade path to a still screenshot if the clip is ever unavailable.

```sh
ffmpeg -i "$SRC" -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p \
  -an -movflags +faststart hero.mp4                                  # ~3.9 MB
ffmpeg -ss 0.1 -i "$SRC" -frames:v 1 -vf "scale=1280:-2" -q:v 4 hero-poster.jpg
```

`+faststart` moves the `moov` atom to the front so playback can begin before the
whole file has downloaded.
