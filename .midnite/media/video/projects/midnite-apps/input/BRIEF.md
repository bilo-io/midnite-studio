# Brief — Midnite Apps

The request, verbatim (2026-10-21):

> Create a video using the song of the first one and the template of the v11-rap-v3-iron-aria. It
> should also take screenshots and recordings / clips from the website and parts of the app to show
> the actual features as short video clips... including the project graph with partially completed
> nodes and some in action (i.e. with agents running), as well as show the launcher and jump from
> app to app in it, showing a few different features. The video should start off the same length as
> the v11-rap-v3-iron-aria... Also add subtitles like in that song, which rhyme... also use the same
> "Onyx" voice and similar style rap with the lyrical ability of Eminem

Settled in conversation:

- **"The song of the first one"** is midnite video 1's own song: the gym-energy bed
  (`assets/audio/music/soulprodmusic-gym-energy-514739.mp3`, 124 BPM), the one v1-first-cut
  played. It is re-arranged to v11's length by `scripts/make-midnite-apps-soundtrack.mjs`.
- **"The template of v11"** is video 1's v11 picture: the golive-promo template with the neon-HUD
  kit in midnite's skin — two stages and their wipes, chapter cards, the statement, the breath,
  the typed slugs, the one travelling beat-driven mark, and the lockup the film loops on.
- **Length:** v11 is 2:07.70 (3831 frames). This film is 264 beats of the bed = 3832 frames = 2:07.74.
- **Voice:** Kokoro `am_onyx`, as video 1. **Subtitles:** the `say` line under every slot, as
  video 1, captioning the rap word for word.
- **Footage:** recorded fresh, in a browser against mock bridges (never the user's live app): the
  website (`packages/website`), the launcher (`apps/launcher`), and Studio's views
  (`packages/app`). The scripts are in `../capture/`, the clips in `clips/`.
