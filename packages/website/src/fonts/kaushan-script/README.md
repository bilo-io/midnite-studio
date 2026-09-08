# Kaushan Script — the site's brand face

`KaushanScript-latin.woff2` is **Kaushan Script Regular** by Pablo Impallari and
Igino Marini (Impallari Type), taken from
[`google/fonts/ofl/kaushanscript`](https://github.com/google/fonts/tree/main/ofl/kaushanscript)
at `KaushanScript-Regular.ttf` and subset here to the Latin block, then
compressed to WOFF2 — 210 KB of TTF down to **34 KB**. It is licensed under the
**SIL Open Font Licence 1.1**; `OFL.txt` beside it is upstream's file, verbatim
and unmodified, which is what clause 2 of the licence requires us to ship
alongside the font. `Kaushan Script` is a Reserved Font Name, so the subset
keeps the family name rather than renaming it, and carries no outline changes.

It is here because the desktop app's own brand face, **Quick Kiss**, is licensed
for personal use only and cannot be served from a public origin. Kaushan Script
is the closest open-licence recut of it — chosen from twenty rendered candidates,
see [`docs/screenshots/website-wordmark/candidates.png`](../../../../../docs/screenshots/website-wordmark/candidates.png)
and the "brand face" section of [`docs/WEBSITE.md`](../../../../../docs/WEBSITE.md).
**Never copy `packages/app/src/fonts/quick-kiss.ttf` into this directory.**

The subset was produced with `fonttools`, over Google Fonts' own `latin` unicode
range and keeping every layout feature a script face needs for its joins:

```sh
pyftsubset KaushanScript-Regular.ttf \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' \
  --layout-features='kern,liga,clig,calt,rlig,ccmp,locl,mark,mkmk' \
  --flavor=woff2 --output-file=KaushanScript-latin.woff2
```

`src/styles/site.css` declares the `@font-face` against it with a relative
`url()`, so **Vite fingerprints and emits the file** — there is deliberately no
`public/` copy to keep in step, and no Google Fonts `<link>`: the site makes no
third-party request for it.
