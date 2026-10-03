import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { shell, type BrowserWindow } from 'electron';

import {
  EVENT_CHANNELS,
  failure,
  ok,
  type GitOpResult,
  type VideoEngine,
  type VideoEngineState,
  type VideoProject,
  type VideoRender,
  type VideoRenderOptions,
  type VideoRootResolution,
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
  type VideoFileArea,
  type VideoFileEntry,
} from './video/project-discovery';
import {
  engineAppDir,
  engineNeedsInstall,
  engineState,
  ensureHyperframesComposition,
  readVideoEngine,
  switchVideoEngine,
} from './video/engine';
import { resolveVideoRoot } from './video/root-resolution';
import { scaffoldVideoWorkspace } from './video/scaffold';
import { nullProjectsStore, type ProjectsStore } from './video/projects-store';
import { migrateVideoSkills } from './video/skills-migrate';
import { probeVideoSkills, probeVideoToolchain } from './video/toolchain';
import { getStudioStatus, startStudio, stopStudio, stopAllStudios } from './video/studio-service';
import { buildRenderCommand, cancelRender, killAllRenders, listRenders, queueRender } from './video/render-service';

/**
 * Video Studio (Phase 44 Theme H) — the orchestration layer between the IPC
 * handlers and the five main-process modules Themes B/C/E already built,
 * mirroring `workflow-service.ts`'s own split: module-level state plus a
 * `getWindow` thunk, configured once from `main/index.ts`.
 *
 * **One editor app serves every project** (Remotion's `video-editor/` or, since
 * Phase 99 Theme H, HyperFrames' `hyperframes-editor/` — whichever
 * `video.config.json` names; no config = Remotion). The Remotion layout is: `~/Dev/ekko-videos` is the
 * reference layout this mirrors exactly: `<root>/video-editor` is the single
 * Remotion app (studio and the render fallback both run there), `<root>/
 * projects/<id>/` is one project's own folder, and `<root>/scripts/
 * render.mjs`, when present, is the wrapper `buildRenderCommand` prefers.
 */
const WRAPPER_REL_PATH = 'scripts/render.mjs';

let store: ProjectsStore = nullProjectsStore;
let getWindowThunk: () => BrowserWindow | null = () => null;
let videoRoot: string | null = null;
let rootLoading: Promise<void> | null = null;
/**
 * Phase 99 Theme D — the active repo's path, as last reported through
 * `mstudio:video:root-resolve`. Every op reads `effectiveRoot()`, so the
 * existing `mstudio:video:*` channels keep their global shape while the Video
 * tab follows the open repo. `null` = no repo, only the global root applies.
 */
let activeRepoPath: string | null = null;

export function configureVideo(nextStore: ProjectsStore, getWindow: () => BrowserWindow | null): void {
  store = nextStore;
  getWindowThunk = getWindow;
  videoRoot = null;
  rootLoading = null;
  activeRepoPath = null;
}

/**
 * In-repo layout → `<repo>/.midnite/media/video` → the global setting, plus the
 * root's engine (Phase 99 Theme H — `video.config.json`, absent = Remotion).
 */
export async function currentVideoRootResolution(): Promise<VideoRootResolution> {
  await ensureRootLoaded();
  const resolution = resolveVideoRoot({ repoPath: activeRepoPath, globalRoot: videoRoot });
  if (!resolution.root) return resolution;
  return { ...resolution, engine: await readVideoEngine(resolution.root) };
}

/** Adopt `repoPath` as the active repo for resolution, then report where the root landed. */
export async function resolveVideoRootFor(repoPath: string | null): Promise<VideoRootResolution> {
  activeRepoPath = repoPath;
  return currentVideoRootResolution();
}

/** The root every op runs against — resolved, not just the global setting. */
export async function effectiveVideoRoot(): Promise<string | null> {
  return (await currentVideoRootResolution()).root;
}

/**
 * Setup Video: scaffold the checked-in template into `<repo>/.midnite/media/video`
 * and adopt it. The renderer then runs `npm install` in a visible terminal.
 */
export async function setupVideoWorkspace(
  repoPath: string,
  templateDir: string,
  engine: VideoEngine = 'remotion',
): Promise<GitOpResult<VideoRootResolution>> {
  activeRepoPath = repoPath;
  const target = (await currentVideoRootResolution()).setupTarget;
  if (!target) return failure('Open a repository first.');
  const scaffolded = await scaffoldVideoWorkspace(templateDir, target, engine);
  if (!scaffolded.ok) return scaffolded;
  return ok(await currentVideoRootResolution());
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

/**
 * Read / switch a root's engine (Phase 99 Theme H). `active` is the root the
 * Video tab resolved; `global` is Settings ▸ Media's own root, addressed
 * without re-adopting a repo. Switching copies the engine's editor app in when
 * the root lacks it, records the choice, and stops running studios — they are
 * engine-specific processes — leaving the other engine's app on disk.
 */
async function engineTargetRoot(target: 'active' | 'global'): Promise<string | null> {
  if (target === 'global') {
    await ensureRootLoaded();
    return videoRoot;
  }
  return effectiveVideoRoot();
}

export async function videoEngineGet(target: 'active' | 'global'): Promise<VideoEngineState> {
  const root = await engineTargetRoot(target);
  if (!root) return engineState(null, 'remotion');
  return engineState(root, await readVideoEngine(root));
}

export async function videoEngineSet(
  target: 'active' | 'global',
  engine: VideoEngine,
  templateDir: string,
): Promise<GitOpResult<VideoEngineState>> {
  const root = await engineTargetRoot(target);
  if (!root) return failure('Set up Video for this repo, or configure a video root in Settings.');
  const switched = await switchVideoEngine(templateDir, root, engine);
  if (switched.ok) stopAllStudios();
  return switched;
}

/** The engine's editor app for the root every op runs against. */
async function requireEngineRoot(): Promise<GitOpResult<{ root: string; engine: VideoEngine; appDir: string }>> {
  const root = await requireRoot();
  if (!root.ok) return root;
  const engine = await readVideoEngine(root.value);
  return ok({ root: root.value, engine, appDir: engineAppDir(root.value, engine) });
}

/**
 * HyperFrames only: its CLI is a dev-dependency of the editor app, and a
 * project needs its own composition folder. `npx` without the install would go
 * and download the package silently on every start, so a missing install is
 * reported instead, with the command that fixes it.
 */
async function prepareHyperframesProject(
  ctx: { root: string; appDir: string },
  projectId: string,
): Promise<GitOpResult> {
  if (engineNeedsInstall(ctx.root, 'hyperframes')) {
    return failure('HyperFrames is not installed yet — run `npm install` in hyperframes-editor/ first.');
  }
  const project = await getProject(ctx.root, projectId);
  if (!project) return failure('That project does not exist.');
  const composition = project.valid ? project.composition : projectId;
  const title = project.valid ? project.title : projectId;
  const ensured = await ensureHyperframesComposition(ctx.appDir, projectId, composition, title);
  return ensured.ok ? ok() : ensured;
}

async function requireRoot(): Promise<GitOpResult<string>> {
  const root = await effectiveVideoRoot();
  if (!root) return failure('Set up Video for this repo, or configure a video root in Settings.');
  return ok(root);
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
  area: VideoFileArea,
  recursive = false,
): Promise<VideoFileEntry[]> {
  const root = await requireRoot();
  if (!root.ok) return [];
  return listAreaFiles(root.value, area, projectId, { recursive });
}

export async function readVideoProjectFile(projectId: string, relPath: string): Promise<string | null> {
  const root = await requireRoot();
  if (!root.ok) return null;
  return readProjectFile(root.value, projectId, relPath);
}

type FileHandoffResult = { ok: boolean; message?: string };

/** Also the Media export service's `video` source arm (Phase 99 Theme D). */
export async function resolveHandoffPath(
  projectId: string,
  area: VideoFileArea,
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
  area: VideoFileArea,
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
  area: VideoFileArea,
  name: string,
): Promise<FileHandoffResult> {
  const resolved = await resolveHandoffPath(projectId, area, name);
  if (!resolved.ok) return resolved;
  const error = await shell.openPath(resolved.path);
  return error ? { ok: false, message: error } : { ok: true };
}

// --- studio --------------------------------------------------------------

export async function videoStudioStart(projectId: string): Promise<GitOpResult<VideoStudioStatus>> {
  const ctx = await requireEngineRoot();
  if (!ctx.ok) return ctx;
  if (ctx.value.engine === 'hyperframes') {
    const ready = await prepareHyperframesProject(ctx.value, projectId);
    if (!ready.ok) return ready;
  }

  let captured: VideoStudioStatus | null = null;
  startStudio(projectId, ctx.value.appDir, {
    engine: ctx.value.engine,
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
  options?: VideoRenderOptions,
): Promise<GitOpResult<VideoRender>> {
  const ctx = await requireEngineRoot();
  if (!ctx.ok) return ctx;
  const { root: rootDir, engine, appDir } = ctx.value;
  if (engine === 'hyperframes') {
    const ready = await prepareHyperframesProject(ctx.value, projectId);
    if (!ready.ok) return ready;
  }
  const outputDir = join(rootDir, 'projects', projectId, 'output');
  // Every name in output/, not just `vN-label.mp4` — an unlabelled `v2.mp4` or
  // a webm iteration still holds its version number.
  const existingOutputFiles = (await listAreaFiles(rootDir, 'output', projectId)).map((f) => f.name);
  const target = buildRenderCommand({
    rootDir: rootDir,
    appDir,
    hasWrapper: existsSync(join(rootDir, WRAPPER_REL_PATH)),
    projectId,
    compositionId,
    outputDir,
    existingOutputFiles,
    engine,
    ...(options ? { options } : {}),
  });

  const renderId = randomUUID();
  const record = queueRender(
    { renderId, projectId, compositionId, target },
    { onProgress: emitRenderProgress, engine },
  );
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
  const engine = root.ok ? await readVideoEngine(root.value) : 'remotion';
  // Bring a root scaffolded before the `midnite-media-video-*` rename forward (never deletes edits).
  if (root.ok) await migrateVideoSkills(root.value);
  const [toolchain, skills] = await Promise.all([
    probeVideoToolchain(root.ok ? engineAppDir(root.value, engine) : undefined, {}, engine),
    probeVideoSkills(root.ok ? root.value : undefined),
  ]);
  return { ...toolchain, skills };
}

// --- lifecycle -----------------------------------------------------------

/** Every studio and every render's process group — called from `main/index.ts`'s
 *  `before-quit` handler (Theme H) and from `removeVideoProject`. */
export function stopAllVideoProcesses(): void {
  stopAllStudios();
  killAllRenders();
}
