import { ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';

import { EXTERNAL_LINKS, LAUNCHER_CHANNELS, THEME_SOURCES, type LauncherResult, type LauncherSelfStatus } from '../common/bridge';
import { APP_IDS, type AppId } from '../common/catalog';
import type { createAppsOps } from './bundles/apps-ops';
import { DOWNLOAD_URL, RELEASES_URL, SITE_URL } from './constants';
import { fetchStudioRelease } from './feed';
import { installStudio } from './install';
import { appLink } from './links';
import { findStudio, isStudioRunning, studioStatus } from './studio';

const AppIdSchema = z.object({ id: z.enum(APP_IDS) });
const AppOpenSchema = z.object({ id: z.enum(APP_IDS), featureId: z.string().max(64).optional() });
const LinkSchema = z.enum(EXTERNAL_LINKS);
const ThemeSchema = z.enum(THEME_SOURCES);

let pendingApp: AppId | null = null;

/** Parks the app a `midnite://` link asked for until the renderer mounts and takes it. */
export function takePendingApp(id?: AppId): AppId | null {
  if (id !== undefined) {
    pendingApp = id;
    return null;
  }
  const taken = pendingApp;
  pendingApp = null;
  return taken;
}

const failure = (message: string): LauncherResult => ({ ok: false, message });

export type AppsIpc = {
  ops: ReturnType<typeof createAppsOps>;
  /** Path of an app's installed bundle stub, or `null` — the router's first step. */
  findBundle(id: AppId): Promise<string | null>;
};

/** The launcher itself (`self-update.ts`). */
export type SelfIpc = {
  status(): Promise<LauncherSelfStatus>;
  update(): LauncherResult;
};

export function registerIpc(getWindow: () => BrowserWindow | null, apps: AppsIpc, self: SelfIpc): void {
  ipcMain.handle(LAUNCHER_CHANNELS.appsStatus, () => apps.ops.status());

  ipcMain.handle(LAUNCHER_CHANNELS.selfStatus, () => self.status());
  ipcMain.handle(LAUNCHER_CHANNELS.selfUpdate, (): LauncherResult => self.update());

  // Ops return the result envelope and never throw; a payload that is not an app id is a failure, not an exception.
  ipcMain.handle(LAUNCHER_CHANNELS.appInstall, async (_event, raw: unknown): Promise<LauncherResult> => {
    const parsed = AppIdSchema.safeParse(raw);
    return parsed.success ? apps.ops.install(parsed.data.id) : failure('Unknown app.');
  });

  ipcMain.handle(LAUNCHER_CHANNELS.appUninstall, async (_event, raw: unknown): Promise<LauncherResult> => {
    const parsed = AppIdSchema.safeParse(raw);
    return parsed.success ? apps.ops.uninstall(parsed.data.id) : failure('Unknown app.');
  });

  ipcMain.on(LAUNCHER_CHANNELS.themeSet, (_event, raw: unknown) => {
    const parsed = ThemeSchema.safeParse(raw);
    if (parsed.success) nativeTheme.themeSource = parsed.data;
  });

  ipcMain.handle(LAUNCHER_CHANNELS.studioStatus, () => studioStatus());

  ipcMain.handle(LAUNCHER_CHANNELS.studioInstall, () =>
    installStudio({
      isRunning: isStudioRunning,
      onProgress: (progress) => getWindow()?.webContents.send(LAUNCHER_CHANNELS.studioProgress, progress),
    }),
  );

  // Moves Studio to the Trash, never `rm` — an uninstall from a launcher should be undoable from Finder.
  ipcMain.handle(LAUNCHER_CHANNELS.studioUninstall, async (): Promise<LauncherResult> => {
    const installed = await findStudio();
    if (installed === null) return failure('Midnite Studio is not installed.');
    if (await isStudioRunning()) return failure('Midnite Studio is running — quit it first.');
    try {
      await shell.trashItem(installed.path);
      return { ok: true };
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  });

  ipcMain.handle(LAUNCHER_CHANNELS.studioReveal, async (): Promise<LauncherResult> => {
    const installed = await findStudio();
    if (installed === null) return failure('Midnite Studio is not installed.');
    shell.showItemInFolder(installed.path);
    return { ok: true };
  });

  ipcMain.handle(LAUNCHER_CHANNELS.appPending, () => takePendingApp());

  ipcMain.handle(LAUNCHER_CHANNELS.appOpen, async (_event, raw: unknown): Promise<LauncherResult> => {
    const parsed = AppOpenSchema.safeParse(raw);
    if (!parsed.success) return failure('Unknown app.');
    // The app's own bundle first; Studio hosts it when that is absent (or will not open).
    if (parsed.data.id !== 'studio') {
      const stub = await apps.findBundle(parsed.data.id);
      if (stub !== null && (await shell.openPath(stub)) === '') return { ok: true };
    }
    if ((await findStudio()) === null) return failure('Install Midnite Studio first — every app runs in it for now.');
    try {
      await shell.openExternal(appLink(parsed.data.id, parsed.data.featureId));
      return { ok: true };
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  });

  ipcMain.handle(LAUNCHER_CHANNELS.linkOpen, async (_event, raw: unknown): Promise<LauncherResult> => {
    const parsed = LinkSchema.safeParse(raw);
    if (!parsed.success) return failure('Unknown link.');
    let url: string;
    switch (parsed.data) {
      case 'website':
        url = SITE_URL;
        break;
      case 'releases':
        url = RELEASES_URL;
        break;
      case 'download':
        url = DOWNLOAD_URL;
        break;
      case 'notes':
        url = (await fetchStudioRelease()).release?.notesUrl ?? RELEASES_URL;
        break;
    }
    await shell.openExternal(url);
    return { ok: true };
  });
}
