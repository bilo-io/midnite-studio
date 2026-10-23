# The public website

`packages/website` is the marketing site for **Midnite Apps**, the launcher, and
the suite of apps it installs: a static Vite + React build served
from **GitHub Pages on the public [`bilo-io/midnite-apps`](https://github.com/bilo-io/midnite-apps)
repo**, at `https://bilo-io.github.io/midnite-apps/midnite-studio/`.

It lives in this repo and is served from that one for the same reason the
installers and the issue tracker do: this repo is built for contributors, not
users, so nothing a visitor needs is served from it. `midnite-apps` is the shared public surface for
every midnite app, which is why the site is published into a per-app directory
(`midnite-studio/`) rather than at the branch root — a sibling app can take the
directory beside it without either of them moving.

## Running it

```sh
moon run website:dev        # http://localhost:5174
moon run website:build      # → packages/website/dist
moon run website:preview     # serves dist, so relative paths behave like Pages
```

It joins the repo-wide gate like every other package:

```sh
moon run :typecheck :lint :test
```

### `base`, and the one way to get it wrong

The deployed site carries a path prefix and a local one does not, so
`vite.config.ts` reads it from `WEBSITE_BASE` (defaulting to `/`). Everything
that builds a URL — page links, anchors, `public/` assets — goes through
`import.meta.env.BASE_URL` via the helpers in `src/routes.ts`. **Never hard-code
a leading `/` in an href.** A path that is right locally and wrong on Pages
renders a page that looks completely fine and 404s every asset on it.

`WEBSITE_BASE` is in the `website:build` task's `inputs`, not merely its
environment: without that, a Pages build following a local build would be a moon
cache hit and would ship with the wrong prefix.

### `WEBSITE_ORIGIN`, its sibling

`base` covers every URL the *browser* resolves. It cannot help **an absolute URL
read outside the page**, such as the social-card image in the meta tags: there is
no page for it to be relative to. So the site's own public root is also spelled out absolutely, in
[`src/site-origin.ts`](../packages/website/src/site-origin.ts).

`WEBSITE_ORIGIN` overrides it; unset, it is the live Vercel deployment
(`https://midnite-studio-website.vercel.app`). It is the site **root**, not the
bare host — on Vercel those are the same thing, but the Pages target serves the
site under `/midnite-apps/midnite-studio/`, so there the prefix has to be part of
the value or the absolute URL 404s. Set it together with `WEBSITE_BASE` or not
at all, and it is in the `website:build` `inputs` for the same cache reason.

The default is read by `site-origin.ts` rather than written into the two `define`
blocks that inline the constant: a default written twice is one that will
eventually disagree with itself, so the configs inline only the override — the
empty string when it is unset.

That default, and the command built from it, come from
[`packages/shared/src/install-command.ts`](../packages/shared/src/install-command.ts)
(`MIDNITE_SITE_ORIGIN`, `installerUrl`, `installCommand`). The app's "Update
Midnite Studio" action runs the same command outside the Midnite Studio checkout,
so both sides import it from there instead of each spelling the URL. The site
takes that one file by a source alias (`vite.config.ts`, `vitest.config.ts`,
`tsconfig.json`), not through the package barrel, so the bundle picks up no zod.

## Access is gated: no repo, release or installer links

**The site links to nothing a visitor could use to fetch a build without asking.** Every
download or install call to action routes to the early-access section; `/download/` is now an
"how access works" page with no command, no `.dmg` and no release list. The footer, FAQ and
download page carry no link to, or mention of, `bilo-io/midnite-apps` (guarded by tests in
`footer.test.tsx`, `faq.test.ts` and `download-page.test.tsx`). The version feed is gone too:
`useLatestVersion` makes no request and reports `unreleased`, so the apps pills read "Pre-release".
The one deliberate exception is the early-access form's prefilled-issue URL, which is the gate
itself; its preview no longer prints the repo name.

The launcher's `install.sh` is no longer served from the site. The one script the site still hosts,
unlinked, is Studio's `public/install-studio.sh`, because the app's "Update Midnite Studio" action
curls it (`MIDNITE_INSTALL_COMMAND`, from `shared`'s `install-command.ts`). It is a verbatim copy,
checked rather than trusted:
[`scripts/website-sync-install.mjs`](../scripts/website-sync-install.mjs) fetches upstream and
either `--check`s (exit 1 with a unified diff) or `--write`s. `moon run website:sync-install` is
`--check`; `moon run website:sync-install -- --write` re-syncs. It is a moon task and **not a
vitest**, deliberately: a test that reaches the network fails on a plane and turns an upstream
outage into a red repo-wide gate. CI runs it post-merge in `website.yml`'s build job, since upstream
can change with nothing merged here. Retiring it for good means moving the in-app update off the
site first.

## The brand face — Damion, an open stand-in for the app's

The site sets "Midnite" in **Damion** (OFL), self-hosted from
[`packages/website/src/fonts/damion/`](../packages/website/src/fonts/damion/).
The desktop app sets the same word in **Quick Kiss** and keeps it. **The two
faces are deliberately near-identical, not identical**, and that is the whole
design: the app's own face cannot legally be served from a public origin, so the
public surface wears the closest open re-cut of it instead.

### Why the app's face cannot ship here

Quick Kiss (`packages/app/src/fonts/quick-kiss.ttf`, exposed there as
`--font-brand`; see `packages/app/src/components/brand.tsx`) is licensed for
personal use only. The bundled file's own name table says so:

| Name ID | Value |
|---|---|
| 1 (family) | `Quick Kiss Personal Use` |
| 0 (copyright) | `Copyright (c) 2018 by Billy Argel. All rights reserved.` |
| 7 (trademark) | `Quick Kiss Personal Use is a trademark of Billy Argel.` |
| 13/14 (licence) | `www.billyargel.com` |

The upstream listing is explicit: *"This font is partial and free for personal
use. Commercial licenses and complete set available @ billyargel.com"*. The app
is private, which is arguably personal use; **the website is public marketing for
a product**, which is not, and a webfont is a separate licence tier for this
foundry besides. Serving the TTF from a public origin would also hand anyone the
file itself.

**So `quick-kiss.ttf` must never be copied into `packages/website`** — not into
`src/fonts/`, not into `public/`, not as a `@font-face` reaching across the
package boundary. Nothing about the substitution below relaxes that.

### How Damion was chosen

**By preference, over the ranking — and the ranking is still on file.** Twenty
SIL OFL / Apache-2.0 script faces were originally fetched from the
[`google/fonts`](https://github.com/google/fonts) repo and rendered against
Quick Kiss at the three sizes the site actually uses — the nav's 20px, the
hero's 64px and the footer's ~140px — then ranked on stroke character, slant,
connectedness and x-height. The sheet is committed as the evidence:

**[`docs/screenshots/website-wordmark/candidates.png`](screenshots/website-wordmark/candidates.png)**

That exercise put **Kaushan Script** first (closest to Quick Kiss on every axis
at once), **Norican** second, **Yellowtail** third and **Damion** fourth —
"close construction, too light and too upright". Damion is nonetheless what the
site now wears: it was picked directly, as the face the mark should have, and a
proximity-to-Quick-Kiss score is not the only thing that decides that. The
difference the swap actually makes, at the sizes the site sets: Damion is a
**joined, rounder, more even monoline** where Kaushan Script is a broader
disconnected brush with visible thick/thin — so "Midnite" reads as one
continuous signature rather than seven brush strokes, and its final `e` exits on
a long swash that the earlier face did not have.

**The licensing constraint is unchanged and is what actually binds**: the face
has to be OFL or Apache, self-hosted, with upstream's licence file beside it.
Damion satisfies that exactly as Kaushan Script did. The sheet stays committed
so a future re-pick starts from rendered type rather than from this paragraph.

### How it is wired

Four files, and the same three-part wiring the app uses:

1. **The file.** `src/fonts/damion/Damion-latin.woff2` — the upstream TTF
   subset to Latin and compressed, **74 KB → 27 KB**. Upstream's `OFL.txt` sits
   beside it verbatim, which is what clause 2 of the licence requires, and the
   directory's own
   [`README.md`](../packages/website/src/fonts/damion/README.md) records the
   source URL and the exact `pyftsubset` command. Damion's copyright line
   declares **no Reserved Font Name**, so the subset keeps the family name with
   no obligation either way.
2. **`@font-face`** in [`src/styles/site.css`](../packages/website/src/styles/site.css),
   with `font-display: swap` and a relative `url()` — so **Vite fingerprints and
   emits it**, there is no `public/` copy to keep in step, and there is no Google
   Fonts `<link>`: the site makes no third-party request for its own type. The
   same file declares `--font-brand`, and `tailwind.config.ts` maps
   `fontFamily.brand` onto that var rather than naming the family itself. Keep
   the three in step.
3. **Preloaded** from `index.html`, `apps/index.html`, `download/index.html` and `pricing/index.html`
   by source path, which Vite rewrites to the one fingerprinted asset with `base`
   applied. The mark is above the fold on every page and is otherwise discovered
   only after the CSS has parsed and matched an element — three round trips for the
   first word on the page. `crossorigin` is mandatory even same-origin: a font
   request is CORS-mode, and a preload whose mode differs is a second download.
4. **[`src/components/wordmark.tsx`](../packages/website/src/components/wordmark.tsx)**
   owns the treatment, and is the only place `font-brand` is used. `Midnite` is
   the brand and takes the brand face at `1.35em` with `tracking-wide` and
   `pr-[0.15em]` — **headroom for the clip, and a per-face number**: Damion's
   ink runs 0.104em past its advance box over "Midnite" where Kaushan Script's
   ran 0.051em, and a gradient clipped to text still only paints inside the
   element's box. A face swap re-measures it. `Studio`
   says which of midnite's apps this is and stays in the UI face one muted step
   back — setting both in a script face would read as one made-up word. That
   mirrors the app's `Wordmark` exactly.

Three surfaces render it — the nav's `Logo`, the hero's `<h1>`, and the footer's
big wordmark — which is why the split lives in a component rather than being
re-typed three times. `tone` picks the fill: the default `rainbow` clips the
brand ramp to the glyphs and adds `.ws-brand-glow`, a glow that follows the
letterforms; the footer passes `inherit`, because its own `<p>` already carries
a deliberately faded ramp and its own `background-clip: text`.

**`.ws-brand-glow` is `filter: drop-shadow()`, and it has to be.**
`.ws-rainbow-text` fills the glyphs by clipping a gradient to them, which means
`color: transparent` — and `text-shadow` paints from the text's colour, so on
transparent text it emits nothing at all. `drop-shadow` reads the element's
rendered alpha instead, which after the clip is exactly the glyph shapes.
A `box-shadow` (what `.ws-neon` uses) would draw the glow around the span's
*rectangle*, which is the one thing a script wordmark must not have behind it.
It does not pulse: the four pulsing elements documented in `site.css` are
unchanged, because this mark sits in the sticky nav for the whole visit, a few
pixels from a nav underline that already breathes.

Two things stay true regardless. **`<title>` tags are plain text** — a face
cannot reach them, and they are what a search result and a browser tab show.
And **the nav's `aria-label` still reads "Midnite Studio"**: the visible mark is
now two differently-faced spans, and the space between them is a real text node
rather than only a margin, so `textContent` still says the product's name.

## The social card

Every HTML entry (`index.html`, `apps/`, `download/`, `pricing/`) carries the same Open Graph and
Twitter `summary_large_image` card: `public/img/og/midnite-apps.png`, 1200×630. It shows the plain
midnite moon (no rocket, which is Studio's own mark) filled with Studio's brand gradient, the
"Midnite Apps" wordmark in Damion, and every app's logo in a row.

- **The card is rendered, not drawn by hand.** `node scripts/website-og-image.mjs` builds it as an
  HTML page and screenshots it with Playwright, so the wordmark is set in the real brand face. The
  PNG is committed; re-run the script only when the card should change (a new app, new copy).
- **Its URLs are absolute.** Crawlers never resolve a relative `og:image`, so the HTML names
  `%SITE_ORIGIN%/img/og/midnite-apps.png` and `vite.config.ts`'s `socialMeta` plugin stamps the
  site root in at build time: `WEBSITE_ORIGIN` when set, else the same default `site-origin.ts`
  reads. A Pages build that sets `WEBSITE_ORIGIN` to origin plus prefix gets a card URL with the
  prefix, as it must. `src/social-meta.test.ts` holds every entry to this.

## Deploying on Vercel

The site also deploys as a plain Vercel project, and this is the path that is
live today. Point the project at this repo with **Root Directory
`packages/website`**; [`packages/website/vercel.json`](../packages/website/vercel.json)
carries the rest, so the dashboard needs no build overrides.

**The one thing that bites: install only the site's workspace.** From
`packages/website`, a bare `pnpm install` installs the *whole* workspace, and the
app's `@bilo-io/ui` / `@bilo-io/shell` come from GitHub Packages, which 401s
without a token — the first Vercel build died exactly there
(`ERR_PNPM_FETCH_401 … No authorization header was set`). The site imports none
of those packages, so `vercel.json`'s `installCommand` is

```sh
cd ../.. && pnpm install --filter @midnite/website --frozen-lockfile
```

which installs the site's project alone (344 packages, verified against a
deliberately invalid `GITHUB_PACKAGES_TOKEN`). No registry credential is needed
on Vercel, and none should be added — a build that suddenly needs one means the
site has grown an import it must not have (see the boundary in `CLAUDE.md`).

Other details the file settles:

- **`base` is `/`.** `WEBSITE_BASE` stays unset on Vercel; the `/midnite-apps/…`
  prefix is only for the Pages target below.
- **`/apps`, `/download` and `/pricing` need no rewrite.** Each page is emitted as a
  directory index (`dist/apps/index.html`, `dist/download/index.html`, `dist/pricing/index.html`), so
  Vercel serves them as-is.
- **Vercel's Git integration does not deploy.** `git.deploymentEnabled: false`
  turns it off: it created a deployment for every push to every branch, each
  counting against Vercel's deployment rate limit *before* an `ignoreCommand`
  could skip it, so busy agent PRs that never touched the site went red with
  "Deployment rate limited". Deploys come from
  [`.github/workflows/vercel.yml`](../.github/workflows/vercel.yml) instead,
  path-filtered to `packages/website/**` — a preview on a pull request, production
  on `main`. It needs three repo secrets, `VERCEL_TOKEN` (a Vercel account
  token), `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (both from
  `.vercel/project.json` after `vercel link` in `packages/website`); until they
  exist the job is a green no-op. A future public app (e.g. `packages/docs`)
  gets its own Vercel project and a sibling job, not a wider filter.
- **pnpm version** comes from the root `pnpm-lock.yaml` (v9), which Vercel
  detects; the root `package.json`'s `packageManager` field is not read because
  the root directory is the site.

## GitHub Pages — what the human has to do once

The publish job in
[`.github/workflows/website.yml`](../.github/workflows/website.yml) is
**guarded off until a token exists** — the `build` job still runs on every push
to `main` touching the site, so nothing is silently broken in the meantime, and
`publish` logs a notice and skips. Three steps turn it on, and none of them can
be done from a session:

1. **Create a fine-grained PAT.**
   [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens)
   → *Generate new token*, **Resource owner `bilo-io`**, **Only select
   repositories → `bilo-io/midnite-apps`**, and under *Repository permissions*
   set **Contents: Read and write** and nothing else. Give it an expiry you will
   actually notice.

   It is a *separate* token from `RELEASES_REPO_TOKEN` (see
   [`RELEASING.md`](RELEASING.md)) on purpose, even though the scope is
   identical: rotating one should not take the other down with it, and a website
   deploy has no business holding the release pipeline's credential.

2. **Add it as a secret in *this* repo.** Settings ▸ Secrets and variables ▸
   Actions ▸ *New repository secret*, named exactly
   **`MIDNITE_APPS_DEPLOY_TOKEN`**. The next push to `main` touching
   `packages/website/**` publishes; or run the workflow by hand from the Actions
   tab (`workflow_dispatch`).

3. **Enable Pages on `midnite-apps`.** The first publish *creates* the
   `gh-pages` branch, so do this after it: in `bilo-io/midnite-apps` ▸ Settings ▸
   Pages, set **Source: Deploy from a branch**, **Branch: `gh-pages`**,
   **Folder: `/ (root)`**. The site is then at
   `https://bilo-io.github.io/midnite-apps/midnite-studio/`.

   Pages is **not** enabled on that repo today (`gh api
   repos/bilo-io/midnite-apps/pages` returns 404), which is why the workflow
   targets a branch rather than the repo's `docs/` folder — `docs/` on `main`
   would put the built site in the same tree as the installers and would be
   served from the same commit history as them.

### Early access — the one-time issue form

The landing page's early-access section has **no backend and no third-party form
service**. Submitting it composes a prefilled issue in
`bilo-io/midnite-apps`, shows the visitor the exact text, and opens
`issues/new?…` in a new tab so they post it themselves under their own account.
Nothing is sent from the page, no key sits in the client, and there is no
address list anywhere but that repo's issue list.

It works today with the plain `?title=&body=&labels=early-access` form of that
URL. It reads better as a GitHub **issue form**, and that YAML has to be
committed in the *other* repo — which is
[`bilo-io/midnite-apps#4`](https://github.com/bilo-io/midnite-apps/pull/4),
open and waiting for a human, because that repo is public and a session does not
merge to it.

#### The flip, once that PR merges

**One environment variable, no code change:**

```sh
WEBSITE_ISSUE_TEMPLATE=early-access.yml moon run website:build
```

Set it in the publish job's `env:` alongside `WEBSITE_BASE`, and it is done. It
is inlined as `__ISSUE_TEMPLATE__` by `vite.config.ts` and read once, by
`ISSUE_TEMPLATE` in
[`src/sections/early-access/issue-url.ts`](../packages/website/src/sections/early-access/issue-url.ts);
`composeIssueUrl` branches on it, sending `field-id=value` pairs (`email`,
`use-case`, `agents`) instead of `body`, because that is how GitHub prefills an
issue form. Unset — the default, and every build today — means the plain URL.

**Why a variable and not a one-line edit.** Whether the form works is a fact
about a *different repo*, and this one cannot see it. As a source literal,
"is the YAML merged yet?" became a question answered by a commit here, which is
a state that can be wrong in either direction and stays wrong until someone
notices. As a build variable, it is answered by the deploy that actually knows,
and every other build — a local `website:dev`, a PR preview, a branch someone
checked out — gets the safe end for free.

**The safe end is the plain URL, and it is not a small preference.** GitHub
answers a `template=` it cannot find with the template *chooser*, and every
prefilled field is dropped on the floor without an error — a worse outcome than
the plain URL, and one that looks fine right up until someone actually uses the
form.

`docs/website/early-access-issue-form.yml` is a **byte-for-byte mirror** of what
that PR carries, kept here because the field ids are half of a contract whose
other half is `composeIssueUrl` — the same list written twice, and renaming one
side loses that answer silently. Edit both or neither. Note the mirror's `app`
dropdown: it has one option, preselected, and asks nothing. It is there because
`midnite-apps`' `issue-app-label.yml` finds the app by scanning the issue body
for an `### App` heading, so a form without one puts every early-access request
in the `needs-triage` pile instead of on the Studio board view — and declaring
`app: midnite-studio` under `labels:` would not help, since that workflow owns
those labels and strips any it did not choose.

The `early-access` label does not exist in `midnite-apps` yet, and a form's
`labels:` entry naming one that does not exist is ignored without an error:

```sh
gh label create early-access --repo bilo-io/midnite-apps \
  --description "Early-access build requests from the Midnite Studio site" --color 0E8A16
```

### A custom domain, later

Add a `CNAME` file to the published tree and point the DNS record at
`bilo-io.github.io`. Note that a Pages custom domain serves the repo at the
domain *root*, which changes the base to `/midnite-studio/` — set
`WEBSITE_BASE` in the workflow to match, or the site will look for its assets a
directory too deep.

## How the site is put together

| Path | What it is |
|---|---|
| `src/sections/registry.ts` | The landing page, top to bottom: a flat ordered array of `{ id, label, Component, nav? }`. `app.tsx` maps it into `<main>`; the nav reads the `nav: true` entries. **Adding a section means appending here, never editing `app.tsx`.** |
| `src/components/` | The shared vocabulary — `Section`, `Container`, `Button`, `GlowCard`, `Eyebrow`/`Heading`/`Lede`, `Logo`, `Reveal`, and the `useReducedMotion`/`useInView` hooks, all re-exported from `index.ts`. |
| `src/styles/tokens.css` | Every colour, radius, glow and duration. Dark-first: `:root` *is* the dark theme and light is one `prefers-color-scheme` block redefining the same names, so no component carries a `dark:` prefix. |
| `src/sections/hero/` | The hero: the launcher mark, the typewriter headline, and `launcher-mock.tsx`, a drawn launcher window whose tiles are the real catalog and link to each app's slide. `hero-video.tsx` and `pilot-video.tsx` live here too. The Studio section shows both, and the showreel reuses `PilotVideo` with its own clip, so a change to it changes both players. |
| `src/sections/showreel/` | The showreel straight under the hero: the Midnite Apps music video in `PilotVideo`'s click-to-play player, with its own clip and poster. |
| `src/sections/{suite,launcher,frame,studio}/` | The rest of the landing page: a card per app in the launcher's two groups, how the launcher installs and updates them, the eight parts of the frame every app shares, and Studio, the app that holds all of them (and that they run inside today). |
| `src/apps/catalog.ts` | The available apps as site copy: id, name, group, tagline, pitch, features and a four-stop **spectrum** sampled from each app's logo. Copied from the launcher's catalog rather than imported, because the site is off the graph; `catalog.test.ts` checks every id has a logo in `public/img/apps/`. Coming-soon apps are deliberately absent. |
| `src/apps/aurora.tsx`, `src/styles/apps.css` | The animated gradient behind an app: four blurred blobs and a turning sheen in that app's spectrum, read from `--app-c1`…`--app-c4`. Also the `.ws-cascade` reveal (children stagger in by `--i`), the carousel track and the thumbnails. All of it pauses in a hidden tab and stills under reduced motion. |
| `src/pages/apps/` | `/apps` — one hero per app in a scroll-snap carousel: logo, wordmark, pills (status, version, group, where it runs, platform), pitch and features, cascading in as each slide arrives. The fragment follows the slide (`/apps/#coder`), and the page glow cross-fades to the active app's colours. |
| `src/pages/download-page.tsx` | `/download` — "Get Midnite": how access works, with every call to action routed to the early-access section. No install command, no release links. |
| `src/pages/pricing-page.tsx` | `/pricing` — three columns (Free, Individual, Team). Public repos free; private repos are the paid boundary. No checkout — CTAs route to the early-access form. Prices are constants in this file ($8/mo Individual, $12/seat Team with a 5-seat minimum). |
| `src/site-origin.ts` | `SITE_ORIGIN`, the site's absolute public root — for absolute URLs read outside the page (social-card meta tags), which `BASE_URL` cannot serve. |
| `src/sections/faq/` | The FAQ. `faq.ts` holds the answers as data — the slugs are published URL fragments (`#faq-<slug>`), so they have a test rather than only a convention; `faq-section.tsx` is the tablist and the cross-fading panel. |
| `src/sections/early-access/` | The sign-up. `issue-url.ts` composes the GitHub issue (and owns `ISSUE_TEMPLATE`, see above); `roster.ts` is the ten agent names as site copy, hard-coded rather than imported from `shared` so a marketing bundle does not pull zod in for ten strings. |
| `src/sections/footer/` | The footer, its lane-graph horizon, and the reused version badge. |
| `public/video/` | The committed clips: the Studio section's pilot and backdrop, and the showreel's music video. [`VIDEO.md`](../packages/website/VIDEO.md), kept outside `public/` so it is not deployed, has the source and the `ffmpeg` line for each. |

Two rules that are not obvious from the code:

- **Every animation honours reduced motion, and it takes both halves.**
  `tokens.css` zeroes the duration tokens under
  `prefers-reduced-motion: reduce`, which disarms every CSS transition on the
  site including ones nobody thought about. That cannot cancel a
  `requestAnimationFrame` loop or a `setTimeout`, so anything JS-driven asks
  `useReducedMotion()` and renders a still frame instead.
- **The footer's copyright year is a build-time literal, not a clock read.**
  `__BUILD_YEAR__` is substituted by `define` in **both** `vite.config.ts` and
  `vitest.config.ts` (declared in `src/globals.d.ts`) — the year is a fact about
  the published artefact, so two visitors loading the same bundle see the same
  page. `__SITE_ORIGIN__` is the second such constant and had to be added to both
  configs; a test that renders the footer needs the
  substitution too.
- **Nothing here may link to `bilo-io/midnite-studio`.** It is the source repo,
  built for contributors; a visitor never needs it, and the site's own tests
  hold the line. Nor may any page link to `midnite-apps` or its releases: access is gated.
