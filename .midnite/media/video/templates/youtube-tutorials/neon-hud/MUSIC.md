# Music brief — neon HUD

The reference's soundtrack belongs to its maker and is **not** in this repo.
This brief describes the track so you can find or generate a substitute,
either from a royalty-free library or with **Media ▸ Audio**.

## Measured from the reference

| | |
|---|---|
| Tempo | **~123 BPM**, steady through all nine acts |
| Key | **F minor** most likely (chroma correlation 0.42; F major 0.34) |
| Loudness | **−11.8 LUFS** integrated, loudness range **2.8 LU**: loud, compressed and flat |
| Spectrum | weight sits in 120 Hz–2 kHz (62% of energy). Light sub, airy top up to ~20 kHz |
| Structure | a sustained high synth (~11.5 kHz shimmer) through the hook, short dropouts at act changes (≈ 87s, 121s, 238s), transient whooshes on picture changes |

## What to ask for

> Dark, driving electronic underscore for a tech explainer. 120–125 BPM,
> F minor. Pulsing synth bass, tight four-on-the-floor or broken-beat drums,
> glassy arpeggios, a high shimmering pad. Cinematic but not epic, with no
> vocals and no big melodic hook, so a voice-over can sit on top. Evolves in
> 16-bar sections with short breaks between them. Loop-friendly.

Style tags for Media ▸ Audio: `dark synthwave`, `cyberpunk`, `tech
underscore`, `driving`, `minimal`, `instrumental`, `123 bpm`, `F minor`.

## Already in `assets/audio/` (measured with librosa)

| Track | BPM | Key | Fit |
|---|---|---|---|
| `music/soulprodmusic-gym-energy-514739.mp3` | 123 | G min | **the template's placeholder**: exact tempo, minor key |
| `music/soulprodmusic-more-energy-579049.mp3` | 123 | B min | same tempo, 68s |
| `music/soulprodmusic-cosmic-drift-chill-cosmic-beat-324058.mp3` | 129 | A♯ min | darker and softer, good under heavy narration |
| `curated/music/Threshold_of_Reason.mp3` | 144 | F min | right key, faster, more cinematic |

## Mixing

- Bed at 0.55 with no voice. Under a voice-over, 0.16 (`CONTENT.audio`). The
  reference keeps the bed audible the whole time, so do not duck it to
  nothing.
- A whoosh on each scene change: `SfxSound kind="light"` at 0.18, peaking on
  the cut. A bigger one (`"big"`) on chapter cards, and `"impact"` on the
  outro.
- Master to around −14 LUFS for YouTube. The reference's −11.8 gets turned
  down by YouTube anyway.
