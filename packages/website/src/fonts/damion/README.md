# Damion — the site's brand face

`Damion-latin.woff2` is **Damion Regular** by the Damion Project Authors
(originally Neapolitan), taken from
[`google/fonts/ofl/damion`](https://github.com/google/fonts/tree/main/ofl/damion)
at `Damion-Regular.ttf` and subset here to the Latin block, then compressed to
WOFF2 — 74 KB of TTF down to **27 KB**. It is licensed under the **SIL Open Font
Licence 1.1**; `OFL.txt` beside it is upstream's file, verbatim and unmodified,
which is what clause 2 of the licence requires us to ship alongside the font.
Its copyright line declares **no Reserved Font Name**, so keeping the family
name `Damion` carries no obligation either way — the subset keeps it, and
carries no outline changes.

It is here because the desktop app's own brand face, **Quick Kiss**, is licensed
for personal use only and cannot be served from a public origin. Damion is an
open-licence script in the same hand — see the twenty-candidate sheet at
[`docs/screenshots/website-wordmark/candidates.png`](../../../../../docs/screenshots/website-wordmark/candidates.png)
and the "brand face" section of [`docs/WEBSITE.md`](../../../../../docs/WEBSITE.md),
which records why it replaced Kaushan Script.
**Never copy `packages/app/src/fonts/quick-kiss.ttf` into this directory.**

The subset was produced with `fonttools`, over Google Fonts' own `latin` unicode
range and keeping every layout feature a script face needs for its joins:

```sh
pyftsubset Damion-Regular.ttf \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' \
  --layout-features='kern,liga,clig,calt,rlig,ccmp,locl,mark,mkmk' \
  --flavor=woff2 --output-file=Damion-latin.woff2
```

`src/styles/site.css` declares the `@font-face` against it with a relative
`url()`, so **Vite fingerprints and emits the file** — there is deliberately no
`public/` copy to keep in step, and no Google Fonts `<link>`: the site makes no
third-party request for it.

**Damion's ink runs further past its advance box than Kaushan Script's did**,
which is why `components/wordmark.tsx` pads the brand half by `0.15em` rather
than `0.08em`. Measured over "Midnite" on a 2048-upm em: the advance sum is
2.896em and the right-most ink reaches 3.000em — a **0.104em** overshoot, twice
Kaushan's 0.051em. A gradient clipped to *text* still only paints inside the
*element's* box, so the padding is headroom for the clip, not spacing.
