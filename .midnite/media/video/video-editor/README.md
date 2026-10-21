# video-editor — midnite's Remotion app

**One editor app, many videos.** Every project registers its own compositions under
`src/projects/<project-id>/`; the reusable layer lives in `src/shared/`. The per-video
working docs, source video and renders live in `../projects/<project-id>/`, not here.
The repeatable workflow is in [`../README.md`](../README.md).

```
src/
├── Root.tsx                          ← one line per project: imports its register.tsx
├── shared/                           ← the reusable layer, imported by any project
│   ├── brand.ts                      ← BG/FG/BORDER + the six-stop rainbow ramp
│   ├── fonts.ts                      ← Poppins (UI) + Kaushan Script (the word "Midnite")
│   ├── MidniteWordmark.tsx           ← the crescent + name lockup
│   ├── AgentLogo.tsx                 ← the coding-agent marks, keyed as the app keys them
│   ├── OriginalSegment.tsx           ← <OffthreadVideo trimBefore> passthrough of a master
│   └── projectFile.ts                ← staticFile() for a project's own input/ files
└── projects/midnite/marketing/000-pilot/
    ├── register.tsx                  ← <Folder> + <Composition id="MidnitePilot">
    ├── assets.ts                     ← pilotFile("…") → public/projects/<id>/…
    └── Pilot.tsx                     ← the composition
```

A project's folder here **mirrors its path** under the repo's `projects/`, so the two
halves of a project are findable from either side. Composition ids stay globally unique:
they are what `remotion render` addresses, and it knows nothing about `<Folder>`s — the
folder is a Studio affordance only.

`public/` is **generated and gitignored** — `npm run assets` mirrors the repo's `assets/`
(logos, b-roll, music) and every project's `input/` into it, so each binary has exactly
one tracked home. Reference shared assets as `staticFile("logos/agents/claude-white.svg")`
and a project's own files as `pilotFile("x.mp4")`.

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm i                                                  # fresh checkout
npm run dev                                             # syncs assets, then Studio → http://localhost:3000
npm run lint                                            # eslint + tsc across every project
node ../scripts/render.mjs midnite/marketing/000-pilot  # → ../projects/<id>/output/vN.mp4
```

Every `remotion` / `@remotion/*` dependency is pinned to one exact version with no `^` —
they release in lockstep and a caret lets one drift ahead of the rest. `npx remotion
versions` checks it; `npm run upgrade` moves the whole set together.

Adding a video: `cp -R ../projects/_template ../projects/<brand>/<category>/NNN-my-video`,
then `mkdir -p src/projects/<same path>` with a `register.tsx` and add one line to
`src/Root.tsx`.

---

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

## Remotion docs and help

- [Fundamentals](https://www.remotion.dev/docs/the-fundamentals) · [Discord](https://discord.gg/6VzzNDwUwV) · [Issues](https://github.com/remotion-dev/remotion/issues/new)
- Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
