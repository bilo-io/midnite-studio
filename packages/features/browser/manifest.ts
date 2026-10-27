import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The embedded browser as a feature (Phase 113 Theme L).
 *
 * **One package for two placement folders** (`browser`, `web-apps` —
 * `FEATURE_PACKAGE_FOLDERS.browser`): the web-apps rail measures its native
 * view with the pane's `boundsFromRect`, and in main both are `WebContentsView`
 * services under the same `browser-security.ts` posture. Split per folder,
 * `web-apps` would import `browser`. The package takes `browser`'s placement
 * (the frame); `web-apps` keeps its own row (the Browser app).
 *
 * The main half is `browser-service.ts`, `web-apps-service.ts`,
 * `browser-security.ts` (moved intact, every guard and its tests) and their
 * IPC, moved out of `packages/desktop/src/main`. Electron reaches it through
 * the structural port its composer installs (`installBrowserMain`).
 *
 * No views: the browser is a pane and the web apps a rail row and flyout,
 * drawn by the composing app's chrome. `settingsPages` is empty this slice —
 * Settings ▸ Browser and Settings ▸ Web apps live in the frame's Settings view
 * over `ui-store`.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const browserManifest = defineFeatureManifest({
  feature: 'browser',
  owner: 'frame',
  views: [],
  settingsPages: [],
  /** Request/response channels. */
  ipc: [
    CHANNELS.browserCreate,
    CHANNELS.browserClearData,
    CHANNELS.browserDevServerProbe,
    CHANNELS.browserPermissionsList,
    CHANNELS.browserPermissionRevoke,
    CHANNELS.browserPermissionsReset,
    CHANNELS.webAppsEnable,
    // The partitions' sign-ins, listed and cleared for the Vault (Theme J slice 3) — they live in this
    // feature's sessions, so this feature answers them; the Vault's manifest names them too.
    CHANNELS.webAppsSignIns,
    CHANNELS.webAppsSignOut,
    // Phase 117 Theme G: the agent session (start answers with its state, a tool with its result).
    CHANNELS.browserAgentStart,
    CHANNELS.browserAgentTool,
  ],
  /** One-way (`send`) channels — a bounds push fires every resize frame, so no round trip. */
  sends: [
    CHANNELS.browserClose,
    CHANNELS.browserNavigate,
    CHANNELS.browserBack,
    CHANNELS.browserForward,
    CHANNELS.browserReload,
    CHANNELS.browserStop,
    CHANNELS.browserSetBounds,
    CHANNELS.browserSetVisible,
    CHANNELS.browserActivate,
    CHANNELS.browserDevtools,
    CHANNELS.browserFind,
    CHANNELS.browserFindStop,
    CHANNELS.browserZoom,
    CHANNELS.browserSetKeepAwake,
    CHANNELS.browserSetDiscardMs,
    CHANNELS.browserPermissionResponse,
    CHANNELS.browserSetSpellcheck,
    CHANNELS.browserSetSiteSafety,
    CHANNELS.browserProceedSite,
    CHANNELS.browserSetDownloads,
    CHANNELS.browserDownloadResponse,
    CHANNELS.browserSetPrivacy,
    CHANNELS.browserTrackerSiteException,
    CHANNELS.browserAgentStop,
    CHANNELS.browserAgentRespond,
    CHANNELS.browserClipboardClear,
    CHANNELS.browserSetClipboardWatch,
    CHANNELS.webAppsDisable,
    CHANNELS.webAppsSetBounds,
    CHANNELS.webAppsActivate,
  ],
  /** A tab's chrome events, and the two chords a focused page hands back (Mod+w, Mod+t). */
  events: [EVENT_CHANNELS.browserEvent, EVENT_CHANNELS.menuCommand],
  mcpTools: [],
});

export type BrowserManifest = typeof browserManifest;
