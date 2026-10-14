import { ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';

import { EXTERNAL_LINKS, LAUNCHER_CHANNELS, THEME_SOURCES, type LauncherResult } from '../common/bridge';
import { APP_IDS } from '../common/catalog';
import { DOWNLOAD_URL, GITHUB_URL, RELEASES_URL, SITE_URL, STUDIO_FEED_URL } from './constants';
import { fetchLatestRelease } from './feed';
import { installStudio } from './install';
import { appLink } from './links';
import { findStudio, isStudioRunning, studioStatus } from './studio';

const AppOpenSchema = z.object({ id: z.enum(APP_IDS), featureId: z.string().max(64).optional() });
const LinkSchema = z.enum(EXTERNAL_LINKS);
const ThemeSchema = z.enum(THEME_SOURCES);

const failure = (message: string): LauncherResult => ({ ok: false, message });

export function registerIpc(getWindow: () => BrowserWindow | null): void {
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

  ipcMain.handle(LAUNCHER_CHANNELS.appOpen, async (_event, raw: unknown): Promise<LauncherResult> => {
    const parsed = AppOpenSchema.safeParse(raw);
    if (!parsed.success) return failure('Unknown app.');
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
      case 'github':
        url = GITHUB_URL;
        break;
      case 'releases':
        url = RELEASES_URL;
        break;
      case 'download':
        url = DOWNLOAD_URL;
        break;
      case 'notes':
        url = (await fetchLatestRelease(STUDIO_FEED_URL)).release?.notesUrl ?? RELEASES_URL;
        break;
    }
    await shell.openExternal(url);
    return { ok: true };
  });
}
