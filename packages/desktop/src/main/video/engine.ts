import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import {
  VIDEO_CONFIG_FILE,
  VIDEO_ENGINES,
  VIDEO_ENGINE_INFO,
  failure,
  ok,
  parseVideoConfig,
  serializeVideoConfig,
  type GitOpResult,
  type VideoEngine,
  type VideoEngineState,
} from '@midnite/studio-shared';

/**
 * The video engine (Phase 99 Theme H) — which of Remotion / HyperFrames a
 * video root's compositions are authored and rendered with.
 *
 * Stored in the root itself, in `<root>/video.config.json`, not in app
 * settings: the choice is a property of the *workspace* (it decides which
 * editor app and which `scripts/` branch the root's own files use), so it
 * travels with the repo and a checkout on another machine opens on the same
 * engine. **A root with no config file is Remotion** — every root scaffolded
 * before this existed stays exactly as it was, and nothing here ever writes to
 * one unless the user switches engine on purpose.
 */

export function engineAppDir(root: string, engine: VideoEngine): string {
  return join(root, VIDEO_ENGINE_INFO[engine].appDir);
}

export async function readVideoEngine(root: string): Promise<VideoEngine> {
  const text = await readFile(join(root, VIDEO_CONFIG_FILE), 'utf8').catch(() => null);
  return parseVideoConfig(text).engine;
}

/** Atomic (temp + rename) so a crash mid-write cannot leave a half-written config that reads as Remotion. */
export async function writeVideoEngine(root: string, engine: VideoEngine): Promise<void> {
  const target = join(root, VIDEO_CONFIG_FILE);
  const temp = `${target}.tmp`;
  await writeFile(temp, serializeVideoConfig({ engine }), 'utf8');
  await rename(temp, target);
}

/** `npm install` has not run in the engine's editor app yet. */
export function engineNeedsInstall(root: string, engine: VideoEngine): boolean {
  return !existsSync(join(engineAppDir(root, engine), 'node_modules'));
}

export function engineState(root: string | null, engine: VideoEngine): VideoEngineState {
  if (!root) return { root: null, engine, needsInstall: false, appDir: null };
  return { root, engine, needsInstall: engineNeedsInstall(root, engine), appDir: engineAppDir(root, engine) };
}

/** Every engine's editor app directory *except* `engine`'s — what a scaffold leaves out. */
export function otherEngineDirs(engine: VideoEngine): string[] {
  return VIDEO_ENGINES.filter((e) => e !== engine).map((e) => VIDEO_ENGINE_INFO[e].appDir);
}

/**
 * Make `engine` the root's engine: copy its editor app from the template when
 * the root does not have one yet (never overwriting — a root's own edits to an
 * app dir it already has are the user's), then record the choice. The *other*
 * engine's app is left on disk, so switching back is instant and loses nothing.
 */
export async function switchVideoEngine(
  templateDir: string,
  root: string,
  engine: VideoEngine,
): Promise<GitOpResult<VideoEngineState>> {
  if (!existsSync(join(root, 'projects'))) {
    return failure(`${root} is not a video workspace (no projects/ folder).`);
  }
  const appDirName = VIDEO_ENGINE_INFO[engine].appDir;
  const appDir = join(root, appDirName);
  try {
    if (!existsSync(appDir)) {
      const source = join(templateDir, appDirName);
      if (!existsSync(source)) {
        return failure(`The ${VIDEO_ENGINE_INFO[engine].label} template is missing from this build (${source}).`);
      }
      await cp(source, appDir, { recursive: true, force: false });
    }
    // The engine's example composition rides along with its app dir (it lives
    // inside it), and the shared project folders are engine-neutral — nothing
    // else in the root needs to change.
    await mkdir(root, { recursive: true });
    await writeVideoEngine(root, engine);
  } catch (error) {
    await rm(`${join(root, VIDEO_CONFIG_FILE)}.tmp`, { force: true }).catch(() => undefined);
    return failure(error instanceof Error ? error.message : String(error));
  }
  return ok(engineState(root, engine));
}

/** The folder a HyperFrames project's composition lives in — mirrors the project's own id path. */
export function hyperframesProjectDir(appDir: string, projectId: string): string | null {
  const base = join(appDir, 'projects');
  const dir = resolve(base, projectId);
  return dir === base || !dir.startsWith(`${base}${sep}`) ? null : dir;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A minimal, valid composition (title card, 5s) — enough for Studio to open and for an agent to build on. */
export function hyperframesStubComposition(compositionId: string, title: string): string {
  const id = escapeHtml(compositionId);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0a0a0a; }
      #root { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      #title { color: #fff; font-size: 120px; font-weight: 600; letter-spacing: -0.03em; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${id}" data-start="0" data-duration="5" data-width="1920" data-height="1080">
      <h1 id="title" class="clip" data-start="0" data-duration="5" data-track-index="0">${escapeHtml(title)}</h1>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 0);
      window.__timelines["${id}"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

/**
 * HyperFrames needs a composition folder per project; a project made (or a
 * root switched over) before one exists gets a stub on first Studio/render,
 * never overwriting an `index.html` that is already there.
 */
export async function ensureHyperframesComposition(
  appDir: string,
  projectId: string,
  compositionId: string,
  title: string,
): Promise<GitOpResult<string>> {
  const dir = hyperframesProjectDir(appDir, projectId);
  if (dir === null) return failure('That project id is not valid.');
  const entry = join(dir, 'index.html');
  if (!existsSync(entry)) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(entry, hyperframesStubComposition(compositionId, title), { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }
  return ok(dir);
}
