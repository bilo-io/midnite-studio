# Testimonial images

Avatars and message screenshots for the `testimonials` section. **This folder is
empty on purpose** — see below.

## Adding a quote

One file to edit: **`packages/website/src/sections/testimonials/testimonials.json`**.
It ships as `[]`, and while it is empty the section renders three dashed
"Add a testimonial" cards with these same instructions printed on the page. The
moment the array has one valid entry the section becomes a card carousel. No
other file changes.

An entry:

```json
{
  "quote": "…",
  "name": "…",
  "role": "…",
  "avatar": "img/testimonials/ana.png",
  "source": "slack",
  "screenshot": "img/testimonials/ana-slack.png"
}
```

| field | required | notes |
|---|---|---|
| `quote` | yes | **Verbatim.** Do not tidy the grammar, do not trim it into a pull-quote, do not stitch two sentences from different messages together. If it needs cutting, cut with `…` and nothing else. |
| `name` | yes | The real name, as they write it. No "A. Developer", no "Anonymous" — a quote nobody will put their name to is a quote the site does not carry. |
| `role` | yes | Their role, or where they said it from. |
| `avatar` | no | A square image in this folder. Rendered at 36 px, so 72–144 px square is plenty. |
| `source` | no | `slack`, `github` or `email`. Decides which glyph the card shows. Omit it rather than guessing. |
| `screenshot` | no | An image in this folder, rendered inside a tilted window frame with the source glyph. This is what makes a quote read as evidence rather than as copy. |

An entry missing `quote`, `name` or `role` is **skipped silently** — the parser
drops it rather than throwing, so a typo costs one card and never the build. If
you add an entry and it does not appear, that is why.

### Paths

Write them **relative, with no leading slash** — `img/testimonials/ana.png`, not
`/img/testimonials/ana.png`. The deployed site is served under a path prefix
(`/midnite-apps/midnite-studio/`) and the section resolves these through
`assetHref`, so a leading slash works perfectly in `vite dev` and 404s in
production.

## Adding a Slack screenshot

1. **Ask the person first**, in the thread, and keep their answer. A screenshot
   of a private channel is not ours to publish because it is complimentary.
2. Crop to the message and its author line — nothing above, nothing below. No
   channel name, no member list, no sidebar, no other people's messages.
3. Redact anything that is not the quote: other names, avatars of uninvolved
   people, repo names that are not public, URLs, any customer's name.
4. Export at **2× the rendered width** (the frame is at most ~448 px wide, so
   ~900 px) as PNG. Slack's own dark theme sits better on the site than its
   light one, but either is fine — the frame is what makes it read as a
   screenshot, not the theme.
5. Drop it here, point `screenshot` at it, and set `source` to `"slack"` so the
   frame's title bar wears the right glyph.
6. Put the same words in `quote`. The screenshot is corroboration, not the
   content — it is an `<img>`, so it is invisible to a screen reader, to
   find-in-page and to anyone on a slow connection.

## What must never appear here

Fabricated screenshots, mocked-up chat windows, "representative" quotes,
composites of several messages, or a real message attributed to a made-up
person. If the section is empty, the honest thing is that it looks empty — the
placeholder cards are designed to be conspicuous for exactly that reason.
