# Damion — Studio's brand face

`Damion-latin.woff2` and `OFL.txt` are byte-for-byte copies of
[`packages/website/src/fonts/damion/`](../../../../website/src/fonts/damion/), whose
README records the upstream source and the exact `pyftsubset` command. The
website is off the graph and shares no build with the app, so the app keeps its
own copy rather than importing across that line; re-subset there, then copy both
files here.

`OFL.txt` sits beside the font because clause 2 of the SIL Open Font Licence
requires it to ship with any copy. This face replaced Quick Kiss, which is
licensed for personal use only — see `docs/WEBSITE.md` § "The brand face".
