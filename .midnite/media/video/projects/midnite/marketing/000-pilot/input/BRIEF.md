# Brief — Pilot

Not a client brief: this project exists so the repo is verifiably working end to
end — assets sync, a composition renders, `scripts/render.mjs` files the result
and appends to the changelog.

A one-minute card scored to an arrangement of
`assets/audio/sfx/soulprodmusic-own-it-logo-360211.mp3`: the crescent lands
alone, the name unfurls out of it on the first hit and "Studio" types itself, the
agent CLIs midnite drives sweep in in brand colour — and then the mark flies up
to the head of the caption line and stays there, one slide per thing midnite
does, each claim typing itself out over the recording of midnite doing it. The
bass is irregular under the first slide and settles on the second; a build-up
runs the length of the optimiser slide and drops onto the AI companion; the
closing lockup comes back down to the middle with the brand ramp glowing off its
tagline.

It uses the shared layer (`MidniteWordmark`, `AgentLogo`, `AppWindow`, `Sfx`,
`ShimmerLine`, `Typewriter`, `brand.ts`) and nothing project-specific but its
beat grid, its copy and which frames of which recording each slide plays, so it
doubles as the worked example to copy from — in particular for **scoring**: see
`scripts/make-pilot-soundtrack.mjs` for how a 14-second sting is arranged into a
60-second track, and `beats.ts` for how that arrangement's bars become the edit's
frame numbers. The two are one thing; neither can move without the other.

Replace it, or leave it alone and start the first real video at `001-`.
