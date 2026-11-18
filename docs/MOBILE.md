# Midnite Mobile

The Expo companion app in `apps/mobile` (design and phasing: `.midnite/tasks/FEATURES/phases/phase-146-mobile-app.md`).

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
