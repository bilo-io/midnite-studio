import type { AppId } from './catalog';

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
  linkOpen: 'launcher:link:open',
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
export type LauncherResult = { ok: true } | { ok: false; message: string };

export const EXTERNAL_LINKS = ['website', 'github', 'releases', 'notes', 'download'] as const;
export type ExternalLink = (typeof EXTERNAL_LINKS)[number];

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
  };
  links: {
    open(link: ExternalLink): Promise<LauncherResult>;
  };
};
