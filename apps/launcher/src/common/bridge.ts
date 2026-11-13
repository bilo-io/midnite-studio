import type { ChangelogAppId } from '@midnite/studio-shared/release';

import type { AppId, BundleAppId } from './catalog';
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
  /** The running launcher against `midnite-launcher/version.json`. */
  selfStatus: 'launcher:self:status',
  /** Re-runs the launcher installer, which quits this app, replaces it and reopens it. */
  selfUpdate: 'launcher:self:update',
  /** main → renderer: the installer exited non-zero before it could quit this app. */
  selfUpdateFailed: 'launcher:self:update-failed',
  linkOpen: 'launcher:link:open',
  privacyGet: 'launcher:privacy:get',
  privacySet: 'launcher:privacy:set',
  /** The newest released sections of one app's public changelog mirror. */
  changelogLatest: 'launcher:changelog:latest',
  /** Opens one app's full changelog page in the browser. */
  changelogOpen: 'launcher:changelog:open',
  themeSet: 'launcher:theme:set',
} as const;

/** An installed copy of Midnite Studio. `version` is `null` when its Info.plist would not say. */
export type StudioInstall = { path: string; version: string | null };

/** The newest published release, from `midnite-studio/version.json`. */
/** One released changelog section; `body` is Keep-a-Changelog markdown. */
export type ChangelogSection = { version: string; date?: string; body: string };
export type ChangelogResult = { sections: ChangelogSection[]; error: string | null };

export type StudioRelease = { version: string; releasedAt: string | null; notesUrl: string | null };

/** The running launcher against its own feed. `latest` is `null` with `feedError` set when it could not be read. */
export type LauncherSelfStatus = {
  current: string;
  latest: StudioRelease | null;
  feedError: string | null;
  /** `false` in a dev run — the stock Electron binary is not something the installer can replace. */
  canUpdate: boolean;
};

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

export const EXTERNAL_LINKS = ['website', 'releases', 'notes', 'download'] as const;
export type ExternalLink = (typeof EXTERNAL_LINKS)[number];

export const THEME_SOURCES = ['system', 'light', 'dark'] as const;
export type ThemeSource = (typeof THEME_SOURCES)[number];

/**
 * Phase 115 Theme A: the launcher's automatic network calls and whether each may run at start. `allAutomaticOff`
 * is the master and overrides the two switches without changing them. A manual "Check again" always runs.
 */
export type LauncherPrivacy = {
  allAutomaticOff: boolean;
  switches: { 'launcher-updates': boolean; 'launcher-catalog': boolean };
};

/** `manual` is a click on Check again: it runs even with the automatic switch off. */
export type StatusOptions = { manual?: boolean };

export type LauncherBridge = {
  launcherVersion: string;
  platform: { os: string; arch: string };
  studio: {
    status(options?: StatusOptions): Promise<StudioStatus>;
    install(): Promise<LauncherResult>;
    uninstall(): Promise<LauncherResult>;
    reveal(): Promise<LauncherResult>;
    onProgress(listener: (progress: InstallProgress) => void): () => void;
  };
  apps: {
    open(id: AppId, featureId?: string): Promise<LauncherResult>;
    status(options?: StatusOptions): Promise<AppsStatus>;
    /** Installs or updates one app's bundle and Dock stub. Never throws. */
    install(id: AppId): Promise<LauncherResult>;
    /** Removes exactly this app's bundle, stub and record (to the Trash). Never throws. */
    uninstall(id: BundleAppId): Promise<LauncherResult>;
    onProgress(listener: (event: AppInstallProgress) => void): () => void;
    /** Fires when a `midnite://` link could not open the app and wants its detail sheet. */
    onShow(listener: (id: AppId) => void): () => void;
    /** An app a link asked for before the renderer mounted, consumed once. */
    takePending(): Promise<AppId | null>;
  };
  /** The launcher itself. */
  self: {
    status(options?: StatusOptions): Promise<LauncherSelfStatus>;
    /** Starts the installer and returns; on success this app quits shortly after. Never throws. */
    update(): Promise<LauncherResult>;
    /** Fires with a message when a started update failed and this app is still running. */
    onFailed(listener: (message: string) => void): () => void;
  };
  links: {
    open(link: ExternalLink): Promise<LauncherResult>;
  };
  changelog: {
    /** Never throws: offline is `{ sections: [], error }`; not published yet is `{ sections: [], error: null }`. */
    latest(app: ChangelogAppId): Promise<ChangelogResult>;
    openFull(app: ChangelogAppId): Promise<LauncherResult>;
  };
  privacy: {
    get(): Promise<LauncherPrivacy>;
    set(next: LauncherPrivacy): Promise<LauncherPrivacy>;
  };
  theme: {
    /** Fire-and-forget: sets Electron's `nativeTheme.themeSource`. */
    set(source: ThemeSource): void;
  };
};
