# The public website

`packages/website` is the marketing site: a static Vite + React build served
from **GitHub Pages on the public [`bilo-io/midnite-apps`](https://github.com/bilo-io/midnite-apps)
repo**, at `https://bilo-io.github.io/midnite-apps/midnite-studio/`.

It lives in this repo and is served from that one for the same reason the
installers and the issue tracker do: **this repo is private**, so nothing it
serves is anonymously reachable. `midnite-apps` is the shared public surface for
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
- **`/download` needs no rewrite.** The page is emitted as
  `dist/download/index.html`, a directory index, so Vercel serves it as-is.
- **`ignoreCommand`** skips a build when the commit touched neither
  `packages/website/**`, the lockfile nor the root eslint config. If the diff
  cannot be computed (no `HEAD^` in a shallow clone) it exits non-zero and the
  build simply runs.
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
| `src/sections/hero/` | The hero: the pointer-reactive canvas backdrop, the typewriter headline, and the video slot. |
| `src/pages/download-page.tsx` | `/download` — the install command, the version feed, what the script does. |
| `src/sections/faq/` | The FAQ. `faq.ts` holds the answers as data — the slugs are published URL fragments (`#faq-<slug>`), so they have a test rather than only a convention; `faq-section.tsx` is the tablist and the cross-fading panel. |
| `src/sections/early-access/` | The sign-up. `issue-url.ts` composes the GitHub issue (and owns `ISSUE_TEMPLATE`, see above); `roster.ts` is the ten agent names as site copy, hard-coded rather than imported from `shared` so a marketing bundle does not pull zod in for ten strings. |
| `src/sections/footer/` | The footer, its lane-graph horizon, and the reused version badge. |
| `public/video/` | Empty, deliberately. [Its README](../packages/website/public/video/README.md) says what to drop in; the hero renders the poster when nothing is there. |

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
  page. Adding a second such constant means editing both configs; a test that
  renders the footer needs the substitution too.
- **Nothing here may link to `bilo-io/midnite-studio`.** It is private; a link
  to it is a 404 for every visitor, which reads as a broken site rather than as
  a permissions problem. Downloads, release notes and issues are all in
  `midnite-apps`, and its release tags are namespaced (`midnite-studio/v0.3.1`),
  never bare.
