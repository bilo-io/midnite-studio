# Midnite Mobile

The Expo companion app in `apps/mobile`: Midnite's History, Tasks board, PR reviews and agent providers on a phone,
reading GitHub directly so it works with no desktop running. Design and phasing live on the phase issue
([#1368](https://github.com/bilo-io/midnite-studio/issues/1368)) and its theme sub-issues, not in git.

## Running it

```sh
cp apps/mobile/.env.example apps/mobile/.env   # then fill EXPO_PUBLIC_GITHUB_CLIENT_ID (below)
moon run mobile:start                           # expo start; scan the QR with Expo Go
```

- **Expo Go only.** No custom native modules, no dev client, no EAS builds. Anything that needs native code is out of
  scope until a later phase.
- **User setup, still owed:** `EXPO_PUBLIC_GITHUB_CLIENT_ID` needs a GitHub OAuth App with **Device Flow enabled**,
  registered by the repo owner. Until it is set, device-flow sign-in is unavailable and the **personal access token**
  option on the sign-in screen is the fallback (it works today, with no setup).
- Focused checks: `pnpm -C apps/mobile exec vitest run`, `pnpm -C apps/mobile exec tsc --noEmit`. The same tests run in
  the node gate as the `mobile` project of `vitest.node-gate.config.ts` (`NODE_GATE_PROJECTS`; `apps/*` is not scanned by
  `NODE_PROJECTS`, so it is listed explicitly). They run in jsdom against `react-native-web` with native-only modules
  mocked in `apps/mobile/test/mocks`.

## Package graph

```
shared ◀ tasks-core ◀ mobile
shared ◀ forge-github-core ◀ mobile
shared ◀ mobile
git-engine/diff (the pure diff parser, one subpath) ◀ mobile
@bilo-io/ui-native (module id) ◀ mobile
```

| Package | What mobile takes from it |
|---|---|
| `@midnite/studio-shared` | domain types (`Commit`, `FileDiff`, `ForgeIssue`, ...) and zod schemas |
| `@midnite/tasks-core` | board grouping, graph layout, filter and sort; desktop's Tasks feature uses the same code |
| `@midnite/forge-github-core` | GitHub GraphQL documents, parsers and mutation builders; desktop runs them over `gh`, mobile over `fetch` |
| `@midnite/studio-git-engine/diff` | the unified-diff parser only; never the git-engine barrel or any other subpath |
| `@bilo-io/ui-native` | the component set (AppBar, BottomNav, Sheet, SpeedDial, ...) |

Both pure cores are React-free, electron-free and take `shared` only. `eslint.config.mjs` holds mobile to this graph, and
`scripts/layer-boundaries.test.mjs` proves each rule case by case (mobile importing the frame, the runtime, a feature,
a module, `electron`, `node:*`, `react-dom`, `react-icons`, the git-engine barrel or the vendored path fails; `shared`,
the `/diff` subpath, `react-native` and `@bilo-io/ui-native` pass).

## `@bilo-io/ui-native` is vendored for now

`@bilo-io/ui-native@0.5.0` is built and merged in `bilo-io/midnite-ui` but could not be published (GitHub Packages
refused it: billing limit). Until it is, `apps/mobile/vendor/ui-native/` holds a verbatim copy of its source and the module
id `@bilo-io/ui-native` is aliased to it in `tsconfig.json` (`paths`), `vitest.config.ts` and `metro.config.js`. No call
site imports the vendored path (a lint rule forbids it), so the swap to the published package is a deletion. The
provenance and the exact **removal steps** are in
[`apps/mobile/vendor/ui-native/VENDORED.md`](../apps/mobile/vendor/ui-native/VENDORED.md). `vendor/**` and `metro-shims/**`
are excluded from lint.

The same alias pattern points `@midnite/forge-github-core`, `@midnite/studio-git-engine/diff` and `@midnite/tasks-core`
at their TypeScript source in `tsconfig.json`, `vitest.config.ts` and `metro.config.js`, so no pre-built `dist/` is
needed (forge-github-core and git-engine publish a CJS `dist`, which Metro should not load).

### Upstream first

A generic component (one with nothing Midnite-specific in it) is added to `@bilo-io/ui-native` in `bilo-io/midnite-ui`
first and consumed here, never written into `apps/mobile` and moved later. Only screens and Midnite-specific
composition live in this app.

## The `MobileDataSource` seam

Screens never call GitHub. They go through `MobileDataSource` (`src/data/source.ts`), whose methods return a `Result`
and never throw, mirroring desktop's IPC envelope rule. `GitHubDataSource` is the only implementation today. Pairing
with a running desktop Studio (LAN or tunnel) is a later phase that implements the same interface and swaps in at the
provider; no screen changes.

## Why provider sign-in uses the in-app browser

The Agents tab opens each provider (Claude Code, Codex, Gemini, Jules, Copilot) in the system in-app browser
(SFSafariViewController on iOS, Chrome Custom Tabs on Android), not an embedded WebView. Google rejects OAuth inside
embedded WebViews with `disallowed_useragent`, so the system browser is the only path where Google SSO and passkeys work
as the provider intends. The cost is the system's own browser chrome, which is accepted. On iOS the sheet keeps its own
persistent cookie store per app, so a provider sign-in survives relaunches of Midnite. There is no
`react-native-webview`, no user-agent spoofing and no cookie bridging.

## Not here yet

Deferred scope is tracked as GitHub issues labelled `deferred` that link #1368: the desktop pairing data source, forges
other than github.com, markdown rendering, push notifications, EAS builds and store release, board drag and drop,
native-app handoff for providers, and a lane graph on History.

## Signing in (Phase 146 Theme E)

Mobile reads GitHub directly through `GitHubDataSource` (`src/data/github-source.ts`), which implements the
`MobileDataSource` interface in `src/data/source.ts`. A future desktop-paired source implements the same interface.

- **Device flow** (`src/auth/device-flow.ts`): needs a GitHub OAuth App with **Device Flow enabled**. Its client id is
  public; set it as `EXPO_PUBLIC_GITHUB_CLIENT_ID` in `apps/mobile/.env` (git-ignored; see `.env.example`). There is no
  client secret anywhere. Scopes requested: `repo read:org read:project project`.
- **Personal access token fallback**: "Use a personal access token" on the sign-in screen. The token is validated with
  `viewer { login }` and the scopes it lacks are listed (classic tokens only).
- **Storage**: the token is kept in `expo-secure-store` under `github:github.com:<login>` (device-only keychain class);
  it is never logged, never in a query key and never in an error message. An `auth` result from any call clears it and
  returns to sign-in.
