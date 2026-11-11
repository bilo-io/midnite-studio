# Synth Surf showreel — editorial script

Bed: Unstoppable Driver (Alexandr Zhelanov, CC BY — credited on the end card), 163.9 BPM, beat = 11.0 frames,
bar = 1.464 s. The same song the run was played to, so the game's own events land on the bed.

- Film starts at 85.15 s (bar 58), 16 beats before the breakdown.
- `synthsurf-run.clock.json` (sampled from the game's clock during capture) fits
  song = 4.652 + 1.00008 × clip, max residual 0.28 s. Every run shot sits at clip = song − 4.652.
- The run was captured with `?debug` for the clock readout; its timeline panel fills the bottom fifth,
  so run shots scale ≥1.3× from the top edge (`origin: "50% 0%"`) to crop it out.

| Beats | Song s | Shot | Tag |
|---|---|---|---|
| 0–16 | 85.1–91.0 | Title slam over the run (synced) | — |
| 16–24 | 91.0–93.9 | Breakdown: title menu | — |
| 24–32 | 93.9–96.9 | Your Music screen, song imported | DROP IN YOUR OWN SONG |
| 32–152 | 96.9–140.8 | The drop: the run in sync, a cut every 8 beats with alternating push/pull zooms and beat pulses | THE DROP · YOUR SONG → YOUR LEVEL · UNSTOPPABLE DRIVER · ENDLESS NEON WAVE FIELD |
| 152–168 | 140.8–146.6 | End card over the run, music credit | — |
