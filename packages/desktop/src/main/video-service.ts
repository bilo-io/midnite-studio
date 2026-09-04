import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { shell, type BrowserWindow } from 'electron';

import {
  EVENT_CHANNELS,
  failure,
  ok,
  type GitOpResult,
  type VideoProject,
  type VideoRender,
  type VideoStudioStatus,
  type VideoToolchain,
} from '@midnite/studio-shared';

import {
  createProject,
  discoverProjects,
  getProject,
  listAreaFiles,
  listOutputFiles,
  readProjectFile,
  removeProject,
  resolveAreaFilePath,
  type VideoFileEntry,
} from './video/project-discovery';
import { nullProjectsStore, type ProjectsStore } from './video/projects-store';
import { probeVideoToolchain } from './video/toolchain';
import { getStudioStatus, startStudio, stopStudio, stopAllStudios } from './video/studio-service';
import { buildRenderCommand, cancelRender, killAllRenders, listRenders, queueRender } from './video/render-service';

/**
 * Video Studio (Phase 44 Theme H) — the orchestration layer between the IPC
 * handlers and the five main-process modules Themes B/C/E already built,
 * mirroring `workflow-service.ts`'s own split: module-level state plus a
 * `getWindow` thunk, configured once from `main/index.ts`.
 *
 * **One Remotion app serves every project.** `~/Dev/ekko-videos` is the
 * reference layout this mirrors exactly: `<root>/video-editor` is the single
 * Remotion app (studio and the render fallback both run there), `<root>/
 * projects/<id>/` is one project's own folder, and `<root>/scripts/
 * render.mjs`, when present, is the wrapper `buildRenderCommand` prefers.
 */
const APP_DIR_NAME = 'video-editor';
const WRAPPER_REL_PATH = 'scripts/render.mjs';

let store: ProjectsStore = nullProjectsStore;
let getWindowThunk: () => BrowserWindow | null = () => null;
let videoRoot: string | null = null;
let rootLoading: Promise<void> | null = null;

export function configureVideo(nextStore: ProjectsStore, getWindow: () => BrowserWindow | null): void {
  store = nextStore;
  getWindowThunk = getWindow;
  videoRoot = null;
  rootLoading = null;
}

async function ensureRootLoaded(): Promise<void> {
  rootLoading ??= (async () => {
    videoRoot = (await store.load()).videoRoot;
  })();
  await rootLoading;
}

export async function getVideoRoot(): Promise<string | null> {
  await ensureRootLoaded();
  return videoRoot;
}

export async function setVideoRoot(root: string | null): Promise<void> {
  videoRoot = root;
  rootLoading = Promise.resolve();
  await store.save({ videoRoot: root });
}

function appDirFor(root: string): string {
  return join(root, APP_DIR_NAME);
}

async function requireRoot(): Promise<GitOpResult<string>> {
  await ensureRootLoaded();
  if (!videoRoot) return failure('Configure a video root in Settings first.');
  return ok(videoRoot);
}

function emitStudioChanged(projectId: string, status: VideoStudioStatus): void {
  const win = getWindowThunk();
  if (win && !win.isDestroyed()) {
    win.webContents.send(EVENT_CHANNELS.videoStudioChanged, { projectId, status });
  }
}

function emitRenderProgress(event: {
  renderId: string;
  projectId: string;
  status: VideoRender['status'];
  progress?: number;
}): void {
  const win = getWindowThunk();
  if (win && !win.isDestroyed()) {
    win.webContents.send(EVENT_CHANNELS.videoRenderProgress, event);
  }
}

// --- projects ----------------------------------------------------------------

export async function listVideoProjects(): Promise<VideoProject[]> {
  const root = await requireRoot();
  if (!root.ok) return [];
  return discoverProjects(root.value);
}

export async function getVideoProject(id: string): Promise<VideoProject | null> {
  const root = await requireRoot();
  if (!root.ok) return null;
  return getProject(root.value, id);
}

export async function createVideoProject(id: string, title: string): Promise<GitOpResult<VideoProject>> {
  const root = await requireRoot();
  if (!root.ok) return root;
  return createProject(root.value, id, title);
}

/** Also stops that project's studio — a removed project's dev server has
 *  nothing left to serve, and the port leak Theme C's own doc names is
 *  exactly this: a studio nothing calls `stopStudio` on before its folder
 *  disappears out from under it. */
export async function removeVideoProject(id: string): Promise<GitOpResult> {
  const root = await requireRoot();
  if (!root.ok) return root;
  stopStudio(id);
  return removeProject(root.value, id);
}

export async function listVideoOutputFiles(projectId: string) {
  const root = await requireRoot();
  if (!root.ok) return [];
  return listOutputFiles(root.value, projectId);
}

export async function listVideoProjectFiles(
  projectId: string,
  area: 'assets' | 'input' | 'output',
): Promise<VideoFileEntry[]> {
  const root = await requireRoot();
  if (!root.ok) return [];
  return listAreaFiles(root.value, area, projectId);
}

export async function readVideoProjectFile(projectId: string, relPath: string): Promise<string | null> {
  const root = await requireRoot();
  if (!root.ok) return null;
  return readProjectFile(root.value, projectId, relPath);
}

type FileHandoffResult = { ok: boolean; message?: string };

async function resolveHandoffPath(
  projectId: string,
  area: 'assets' | 'input' | 'output',
  name: string,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const root = await requireRoot();
  if (!root.ok) return { ok: false, message: 'message' in root ? root.message : String(root.kind) };
  const path = await resolveAreaFilePath(root.value, area, projectId, name);
  if (path === null) return { ok: false, message: 'That file does not exist, or is outside the configured root.' };
  return { ok: true, path };
}

/** Reveal a listed file in the OS file manager (Theme E) — read-only, through Electron's `shell`. */
export async function revealVideoFile(
  projectId: string,
  area: 'assets' | 'input' | 'output',
  name: string,
): Promise<FileHandoffResult> {
  const resolved = await resolveHandoffPath(projectId, area, name);
  if (!resolved.ok) return resolved;
  shell.showItemInFolder(resolved.path);
  return { ok: true };
}

/** Open a listed file in its OS default app (Theme E) — read-only, through Electron's `shell`. */
export async function openVideoFile(
  projectId: string,
  area: 'assets' | 'input' | 'output',
  name: string,
): Promise<FileHandoffResult> {
  const resolved = await resolveHandoffPath(projectId, area, name);
  if (!resolved.ok) return resolved;
  const error = await shell.openPath(resolved.path);
  return error ? { ok: false, message: error } : { ok: true };
}

// --- studio --------------------------------------------------------------

export async function videoStudioStart(projectId: string): Promise<GitOpResult<VideoStudioStatus>> {
  const root = await requireRoot();
  if (!root.ok) return root;

  let captured: VideoStudioStatus | null = null;
  startStudio(projectId, appDirFor(root.value), {
    onStatus: (id, status) => {
      captured ??= status;
      emitStudioChanged(id, status);
    },
  });
  // `startStudio` calls `onStatus` synchronously in every one of its own
  // branches (already-active, spawn failure, or the initial `starting`) —
  // `captured` is never null by the time it returns.
  return ok(captured!);
}

export function videoStudioStop(projectId: string): GitOpResult {
  stopStudio(projectId);
  return ok();
}

export function videoStudioStatus(projectId: string): VideoStudioStatus {
  return getStudioStatus(projectId);
}

// --- renders ---------------------------------------------------------------

export async function videoRenderStart(
  projectId: string,
  compositionId: string,
): Promise<GitOpResult<VideoRender>> {
  const root = await requireRoot();
  if (!root.ok) return root;

  const appDir = appDirFor(root.value);
  const outputDir = join(root.value, 'projects', projectId, 'output');
  const existingOutputFiles = (await listOutputFiles(root.value, projectId)).map((f) => f.filename);
  const target = buildRenderCommand({
    rootDir: root.value,
    appDir,
    hasWrapper: existsSync(join(root.value, WRAPPER_REL_PATH)),
    projectId,
    compositionId,
    outputDir,
    existingOutputFiles,
  });

  const renderId = randomUUID();
  const record = queueRender({ renderId, projectId, compositionId, target }, { onProgress: emitRenderProgress });
  return ok(record);
}

export function videoRenderCancel(renderId: string): GitOpResult {
  cancelRender(renderId, { onProgress: emitRenderProgress });
  return ok();
}

export function videoRenderList(projectId: string): VideoRender[] {
  return listRenders(projectId);
}

// --- toolchain ---------------------------------------------------------------

export async function videoToolchain(): Promise<VideoToolchain> {
  const root = await requireRoot();
  return probeVideoToolchain(root.ok ? appDirFor(root.value) : undefined);
}

// --- lifecycle -----------------------------------------------------------

/** Every studio and every render's process group — called from `main/index.ts`'s
 *  `before-quit` handler (Theme H) and from `removeVideoProject`. */
export function stopAllVideoProcesses(): void {
  stopAllStudios();
  killAllRenders();
}
