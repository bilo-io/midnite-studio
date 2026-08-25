# Phase 3 — Electron shell boots (AppFrame + TitleBar + theme)

Frameless mac window rendering the Vite app inside `@bilo-io/shell`'s `AppFrame`, with a working
`TitleBar`, dark/light tokens, and theme toggle.

Crib: `~/Dev/midnite/packages/desktop/src/main/{window-chrome,shell-path}.ts` and its preload;
model the Vite host on `~/Dev/midnite-ui/packages/docs/src/app.tsx`; copy the token→color map
from `~/Dev/midnite-ui/packages/docs/tailwind.config.ts`.

## Deliverables

- [ ] `desktop/src/main/index.ts` — single-instance lock, `contextIsolation: true`, `titleBarStyle: 'hidden'` (+ trafficLightPosition), `additionalArguments: ['--window-frameless']`; dev loads `http://localhost:5173`, prod loads `app/dist/index.html`
- [ ] `desktop/src/main/{window.ts,window-chrome.ts}` — fullscreen/focus forwarding, background retint (implements shell's `WindowChromeBridge` needs)
- [ ] `desktop/src/main/shell-path.ts` — login-shell PATH fix, near-verbatim from midnite
- [ ] `desktop/src/main/menu.ts` — minimal app menu incl. macOS Edit roles
- [ ] `desktop/src/preload/index.ts` — typed `windowChrome` bridge; channel constants from `shared`; subscriptions return unsubscribe fns
- [ ] `app/vite.config.ts` — `base: './'` (file:// prod loads)
- [ ] `app/index.html` — inline `themeInitScript` from `@bilo-io/ui/theme`
- [ ] `app/tailwind.config.ts` — token→hsl map + `darkMode: ['class']` + content globs incl. `./node_modules/@bilo-io/{ui,shell}/dist/**/*.js` (**missing a glob silently drops layout classes**)
- [ ] `app/src/styles.css` — `@bilo-io/ui/styles`, `@bilo-io/shell/appearance.css`, tailwind directives
- [ ] `app/src/app.tsx` — ThemeProvider + ShellProviders (`@tanstack/react-query@^5`) + AppFrame (linkComponent adapter) + TitleBar wired to `window.midniteGit.windowChrome`
- [ ] `desktop` moon task `start` — build main+preload, run `electron .` concurrently with `app:dev`

## Verification

- [ ] `moon run desktop:start` → frameless window, traffic-light clearance correct
- [ ] Fullscreen enter/leave collapses/restores the title bar
- [ ] Theme toggle flips tokens (light/dark)
- [ ] Screenshot captured
