import type { AppId } from './catalog';
import type { LockstepReason } from './lockstep';

/**
 * The launcher's own IPC contract — `window.midniteLauncher`.
 *
 * Separate from Studio's `window.midniteStudio` on purpose: the launcher is a
 * different product with its own main process, and it reaches Studio only
 * through `midnite-studio://` links and the public midnite-apps feed.
 *
 * The renderer never hands main a URL or a path. It names an app (and maybe a
 * feature) or a link *kind*; main resolves those against the catalog and its
 * own constants. Payloads are zod-validated in main (`main/ipc.ts`).
 */

export const LAUNCHER_CHANNELS = {
  studioStatus: 'launcher:studio:status',
  studioInstall: 'launcher:studio:install',
  studioUninstall: 'launcher:studio:uninstall',
  studioReveal: 'launcher:studio:reveal',
  studioProgress: 'launcher:studio:progress',
  appOpen: 'launcher:app:open',
  /** Installed bundles vs `catalog.json` — what the tile states are derived from. */
  appsStatus: 'launcher:apps:status',
  appInstall: 'launcher:app:install',
  appUninstall: 'launcher:app:uninstall',
  appProgress: 'launcher:app:progress',
  /** main → renderer: a `midnite://` link wants this app's detail sheet. */
  appShow: 'launcher:app:show',
  /** renderer → main: the app a link asked for before the renderer was listening, once. */
  appPending: 'launcher:app:pending',
  linkOpen: 'launcher:link:open',
  themeSet: 'launcher:theme:set',
} as const;

/** An installed copy of Midnite Studio. `version` is `null` when its Info.plist would not say. */
export type StudioInstall = { path: string; version: string | null };

/** The newest published release, from `midnite-studio/version.json`. */
export type StudioRelease = { version: string; releasedAt: string | null; notesUrl: string | null };

export type StudioStatus = {
  installed: StudioInstall | null;
  latest: StudioRelease | null;
  /** Why `latest` is `null` — offline, or the feed has nothing yet. */
  feedError: string | null;
  running: boolean;
  /** Epoch ms of this check. */
  checkedAt: number;
};

export type InstallPhase = 'download' | 'verify' | 'install' | 'done' | 'error';

export type InstallProgress = {
  phase: InstallPhase;
  received: number;
  /** `null` when the server sent no length. */
  total: number | null;
  message?: string;
};

/** Ops never throw across the bridge — the same envelope rule Studio's IPC keeps. */
/** `reason` is set when lockstep (`lockstep.ts`) refused the operation, so a tile can offer the right fix. */
export type LauncherResult = { ok: true } | { ok: false; message: string; reason?: LockstepReason };

/** One installed app bundle, as `installed.json` records it. */
export type InstalledBundle = { id: string; version: string; runtimeVersion: string };

/**
 * The installed-bundle record against the published catalog. `catalog` is `null` when it could
 * not be fetched or is not published yet; the tiles then fall back to Studio.
 */
export type AppsStatus = {
  /** The running runtime's (launcher's) version. */
  runtimeVersion: string;
  installed: InstalledBundle[];
  catalog: { runtimeVersion: string; apps: { id: string; version: string }[] } | null;
  /** `false` in an unpackaged launcher, which cannot build a Dock stub from the stock Electron. */
  canManageBundles: boolean;
};

export type AppInstallProgress = { id: AppId; progress: InstallProgress };

export const EXTERNAL_LINKS = ['website', 'github', 'releases', 'notes', 'download'] as const;
export type ExternalLink = (typeof EXTERNAL_LINKS)[number];

export const THEME_SOURCES = ['system', 'light', 'dark'] as const;
export type ThemeSource = (typeof THEME_SOURCES)[number];

export type LauncherBridge = {
  launcherVersion: string;
  platform: { os: string; arch: string };
  studio: {
    status(): Promise<StudioStatus>;
    install(): Promise<LauncherResult>;
    uninstall(): Promise<LauncherResult>;
    reveal(): Promise<LauncherResult>;
    onProgress(listener: (progress: InstallProgress) => void): () => void;
  };
  apps: {
    open(id: AppId, featureId?: string): Promise<LauncherResult>;
    status(): Promise<AppsStatus>;
    /** Installs or updates one app's bundle and Dock stub. Never throws. */
    install(id: AppId): Promise<LauncherResult>;
    /** Removes exactly this app's bundle, stub and record (to the Trash). Never throws. */
    uninstall(id: AppId): Promise<LauncherResult>;
    onProgress(listener: (event: AppInstallProgress) => void): () => void;
    /** Fires when a `midnite://` link could not open the app and wants its detail sheet. */
    onShow(listener: (id: AppId) => void): () => void;
    /** An app a link asked for before the renderer mounted, consumed once. */
    takePending(): Promise<AppId | null>;
  };
  links: {
    open(link: ExternalLink): Promise<LauncherResult>;
  };
  theme: {
    /** Fire-and-forget: sets Electron's `nativeTheme.themeSource`. */
    set(source: ThemeSource): void;
  };
};
